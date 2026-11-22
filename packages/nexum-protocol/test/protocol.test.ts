import { expect, test } from "bun:test"
import { NEXUM_API_PREFIX, NEXUM_PROTOCOL_VERSION } from "../src/index.ts"

test("uses Nexum protocol identity and API boundary", () => {
  expect(NEXUM_PROTOCOL_VERSION).toBe("nexum.runtime.v1")
  expect(NEXUM_API_PREFIX).toBe("/api/nexum")
})
