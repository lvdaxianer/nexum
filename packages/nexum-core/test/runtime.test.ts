import { expect, test } from "bun:test"
import { createNexumSessionService, createNexumRuntime, NexumRuntimeError, type EventSink } from "../src/index.ts"

test("discovers optional capabilities and rejects work after close", async () => {
  const sessions = createNexumSessionService()
  const events: EventSink = { async publish() {} }
  const loop = {
    async run() {
      throw new Error("not expected")
    },
    async cancel() {
      throw new Error("not expected")
    },
  }
  const runtime = createNexumRuntime({ sessions, loop, events })

  expect(runtime.status()).toBe("ready")
  expect(runtime.capabilities().find((item) => item.id === "memory")?.status).toBe("disabled")
  expect(runtime.capabilities().find((item) => item.id === "session")?.operations).toContain("delete")
  await runtime.close()
  expect(runtime.status()).toBe("closed")
  await expect(runtime.prompt({ sessionID: "missing", text: "hello" })).rejects.toBeInstanceOf(NexumRuntimeError)
})
