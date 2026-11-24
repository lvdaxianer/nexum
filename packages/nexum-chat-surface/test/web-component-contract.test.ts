import { expect, test } from "bun:test"
import { CHAT_SURFACE_TAG } from "../src/index.ts"

test("ChatSurface publishes the embeddable custom element contract", () => {
  expect(CHAT_SURFACE_TAG).toBe("nexum-chat")
})
