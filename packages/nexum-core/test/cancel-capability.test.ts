import { expect, test } from "bun:test"
import { canCancelSessionStatus } from "../src/index.ts"
import { createNexumCodingLoop, createNexumSessionService } from "./test-ports.ts"

test.each([
  ["idle", false],
  ["running", true],
  ["completed", false],
  ["failed", false],
  ["cancelled", false],
] as const)("Core declares %s session cancellability as %s", (status, expected) => {
  expect(canCancelSessionStatus(status)).toBe(expected)
})

test("Core rejects cancellation after a run has reached a terminal status", async () => {
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory: "/tmp/nexum-cancel-capability" })
  await sessions.setStatus(session.sessionID, "running")
  await sessions.setStatus(session.sessionID, "completed")
  const loop = createNexumCodingLoop({
    model: { async *prompt() { yield { type: "completed" as const } } },
    tool: { async execute() { return { ok: true, output: "unused" } } },
    permission: { async evaluate() { return "allow" as const } },
    sessions,
    events: { async publish() {} },
  })

  await expect(loop.cancel(session.sessionID)).rejects.toMatchObject({ code: "session_not_cancellable" })
})
