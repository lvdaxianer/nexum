import { expect, test } from "bun:test"
import { publicEntries } from "../../../script/nexum-package"

test("发布配置只暴露 ChatSurface，不暴露完整工作台", () => {
  expect("./chat-surface" in publicEntries).toBe(true)
  expect("./surfaces" in publicEntries).toBe(false)
})
