import { expect, test } from "bun:test"
import { Nexum } from "@nexum/client"
import { cmdMcpList, cmdModelGet, cmdModelProbe, cmdModelSet, cmdRolePromptGet, cmdSkillList } from "../src/admin.ts"
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
