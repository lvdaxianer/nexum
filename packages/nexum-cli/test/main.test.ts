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

test("theme command works without a reachable server", async () => {
  const { run } = await import("../src/main.ts")
  const previous = process.env.NEXUM_API_URL
  process.env.NEXUM_API_URL = "http://127.0.0.1:59998"
  try {
    // theme 是本地命令:server 不可达也应成功(只测读取路径,不写真实 ~/.nexum/cli.json)
    expect(await run(["theme"])).toBe(0)
  } finally {
    if (previous === undefined) delete process.env.NEXUM_API_URL
    else process.env.NEXUM_API_URL = previous
  }
})
