import { expect, test } from "bun:test"
import { createLiveLine, memoryIO } from "../src/io.ts"
import { displayWidth, paint } from "../src/term.ts"

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

test("live line truncates wide frames to columns - 1 without splitting CJK chars", async () => {
  const io = memoryIO({ color: "none", anim: true })
  const live = createLiveLine(io, (tick) => `帧${tick} ${"长".repeat(30)}`, 20)
  await new Promise((resolve) => setTimeout(resolve, 100))
  live.cancel()
  const frames = io.output().split("\r\x1b[2K").filter(Boolean)
  expect(frames.length).toBeGreaterThan(0)
  // 帧0: "帧0 " 宽 4 + 7 个 "长" 宽 14 = 18,第 8 个 "长" 会到 20 超出 18 预算,整体不劈开宽字符
  expect(frames[0]).toBe(`帧0 ${"长".repeat(7)}…`)
  for (const frame of frames) {
    expect(frame).not.toContain("\n")
    expect(displayWidth(frame)).toBeLessThanOrEqual(19)
    expect(frame.endsWith("…")).toBe(true)
  }
})

test("live line leaves narrow frames untouched", () => {
  const io = memoryIO({ color: "none", anim: true })
  const live = createLiveLine(io, () => "⠋ 思考 0", 20)
  live.cancel()
  expect(io.output()).toContain("⠋ 思考 0")
  expect(io.output()).not.toContain("…")
})

test("live line truncation keeps ANSI sequences intact and resets style", () => {
  const io = memoryIO({ color: "ansi16", anim: true })
  const live = createLiveLine(io, () => paint(io.caps, "cyan", "x".repeat(30)), 20)
  live.cancel()
  const frame = io.output().split("\r\x1b[2K").filter(Boolean)[0]!
  expect(frame).toContain("\x1b[36m")
  expect(frame.endsWith("…\x1b[0m")).toBe(true)
  expect(displayWidth(frame.replace(/\x1b\[[0-9;]*m/g, ""))).toBeLessThanOrEqual(19)
})

test("writeAbove erases the live row, inserts the line and redraws the live row", () => {
  const io = memoryIO({ color: "none", anim: true })
  const live = createLiveLine(io, () => "⠋ 思考", 40)
  live.writeAbove("  第一行")
  const out = io.output()
  expect(out).toContain("\r\x1b[2K  第一行\n")
  // 插入后紧跟一次活动行重绘,光标回到活动行
  expect(out.lastIndexOf("\r\x1b[2K⠋ 思考")).toBeGreaterThan(out.indexOf("  第一行\n"))
  live.cancel()
})

test("collapse erases the live row plus one row per writeAbove call before printing", () => {
  const io = memoryIO({ color: "ansi16", anim: true })
  const live = createLiveLine(io, () => "⠋ 思考", 20)
  live.writeAbove("短行")
  live.writeAbove(paint(io.caps, "dim", "长".repeat(15))) // 超宽行被截断到单行,行数恒为调用次数
  live.collapse("✓ 思考过程")
  const out = io.output()
  expect(out).toContain("\x1b[2A\x1b[0J")
  expect(out.endsWith("✓ 思考过程\n")).toBe(true)
})

test("writeAbove truncates overwide CJK lines to columns - 1 so collapse leaves no residue", () => {
  const io = memoryIO({ color: "none", anim: true })
  const live = createLiveLine(io, () => "⠋ 思考", 20)
  // 显示宽 40 且 CJK 骑跨换行边界:不截断时实际占 3 行,行数折算会低估
  live.writeAbove("a" + "汉".repeat(19) + "b")
  live.collapse("✓ 思考过程")
  const out = io.output()
  const inserted = out.split("\r\x1b[2K")[2]!.replace(/\n[\s\S]*$/, "")
  expect(displayWidth(inserted)).toBeLessThanOrEqual(19)
  expect(inserted.endsWith("…")).toBe(true)
  // 每次 writeAbove 恒占 1 行
  expect(out).toContain("\x1b[1A\x1b[0J")
})

test("collapse without writeAbove rows skips the cursor-up sequence", () => {
  const io = memoryIO({ color: "none", anim: true })
  const live = createLiveLine(io, () => "⠋ 思考", 20)
  live.collapse("✓ 完成")
  const out = io.output()
  expect(out).not.toContain("\x1b[0J")
  expect(out.endsWith("✓ 完成\n")).toBe(true)
})

test("writeAbove is a no-op and collapse prints a plain line in static mode", () => {
  const io = memoryIO({ color: "none", anim: false })
  const live = createLiveLine(io, () => "⠋ 思考", 20)
  live.writeAbove("  第一行")
  expect(io.output()).toBe("")
  live.collapse("✓ 思考过程")
  expect(io.plain()).toBe("✓ 思考过程\n")
})
