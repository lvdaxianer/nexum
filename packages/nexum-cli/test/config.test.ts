import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadCliConfig, resolveTheme, saveCliConfig } from "../src/config.ts"

const tmp = () => join(tmpdir(), `nexum-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)

test("resolveTheme prefers flag over config over COLORFGBG over default", () => {
  expect(resolveTheme("light", { theme: "dark" }, {})).toBe("light")
  expect(resolveTheme(undefined, { theme: "light" }, {})).toBe("light")
  expect(resolveTheme(undefined, { theme: "auto" }, { COLORFGBG: "0;15" })).toBe("light")
  expect(resolveTheme(undefined, { theme: "auto" }, { COLORFGBG: "15;0" })).toBe("dark")
  expect(resolveTheme(undefined, {}, {})).toBe("dark")
})

test("saveCliConfig and loadCliConfig round-trip, missing file returns empty", async () => {
  const file = tmp()
  expect(await loadCliConfig(file)).toEqual({})
  await saveCliConfig({ theme: "light" }, file)
  expect(await loadCliConfig(file)).toEqual({ theme: "light" })
})

test("loadCliConfig reads the reserved margin field", async () => {
  const file = tmp()
  await saveCliConfig({ margin: 4 }, file)
  expect((await loadCliConfig(file)).margin).toBe(4)
})
