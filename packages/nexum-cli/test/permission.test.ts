import { expect, test } from "bun:test"
import { Nexum, type NexumPermissionPolicyRule } from "@nexum/client"
import { cmdPermission, cmdPermissionList, cmdPermissionMode, cmdPermissionRemove, cmdPermissionSet, permissionStatusText } from "../src/permission.ts"
import { memoryIO } from "../src/io.ts"

const meta = { protocolVersion: "nexum.runtime.v1", traceId: "trace_test" } as const

function rule(partial: Partial<NexumPermissionPolicyRule> & Pick<NexumPermissionPolicyRule, "id" | "action" | "resource" | "effect">): NexumPermissionPolicyRule {
  return { scope: "global", createdAt: "2026-11-25T02:00:00Z", updatedAt: "2026-11-25T02:00:00Z", ...partial }
}

function policyClient(initial: NexumPermissionPolicyRule[] = []) {
  const rules = [...initial]
  const calls: { method: string; body?: unknown }[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      const text = request.method === "GET" ? "" : await request.text()
      const body = text ? (JSON.parse(text) as Record<string, string>) : undefined
      calls.push({ method: request.method, body })
      if (request.method === "GET") return Response.json({ data: { rules, defaultEffect: "ask" }, meta })
      if (request.method === "POST") {
        if (rules.some((existing) => existing.action === body!.action && existing.resource === body!.resource)) {
          return Response.json({ errorCode: "NEXUM_PERMISSION_POLICY_DUPLICATE", message: "规则已存在", traceId: "trace_test" }, { status: 409 })
        }
        const created = rule({ id: `rule_${String(rules.length + 1).padStart(3, "0")}`, action: body!.action!, resource: body!.resource!, effect: body!.effect as NexumPermissionPolicyRule["effect"] })
        rules.push(created)
        return Response.json({ data: created, meta })
      }
      if (request.method === "DELETE") {
        const id = decodeURIComponent(request.url.split("/").pop()!)
        const index = rules.findIndex((existing) => existing.id === id)
        if (index < 0) return Response.json({ errorCode: "NEXUM_PERMISSION_POLICY_NOT_FOUND", message: "规则不存在", traceId: "trace_test" }, { status: 404 })
        rules.splice(index, 1)
        return Response.json({ data: { id, deleted: true }, meta })
      }
      return Response.json({ data: {}, meta })
    },
  })
  return { client, calls, rules }
}

test("permission list renders the rules table with effect colors and the current-mode marker", async () => {
  const io = memoryIO()
  const { client } = policyClient([
    rule({ id: "rule_009", action: "*", resource: "*", effect: "allow", updatedAt: "2026-11-25T11:02:00Z" }),
    rule({ id: "rule_002", action: "read", resource: "src/**", effect: "allow", updatedAt: "2026-11-25T10:25:00Z" }),
    rule({ id: "rule_003", action: "shell", resource: "rm *", effect: "deny", scope: "session", sessionID: "session_ab12cd34ef" }),
  ])
  await cmdPermissionList(client, io)
  const out = io.plain()
  expect(out).toContain("权限规则(默认策略:ask 询问 · 未命中规则时逐次询问)")
  expect(out).toContain("ID        动作    范围          效果    作用域   更新于")
  expect(out).toContain("rule_009")
  expect(out).toContain("← 当前模式")
  expect(out).toContain("session (session_)")
  expect(out).toContain("2026-11-25 11:02")
  expect(out).toContain("评估顺序:session 规则优先于 global · deny 优先于 allow · 危险 shell 的 allow 需精确匹配")
  const colored = memoryIO({ color: "ansi16" })
  await cmdPermissionList(client, colored)
  expect(colored.output()).toContain("\x1b[32mallow")
  expect(colored.output()).toContain("\x1b[31mdeny")
})

test("permission list prints the empty state without the table", async () => {
  const io = memoryIO()
  const { client } = policyClient()
  await cmdPermissionList(client, io)
  const out = io.plain()
  expect(out).toContain("暂无规则,全部操作逐次询问")
  expect(out).not.toContain("ID        动作")
})

