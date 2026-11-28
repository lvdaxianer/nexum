import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Nexum } from "@nexum/client"
import { cmdDoctor, cmdMcpList, cmdModelGet, cmdModelProbe, cmdModelSet, cmdRolePromptGet, cmdSkillList, cmdSkillRemove, cmdStatus, cmdTheme } from "../src/admin.ts"
import { memoryIO } from "../src/io.ts"

const meta = { protocolVersion: "nexum.runtime.v1", traceId: "trace_test" } as const

function fakeClient(handler: (request: Request) => unknown) {
  return Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      return Response.json({ data: handler(request), meta })
    },
  })
}

test("cmdModelGet prints config with credentialConfigured only", async () => {
  const io = memoryIO()
  const client = fakeClient(() => ({ baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2", credentialConfigured: true, credentialRef: "env:MOONSHOT_API_KEY" }))
  await cmdModelGet(client, io)
  const out = io.plain()
  expect(out).toContain("https://api.moonshot.cn/v1")
  expect(out).toContain("kimi-k2")
  expect(out).toContain("已配置")
  expect(out).toContain("env:MOONSHOT_API_KEY")
})

test("cmdModelSet prompts with current defaults and never echoes credential", async () => {
  const io = memoryIO()
  const bodies: string[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      if (request.method === "PUT") bodies.push(await request.text())
      return Response.json({ data: { baseUrl: "https://a", model: "m", credentialConfigured: true }, meta })
    },
  })
  const answers = ["https://a", "m", "sk-secret"]
  await cmdModelSet(client, io, async () => answers.shift()!)
  expect(bodies[0]).toContain("sk-secret")
  expect(io.plain()).not.toContain("sk-secret")
  expect(io.plain()).toContain("模型配置已保存")
})

test("cmdModelProbe prints pass/skipped per channel", async () => {
  const io = memoryIO()
  const client = fakeClient(() => ({ text: "pass", functionCalling: "skipped" }))
  await cmdModelProbe(client, io)
  const out = io.plain()
  expect(out).toContain("文本通道")
  expect(out).toContain("pass")
  expect(out).toContain("skipped")
})

test("cmdRolePromptGet prints source and 60-char summary", async () => {
  const io = memoryIO()
  const client = fakeClient(() => ({ prompt: "你是 Nexum coding agent,回答使用中文。", source: "custom", updatedAt: "2026-11-20T00:00:00Z" }))
  await cmdRolePromptGet(client, io)
  const out = io.plain()
  expect(out).toContain("custom")
  expect(out).toContain("你是 Nexum coding agent")
})

test("cmdSkillList colors status and cmdMcpList maps protocol statuses", async () => {
  const io = memoryIO()
  const skills = fakeClient(() => [
    { id: "tdd", name: "tdd", description: "测试驱动", digest: "d", fileCount: 8, files: [], status: "ready", diagnostics: [] },
    { id: "broken", name: "broken", description: "坏 manifest", digest: "d", fileCount: 3, files: [], status: "invalid", diagnostics: ["missing description"] },
  ])
  await cmdSkillList(skills, io)
  expect(io.plain()).toContain("ready")
  expect(io.plain()).toContain("invalid")

  const io2 = memoryIO()
  const mcp = fakeClient(() => [
    { id: "filesystem", name: "filesystem", status: "connected", url: "stdio:npx fs-server" },
    { id: "github", name: "github", status: "needs_auth" },
    { id: "legacy", name: "legacy", status: "failed", error: { code: "ECONNREFUSED", message: "refused" } },
  ])
  await cmdMcpList(mcp, io2)
  const out = io2.plain()
  expect(out).toContain("connected")
  expect(out).toContain("needs_auth")
  expect(out).toContain("ECONNREFUSED")
})

test("cmdSkillRemove deletes a built-in Skill source through the dedicated endpoint", async () => {
  const io = memoryIO()
  const requests: Request[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      requests.push(new Request(typeof input === "string" ? input : input.toString(), init))
      return Response.json({ data: { id: "builtin-skill", deleted: true, sourceDeleted: true }, meta })
    },
  })

  await cmdSkillRemove(client, io, "builtin-skill")

  expect(requests[0]?.url).toBe("http://nexum.test/api/nexum/skills/builtin-skill/source")
  expect(requests[0]?.method).toBe("DELETE")
  expect(io.plain()).toContain("已删除")
})

test("cmdTheme writes config and notes next-launch effect", async () => {
  const io = memoryIO()
  const file = join(tmpdir(), `nexum-cli-theme-${Date.now()}.json`)
  await cmdTheme(io, ["light"], file)
  expect(io.plain()).toContain("light")
  expect(io.plain()).toContain("下次启动生效")
  const io2 = memoryIO()
  await cmdTheme(io2, [], file)
  expect(io2.plain()).toContain("light")
})

test("cmdStatus prints server, model, theme and inventory overview", async () => {
  const io = memoryIO()
  const client = fakeClient((request) => {
    const url = request.url
    if (url.includes("/capabilities")) return { capabilities: [] }
    if (url.includes("/model")) return { baseUrl: "https://a", model: "kimi-k2", credentialConfigured: true }
    if (url.includes("/session")) return [{ id: "s1", name: "n", directory: "/tmp", status: "idle", createdAt: "", updatedAt: "2026-11-24T10:00:00Z" }]
    if (url.includes("/skills")) return [{ id: "tdd", name: "tdd", description: "", digest: "d", fileCount: 1, files: [], status: "ready", diagnostics: [] }]
    if (url.includes("/mcp")) return [{ id: "fs", name: "fs", status: "connected" }]
    return {}
  })
  await cmdStatus(client, io, { baseUrl: "http://nexum.test", file: join(tmpdir(), `nexum-cli-status-${Date.now()}.json`) })
  const out = io.plain()
  expect(out).toContain("http://nexum.test")
  expect(out).toContain("已连接")
  expect(out).toContain("kimi-k2")
  expect(out).toContain("1 个")
  expect(out).toContain("1 ready")
  expect(out).toContain("1 connected")
})

test("cmdDoctor reports problems and returns 1 when any check fails", async () => {
  const io = memoryIO()
  const healthy = fakeClient((request) => {
    const url = request.url
    if (url.includes("/model/probe")) return { text: "pass", functionCalling: "pass" }
    if (url.includes("/model")) return { baseUrl: "https://a", model: "kimi-k2", credentialConfigured: true }
    if (url.includes("/skills")) return []
    if (url.includes("/mcp")) return []
    return { capabilities: [] }
  })
  expect(await cmdDoctor(healthy, io)).toBe(0)
  expect(io.plain()).toContain("✓")
  const io2 = memoryIO()
  const broken = fakeClient((request) => {
    const url = request.url
    if (url.includes("/model/probe")) return { text: "pass", functionCalling: "skipped" }
    if (url.includes("/model")) return { baseUrl: "https://a", model: "kimi-k2", credentialConfigured: true }
    if (url.includes("/skills")) return [{ id: "bad", name: "bad", description: "", digest: "d", fileCount: 1, files: [], status: "invalid", diagnostics: ["缺 description"] }]
    if (url.includes("/mcp")) return [{ id: "gh", name: "gh", status: "needs_auth" }]
    return { capabilities: [] }
  })
  expect(await cmdDoctor(broken, io2)).toBe(1)
  expect(io2.plain()).toContain("✗")
  expect(io2.plain()).toContain("needs_auth")
})
