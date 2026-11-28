import { expect, test } from "bun:test"
import { WORKBENCH_THEME } from "../src/theme"

test("工作台主题配置固定为浅色", () => {
  expect(WORKBENCH_THEME).toBe("light")
})
