import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { normalizeNexumToolRequest, type PermissionPort } from "../src/index.ts"
import { createNexumCodingLoop, createNexumSessionService } from "./test-ports.ts"
import { createNexumToolRegistry } from "../../nexum-application/src/index.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("registers read, write/edit, and shell tools with normalized permission resources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-tools-"))
  temporaryDirectories.push(directory)
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const registry = createNexumToolRegistry({ sessions })

  expect(registry.names).toEqual(["read", "write", "edit", "shell"])
  expect(normalizeNexumToolRequest(session.sessionID, "read", { path: "README.md" })).toMatchObject({
    action: "read",
    resource: "README.md",
  })
  expect(
    normalizeNexumToolRequest(session.sessionID, "edit", { path: "README.md", content: "updated" }),
  ).toMatchObject({
    action: "write",
    resource: "README.md",
  })
  expect(normalizeNexumToolRequest(session.sessionID, "shell", { command: "echo ok" })).toMatchObject({
    action: "shell",
    resource: "echo ok",
  })
})

test("normalizes local function calls into the local.call permission action", async () => {
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory: process.cwd() })

  expect(normalizeNexumToolRequest(session.sessionID, "local__local_tools__echo", { value: "hello" })).toMatchObject({
    action: "local.call",
    resource: "local__local_tools__echo",
  })
})

test("exposes Nexum-managed Skill registry operations without shell discovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-skill-tool-"))
  temporaryDirectories.push(directory)
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const calls: Array<{ operation: string; input: Record<string, unknown> }> = []
  const skill = {
    id: "metric-view-lifecycle",
    name: "Metric View Lifecycle",
    description: "test skill",
    digest: "digest",
    fileCount: 1,
    files: ["SKILL.md"],
    status: "ready" as const,
    diagnostics: [],
  }
  const skillRegistry = {
    async register(address: string) {
      calls.push({ operation: "register", input: { address } })
      return skill
    },
    async refresh(id?: string) {
      calls.push({ operation: "refresh", input: id ? { id } : {} })
    },
    async list() {
      calls.push({ operation: "list", input: {} })
      return [skill]
    },
    async get() {
      return undefined
    },
    async unregister(id: string) {
      calls.push({ operation: "unregister", input: { id } })
    },
  }
  const registry = createNexumToolRegistry({ sessions, skillRegistry })

  expect(registry.names).toContain("skill_registry")
  expect(normalizeNexumToolRequest(session.sessionID, "skill_registry", {
    operation: "register",
    address: "/workspace/skills/metric-view-lifecycle",
  })).toMatchObject({ action: "skill.manage", resource: "/workspace/skills/metric-view-lifecycle" })
  expect(normalizeNexumToolRequest(session.sessionID, "skill_registry", { operation: "list" })).toMatchObject({
    action: "skill.read",
    resource: "skills",
  })
  expect(normalizeNexumToolRequest(session.sessionID, "skill_registry", { operation: "unregister", id: skill.id })).toMatchObject({
    action: "skill.manage",
    resource: skill.id,
  })

  const registered = await registry.port.execute(normalizeNexumToolRequest(session.sessionID, "skill_registry", {
    operation: "register",
    address: "/workspace/skills/metric-view-lifecycle",
  }))
  const detailed = await registry.port.execute(normalizeNexumToolRequest(session.sessionID, "skill_registry", {
    operation: "detail",
    id: skill.id,
  }))
  const removed = await registry.port.execute(normalizeNexumToolRequest(session.sessionID, "skill_registry", {
    operation: "unregister",
    id: skill.id,
  }))

  expect(registered).toEqual({ ok: true, output: JSON.stringify(skill) })
  expect(detailed).toEqual({ ok: true, output: JSON.stringify(skill) })
  expect(removed).toEqual({ ok: true, output: JSON.stringify({ id: skill.id, deleted: true }) })
  expect(calls.map((call) => call.operation)).toEqual(["register", "list", "unregister"])
})

test("requires the Skill management permission action for mutating operations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-skill-permission-"))
  temporaryDirectories.push(directory)
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const requests: Array<{ action: string; resource: string }> = []
  const registry = createNexumToolRegistry({
    sessions,
    skillRegistry: {
      async register() { return { id: "skill", name: "skill", description: "", digest: "", fileCount: 1, files: ["SKILL.md"], status: "ready", diagnostics: [] } },
      async refresh() {},
      async list() { return [] },
      async get() { return undefined },
      async unregister() {},
    },
  })

  const permission = {
    async evaluate(request: Parameters<PermissionPort["evaluate"]>[0]) {
      requests.push({ action: request.action, resource: request.resource })
      return "allow" as const
    },
  }

  await createNexumCodingLoop({
    model: {
      async *prompt(input) {
        if (input.toolResults?.length) {
          yield { type: "completed" }
          return
        }
        yield { type: "tool-call", toolName: "skill_registry", toolInput: { operation: "register", address: "/tmp/skill" } }
        yield { type: "completed" }
      },
    },
    tool: registry.port,
    permission,
    sessions,
    events: { async publish() {} },
    tools: registry.definitions,
  }).run({ sessionID: session.sessionID, text: "注册 Skill" })

  expect(requests[0]).toEqual({ action: "skill.manage", resource: "/tmp/skill" })
})

test("executes registered file tools inside the session directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-tools-"))
  temporaryDirectories.push(directory)
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const registry = createNexumToolRegistry({ sessions })

  const write = await registry.port.execute(
    normalizeNexumToolRequest(session.sessionID, "write", { path: "notes.txt", content: "hello" }),
  )
  const read = await registry.port.execute(
    normalizeNexumToolRequest(session.sessionID, "read", { path: "notes.txt" }),
  )
  const shell = await registry.port.execute(
    normalizeNexumToolRequest(session.sessionID, "shell", { command: "printf ok" }),
  )

  expect(write).toEqual({ ok: true, output: "" })
  expect(read).toEqual({ ok: true, output: "hello" })
  expect(shell).toEqual({ ok: true, output: "ok" })
})

test("rejects file resources that escape the session directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-tools-"))
  temporaryDirectories.push(directory)
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const registry = createNexumToolRegistry({ sessions })

  const result = await registry.port.execute(
    normalizeNexumToolRequest(session.sessionID, "read", { path: "../outside.txt" }),
  )

  expect(result.ok).toBe(false)
  expect(result.output).toBe("工具资源必须位于 Session 工作目录内")
})
