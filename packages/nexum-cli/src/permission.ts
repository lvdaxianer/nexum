/** 权限策略命令组:list / allow / deny / remove / mode,一次性命令与 REPL /permissions 共享实现。 */

import { NexumClientError, type NexumPermissionPolicyList, type NexumPermissionPolicyRule } from "@nexum/client"
import { displayWidth, paint, type TermCaps } from "./term"
import { truncateFrame, type CliIO } from "./io"
import type { NexumClient } from "./commands"

const ACTIONS = ["*", "shell", "read", "write", "edit"] as const

function effectColor(effect: string): "green" | "yellow" | "red" {
  if (effect === "allow") return "green"
  if (effect === "deny") return "red"
  return "yellow"
}

/** 当前模式只认 global 作用域的通配规则:session 通配是单会话例外,不代表全局模式。 */
function wildcardOf(list: NexumPermissionPolicyList): NexumPermissionPolicyRule | undefined {
  return list.rules.find((rule) => rule.action === "*" && rule.resource === "*" && rule.scope === "global")
}

/** 输入框右侧状态段:通配规则决定当前模式,缺失即 ask;规则数非零时追加计数。 */
export function permissionStatusText(caps: TermCaps, list: NexumPermissionPolicyList): string {
  const mode = wildcardOf(list)?.effect ?? "ask"
  const count = list.rules.length > 0 ? paint(caps, "dim", ` · ${list.rules.length} 规则`) : ""
  return `${paint(caps, "dim", "权限:")}${paint(caps, effectColor(mode), mode)}${count}`
}

export async function cmdPermissionList(client: NexumClient, io: CliIO): Promise<void> {
  const list = (await client.experimental.nexum.permissionPolicy.list()).data
  io.line(paint(io.caps, "dim", `权限规则(默认策略:${list.defaultEffect} 询问 · 未命中规则时逐次询问)`))
  if (list.rules.length === 0) {
    io.line(paint(io.caps, "dim", "暂无规则,全部操作逐次询问"))
    return
  }
  // 范围列超宽截断(长 shell 命令不再撑爆表格),ID 列兜底 40;列宽按截断后的显示宽度自适应,各行对齐
  const rows = list.rules.map((rule) => ({
    id: truncateFrame(rule.id, 40),
    action: rule.action,
    resource: truncateFrame(rule.resource, 32),
    effect: rule.effect,
    scope: rule.scope === "session" && rule.sessionID ? `session (${rule.sessionID.slice(0, 8)})` : rule.scope,
    updatedAt: rule.updatedAt.slice(0, 16).replace("T", " "),
    marker: rule.action === "*" && rule.resource === "*" && rule.scope === "global",
  }))
  const idWidth = Math.max(10, ...rows.map((row) => displayWidth(row.id) + 2))
  const resourceWidth = Math.max(14, ...rows.map((row) => displayWidth(row.resource) + 2))
  const cell = (text: string, width: number) => text + " ".repeat(Math.max(1, width - displayWidth(text)))
  io.line(paint(io.caps, "dim", `${cell("ID", idWidth)}${cell("动作", 8)}${cell("范围", resourceWidth)}${cell("效果", 8)}${cell("作用域", 9)}${cell("更新于", 16)}`))
  for (const row of rows) {
    const marker = row.marker ? ` ${paint(io.caps, "dim", "← 当前模式")}` : ""
    const effect = paint(io.caps, effectColor(row.effect), row.effect.padEnd(8))
    io.line(`${cell(row.id, idWidth)}${cell(row.action, 8)}${cell(row.resource, resourceWidth)}${effect}${cell(row.scope, 9)}${row.updatedAt}${marker}`)
  }
  io.line(paint(io.caps, "dim", "评估顺序:session 规则优先于 global · deny 优先于 allow · 危险 shell 的 allow 需精确匹配"))
}

