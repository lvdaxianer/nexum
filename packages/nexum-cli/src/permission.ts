/** 权限策略命令组:list / allow / deny / remove / mode,一次性命令与 REPL /permissions 共享实现。 */

import { NexumClientError, type NexumPermissionPolicyList, type NexumPermissionPolicyRule } from "@nexum/client"
import { paint, type TermCaps } from "./term"
import type { CliIO } from "./io"
import type { NexumClient } from "./commands"

const ACTIONS = ["*", "shell", "read", "write", "edit"] as const

function effectColor(effect: string): "green" | "yellow" | "red" {
  if (effect === "allow") return "green"
  if (effect === "deny") return "red"
  return "yellow"
}

function wildcardOf(list: NexumPermissionPolicyList): NexumPermissionPolicyRule | undefined {
  return list.rules.find((rule) => rule.action === "*" && rule.resource === "*")
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
  io.line(paint(io.caps, "dim", "ID        动作    范围          效果    作用域   更新于"))
  // 服务器生成的规则 ID 可能远长于表头(如 hpr_<uuid>),按实际最长 ID 对齐
  const idWidth = Math.max(10, ...list.rules.map((rule) => rule.id.length + 2))
  for (const rule of list.rules) {
    const scope = rule.scope === "session" && rule.sessionID ? `session (${rule.sessionID.slice(0, 8)})` : rule.scope
    const marker = rule.action === "*" && rule.resource === "*" ? ` ${paint(io.caps, "dim", "← 当前模式")}` : ""
    const effect = paint(io.caps, effectColor(rule.effect), rule.effect.padEnd(8))
    io.line(`${rule.id.padEnd(idWidth)}${rule.action.padEnd(8)}${rule.resource.padEnd(14)}${effect}${scope.padEnd(9)}${rule.updatedAt.slice(0, 16).replace("T", " ")}${marker}`)
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
    if (wildcard?.effect === "allow") {
      io.line(paint(io.caps, "dim", "已是 allow 模式"))
      return 0
    }
    try {
      await client.experimental.nexum.permissionPolicy.create({ action: "*", resource: "*", effect: "allow", scope: "global" })
    } catch (error) {
      if (error instanceof NexumClientError && error.status === 409) {
        io.line(paint(io.caps, "dim", "已是 allow 模式"))
        return 0
      }
      throw error
    }
    io.line(`${paint(io.caps, "green", "✓")} 权限模式已切换 ${wildcard?.effect ?? "ask"} → allow(危险操作仍会询问)`)
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
