import { expect, test } from "bun:test"
import { CHAT_PROTOCOL_METHODS, type ChatProtocolAdapter } from "../src/index.ts"

test("ChatProtocolAdapter exposes the complete chat protocol boundary", () => {
  expect(CHAT_PROTOCOL_METHODS).toEqual([
    "loadHistory",
    "loadState",
    "subscribeEvents",
    "listSkills",
    "sendMessage",
    "replyPermission",
    "replyQuestion",
    "cancelQuestion",
    "cancelRun",
    "continueRun",
  ])

  const adapter: ChatProtocolAdapter = {
    loadHistory: async () => ({ messages: [], total: 0, hasMore: false, snapshotID: "snapshot-001" }),
    loadState: async () => ({
      session: {
        id: "session-001",
        name: "测试 Session",
        directory: "/tmp/nexum",
        status: "idle",
        createdAt: "2026-11-24T00:00:00.000Z",
        updatedAt: "2026-11-24T00:00:00.000Z",
      },
      pendingPermissions: [],
      pendingQuestions: [],
      canContinue: false,
      lastSequence: 0,
    }),
    subscribeEvents: async function* () {},
    listSkills: async () => [],
    sendMessage: async () => undefined,
    replyPermission: async () => undefined,
    replyQuestion: async () => undefined,
    cancelQuestion: async () => undefined,
    cancelRun: async () => undefined,
    continueRun: async () => undefined,
  }

  expect(Object.keys(adapter).sort()).toEqual([...CHAT_PROTOCOL_METHODS].sort())
})