export async function cmdPermissionSet(client: NexumClient, io: CliIO, effect: "allow" | "deny", action: string | undefined, resource: string | undefined): Promise<number> {
  if (!action || !(ACTIONS as readonly string[]).includes(action)) {
    io.line(paint(io.caps, "red", `非法动作:${action ?? "(缺失)"} · 可用 ${ACTIONS.join("|")}`))
    return 2
  }
  const rule = (await client.experimental.nexum.permissionPolicy.create({ action, resource: resource ?? "*", effect, scope: "global" })).data
  io.line(`${paint(io.caps, "green", "✓")} 已添加规则 ${rule.id}  ${rule.action} · ${rule.resource} · ${paint(io.caps, effectColor(rule.effect), rule.effect)} · ${rule.scope}`)
  return 0
}

export async function cmdPermissionRemove(client: NexumClient, io: CliIO, ruleID: string): Promise<number> {
  try {
    await client.experimental.nexum.permissionPolicy.remove({ ruleID })
  } catch (error) {
    if (error instanceof NexumClientError && error.status === 404) {
      io.line(paint(io.caps, "red", `规则不存在: ${ruleID}`))
      return 1
    }
    throw error
  }
  io.line(`${paint(io.caps, "green", "✓")} 已删除规则 ${ruleID}`)
  return 0
}

export async function cmdPermissionMode(client: NexumClient, io: CliIO, mode: string | undefined): Promise<number> {
  if (mode !== "allow" && mode !== "ask") {
    io.line(paint(io.caps, "red", `非法模式:${mode ?? "(缺失)"} · 可用 allow|ask`))
    return 2
  }
  const list = (await client.experimental.nexum.permissionPolicy.list()).data
  const wildcard = wildcardOf(list)
  if (mode === "allow") {
    if (wildcard) {
      if (wildcard.effect === "allow") {
        io.line(paint(io.caps, "dim", "已是 allow 模式"))
        return 0
      }
      // 服务器重复判定含 effect:已有 deny/ask 通配时 create 会落第二条冲突通配且 deny 优先,必须原地更新
      await client.experimental.nexum.permissionPolicy.update({ ruleID: wildcard.id, effect: "allow" })
      io.line(`${paint(io.caps, "green", "✓")} 权限模式已切换 ${wildcard.effect} → allow(危险操作仍会询问)`)
      return 0
    }
    try {
      await client.experimental.nexum.permissionPolicy.create({ action: "*", resource: "*", effect: "allow", scope: "global" })
    } catch (error) {
      // 仅兜并发竞态:预查与创建之间另一条通配已落库
      if (error instanceof NexumClientError && error.status === 409) {
        io.line(paint(io.caps, "dim", "已是 allow 模式"))
        return 0
      }
      throw error
    }
    io.line(`${paint(io.caps, "green", "✓")} 权限模式已切换 ask → allow(危险操作仍会询问)`)
    return 0
  }
  if (!wildcard) {
    io.line(paint(io.caps, "dim", "已是 ask 模式"))
    return 0
  }
  await client.experimental.nexum.permissionPolicy.remove({ ruleID: wildcard.id })
  io.line(`${paint(io.caps, "green", "✓")} 权限模式已切换 ${wildcard.effect} → ask`)
  return 0
}

export async function cmdPermission(client: NexumClient, io: CliIO, args: readonly string[]): Promise<number> {
  const [sub, ...rest] = args
  if (!sub || sub === "list") return cmdPermissionList(client, io).then(() => 0)
  if (sub === "allow" || sub === "deny") return cmdPermissionSet(client, io, sub, rest[0], rest[1])
  if (sub === "remove" && rest[0]) return cmdPermissionRemove(client, io, rest[0])
  if (sub === "mode") return cmdPermissionMode(client, io, rest[0])
  io.line(paint(io.caps, "red", `未知权限命令:${args.join(" ")} · 用法 permission list|allow <动作> [范围]|deny <动作> [范围]|remove <id>|mode allow|ask`))
  return 2
}
