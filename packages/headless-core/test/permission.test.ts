import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createHeadlessCodingLoop,
  createHeadlessPermissionBroker,
  createHeadlessSessionService,
  type EventSink,
  type ModelPort,
  type ToolRequest,
  type ToolPort,
} from "../src/index.ts"

async function makeSession() {
  const directory = await mkdtemp(join(tmpdir(), "headless-permission-"))
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  return { directory, sessions, session }
}

function modelForTool(): ModelPort {
  return {
    async *prompt(input) {
      if (input.toolResults?.length) {
        yield { type: "completed" }
        return
      }
      yield { type: "tool-call", toolName: "read", toolInput: { path: "README.md" } }
    },
  }
}

function events(): EventSink {
  return { async publish() {} }
}

test("blocks a tool until allow_once approval and then resumes", async () => {
  const { directory, sessions, session } = await makeSession()
  const permission = createHeadlessPermissionBroker()
  let executions = 0
  const tool: ToolPort = {
    async execute() {
      executions += 1
      return { ok: true, output: "approved" }
    },
  }
  const loop = createHeadlessCodingLoop({
    model: modelForTool(),
    tool,
    permission,
    sessions,
    events: events(),
  })

  const run = loop.run({ sessionID: session.sessionID, text: "读取文件" })
  await Bun.sleep(0)
  const pending = await permission.list(session.sessionID)

  expect(pending).toHaveLength(1)
  expect(executions).toBe(0)
  await permission.reply({ sessionID: session.sessionID, requestID: pending[0]!.id, decision: "allow_once" })
  expect((await run).status).toBe("completed")
  expect(executions).toBe(1)
  expect(await permission.reply({ sessionID: session.sessionID, requestID: pending[0]!.id, decision: "deny" })).toBe(
    "allow_once",
  )

  await rm(directory, { recursive: true, force: true })
})

test("publishes a redacted permission.requested event while approval is pending", async () => {
  const { directory, sessions, session } = await makeSession()
  const permission = createHeadlessPermissionBroker()
  const published: Array<{ type: string; data?: Record<string, unknown> }> = []
  const loop = createHeadlessCodingLoop({
    model: {
      async *prompt() {
        yield { type: "tool-call", toolName: "shell", toolInput: { command: "echo api_key=secret-value" } }
      },
    },
    tool: {
      async execute() {
        return { ok: true, output: "never" }
      },
    },
    permission,
    sessions,
    events: {
      async publish(event) {
        published.push({ type: event.type, data: event.data })
      },
    },
  })

  const run = loop.run({ sessionID: session.sessionID, text: "执行命令" })
  await Bun.sleep(0)
  const pending = (await permission.list(session.sessionID))[0]!
  const requested = published.find((event) => event.type === "permission.requested")

  expect(requested?.data).toMatchObject({ requestID: pending.id, action: "shell" })
  expect(JSON.stringify(requested?.data)).not.toContain("secret-value")
  await permission.reply({ sessionID: session.sessionID, requestID: pending.id, decision: "deny" })
  await expect(run).rejects.toThrow("工具请求被拒绝")
  await rm(directory, { recursive: true, force: true })
})

test("denying a pending request fails the run without executing the tool", async () => {
  const { directory, sessions, session } = await makeSession()
  const permission = createHeadlessPermissionBroker()
  let executions = 0
  const tool: ToolPort = {
    async execute() {
      executions += 1
      return { ok: true, output: "must not run" }
    },
  }
  const loop = createHeadlessCodingLoop({
    model: modelForTool(),
    tool,
    permission,
    sessions,
    events: events(),
  })

  const run = loop.run({ sessionID: session.sessionID, text: "读取文件" })
  await Bun.sleep(0)
  const pending = (await permission.list(session.sessionID))[0]!
  await permission.reply({ sessionID: session.sessionID, requestID: pending.id, decision: "deny" })

  await expect(run).rejects.toThrow("工具请求被拒绝")
  expect(executions).toBe(0)
  expect((await sessions.get(session.sessionID))?.status).toBe("failed")

  await rm(directory, { recursive: true, force: true })
})

test("allow_always automatically approves the next matching action and resource", async () => {
  const first = await makeSession()
  const second = await makeSession()
  const permission = createHeadlessPermissionBroker()
  const executions: string[] = []
  const tool: ToolPort = {
    async execute(request) {
      executions.push(request.sessionID)
      return { ok: true, output: "approved" }
    },
  }
  const loop = (sessions: typeof first.sessions) =>
    createHeadlessCodingLoop({ model: modelForTool(), tool, permission, sessions, events: events() })

  const firstRun = loop(first.sessions).run({ sessionID: first.session.sessionID, text: "读取文件" })
  await Bun.sleep(0)
  const firstPending = (await permission.list(first.session.sessionID))[0]!
  await permission.reply({ sessionID: first.session.sessionID, requestID: firstPending.id, decision: "allow_always" })
  await firstRun

  const secondRun = loop(second.sessions).run({ sessionID: second.session.sessionID, text: "读取文件" })
  expect((await secondRun).status).toBe("completed")
  expect(executions).toEqual([first.session.sessionID, second.session.sessionID])
  expect(await permission.list(second.session.sessionID)).toEqual([])

  await rm(first.directory, { recursive: true, force: true })
  await rm(second.directory, { recursive: true, force: true })
})

test("cancelling a run also resolves its pending permission request", async () => {
  const { directory, sessions, session } = await makeSession()
  const permission = createHeadlessPermissionBroker()
  const loop = createHeadlessCodingLoop({
    model: modelForTool(),
    tool: {
      async execute() {
        return { ok: true, output: "must not run" }
      },
    },
    permission,
    sessions,
    events: events(),
  })

  const run = loop.run({ sessionID: session.sessionID, text: "读取文件" })
  await Bun.sleep(0)
  expect(await permission.list(session.sessionID)).toHaveLength(1)
  expect((await loop.cancel(session.sessionID)).status).toBe("cancelled")
  const result = await Promise.race([run, Bun.sleep(100).then(() => undefined)])

  expect(result?.status).toBe("cancelled")
  expect(await permission.list(session.sessionID)).toEqual([])
  await rm(directory, { recursive: true, force: true })
})

test("redacts credential-shaped values from permission requests", async () => {
  const broker = createHeadlessPermissionBroker()
  const request: ToolRequest = {
    sessionID: "session-redaction",
    toolName: "shell",
    action: "shell",
    resource: "curl -H 'Authorization: Bearer super-secret-token' --data 'api_key=sk-live-value'",
    input: { command: "curl -H 'Authorization: Bearer super-secret-token' --data 'api_key=sk-live-value'" },
  }
  const evaluation = broker.evaluate(request)
  await Bun.sleep(0)
  const pending = (await broker.list(request.sessionID))[0]!

  expect(pending.resource).not.toContain("super-secret-token")
  expect(pending.resource).not.toContain("sk-live-value")
  await broker.reply({ sessionID: request.sessionID, requestID: pending.id, decision: "deny" })
  expect(await evaluation).toBe("deny")
})