test("permission allow creates a global rule defaulting resource to *", async () => {
  const io = memoryIO()
  const { client, calls } = policyClient()
  expect(await cmdPermissionSet(client, io, "allow", "read", undefined)).toBe(0)
  expect(calls[0]).toEqual({ method: "POST", body: { action: "read", resource: "*", effect: "allow", scope: "global" } })
  expect(io.plain()).toContain("✓ 已添加规则 rule_001  read · * · allow · global")
})

test("permission deny rejects an invalid action with exit code 2", async () => {
  const io = memoryIO({ color: "ansi16" })
  const { client, calls } = policyClient()
  expect(await cmdPermissionSet(client, io, "deny", "network", undefined)).toBe(2)
  expect(calls).toHaveLength(0)
  expect(io.plain()).toContain("非法动作:network")
  expect(io.output()).toContain("\x1b[31m")
})

test("permission remove reports missing rules with exit code 1", async () => {
  const io = memoryIO()
  const { client } = policyClient([rule({ id: "rule_001", action: "read", resource: "*", effect: "allow" })])
  expect(await cmdPermissionRemove(client, io, "rule_404")).toBe(1)
  expect(io.plain()).toContain("规则不存在: rule_404")
  expect(await cmdPermissionRemove(client, io, "rule_001")).toBe(0)
  expect(io.plain()).toContain("✓ 已删除规则 rule_001")
})

test("permission mode allow creates the wildcard rule and is idempotent", async () => {
  const io = memoryIO()
  const { client, calls, rules } = policyClient()
  expect(await cmdPermissionMode(client, io, "allow")).toBe(0)
  expect(calls[1]).toEqual({ method: "POST", body: { action: "*", resource: "*", effect: "allow", scope: "global" } })
  expect(rules[0]).toMatchObject({ action: "*", resource: "*", effect: "allow" })
  expect(io.plain()).toContain("✓ 权限模式已切换 ask → allow(危险操作仍会询问)")
  expect(await cmdPermissionMode(client, io, "allow")).toBe(0)
  expect(io.plain()).toContain("已是 allow 模式")
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(1)
})

test("permission mode ask removes the wildcard rule and reports when already ask", async () => {
  const io = memoryIO()
  const { client, rules } = policyClient([rule({ id: "rule_009", action: "*", resource: "*", effect: "allow" })])
  expect(await cmdPermissionMode(client, io, "ask")).toBe(0)
  expect(rules).toHaveLength(0)
  expect(io.plain()).toContain("✓ 权限模式已切换 allow → ask")
  expect(await cmdPermissionMode(client, io, "ask")).toBe(0)
  expect(io.plain()).toContain("已是 ask 模式")
})

test("permission dispatcher routes subcommands and rejects unknown ones", async () => {
  const io = memoryIO()
  const { client } = policyClient()
  expect(await cmdPermission(client, io, [])).toBe(0)
  expect(io.plain()).toContain("暂无规则")
  expect(await cmdPermission(client, io, ["allow", "edit", "src/**"])).toBe(0)
  expect(await cmdPermission(client, io, ["bogus"])).toBe(2)
  expect(io.plain()).toContain("未知权限命令:bogus")
})

test("permissionStatusText derives the mode from the wildcard rule", async () => {
  const caps = { isTTY: true, color: "none", anim: false, theme: "dark" } as const
  expect(permissionStatusText(caps, { rules: [], defaultEffect: "ask" })).toBe("权限:ask")
  expect(permissionStatusText(caps, { rules: [rule({ id: "r1", action: "*", resource: "*", effect: "allow" })], defaultEffect: "ask" })).toBe("权限:allow · 1 规则")
  expect(permissionStatusText(caps, { rules: [rule({ id: "r1", action: "*", resource: "*", effect: "deny" }), rule({ id: "r2", action: "read", resource: "*", effect: "allow" })], defaultEffect: "ask" })).toBe("权限:deny · 2 规则")
  const colored = permissionStatusText({ ...caps, color: "ansi16" }, { rules: [], defaultEffect: "ask" })
  expect(colored).toContain("\x1b[33mask")
})
