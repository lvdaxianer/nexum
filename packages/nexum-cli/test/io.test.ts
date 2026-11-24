import { expect, test } from "bun:test"
import { createLiveLine, memoryIO } from "../src/io.ts"

test("memoryIO collects output and strips ANSI for plain assertions", () => {
  const io = memoryIO({ color: "ansi16" })
  io.line("第一行")
  io.write("片段")
  expect(io.output()).toContain("第一行\n")
  expect(io.plain()).toBe("第一行\n片段")
})

test("live line rewrites in place and settles to a permanent line", async () => {
  const io = memoryIO({ color: "none", anim: true })
  const live = createLiveLine(io, (tick) => `⠋ 思考 ${tick}`)
  await new Promise((resolve) => setTimeout(resolve, 200))
  live.settle("✓ 完成")
  const out = io.output()
  expect(out).toContain("\r\x1b[2K")
  expect(out).toContain("⠋ 思考 0")
  expect(out.endsWith("✓ 完成\n")).toBe(true)
})

test("live line is static when animation is off", () => {
  const io = memoryIO({ color: "none", anim: false })
  const live = createLiveLine(io, (tick) => `⠋ 思考 ${tick}`)
  live.settle("✓ 完成")
  expect(io.plain()).toBe("✓ 完成\n")
})
