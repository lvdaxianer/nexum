import { expect, test } from "bun:test"
import { resolveBaseUrl, USAGE } from "../src/main.ts"

test("resolveBaseUrl prefers flag over env over default", () => {
  expect(resolveBaseUrl("http://a", { NEXUM_API_URL: "http://b" })).toBe("http://a")
  expect(resolveBaseUrl(undefined, { NEXUM_API_URL: "http://b" })).toBe("http://b")
  expect(resolveBaseUrl(undefined, {})).toBe("http://127.0.0.1:4097")
})

test("USAGE documents all command groups", () => {
  for (const group of ["session list", "session create", "prompt", "resume", "status", "doctor", "theme", "model get", "model set", "model probe", "role-prompt", "skill list", "skill register", "mcp list", "mcp connect", "--server", "--session", "--continue", "--theme", "--no-anim", "--version"]) {
    expect(USAGE).toContain(group)
  }
})
