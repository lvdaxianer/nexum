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
