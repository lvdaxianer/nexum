import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

test("完整演示工作台归属于 nexum-test", () => {
  expect(existsSync(resolve(import.meta.dir, "../index.html"))).toBe(true)
  expect(existsSync(resolve(import.meta.dir, "../src/main.tsx"))).toBe(true)
  expect(existsSync(resolve(import.meta.dir, "../../nexum-surfaces/src/main.tsx"))).toBe(false)
})
