import { expect, test } from "bun:test"
import { createIO, createLiveLine, memoryIO } from "../src/io.ts"
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

function collectIO(options: { margin?: number; isTTY?: boolean } = {}) {
  let buffer = ""
  const io = createIO({
    caps: { isTTY: options.isTTY ?? true, color: "none", anim: false, theme: "dark" },
    out: {
      write: (text: string) => {
        buffer += text
      },
    },
    margin: options.margin,
  })
  return { io, output: () => buffer }
}

test("createIO defaults margin to 2 on TTY and 0 otherwise, clamps to [0, 8]", () => {
  expect(collectIO().io.margin).toBe(2)
  expect(collectIO({ isTTY: false }).io.margin).toBe(0)
  expect(collectIO({ margin: 4 }).io.margin).toBe(4)
  expect(collectIO({ margin: 99 }).io.margin).toBe(8)
  expect(collectIO({ margin: -3 }).io.margin).toBe(0)
})

test("margin writer indents after newlines and after line-control sequences", () => {
  const { io, output } = collectIO({ margin: 2 })
  io.line("第一行")
  io.write("第二行\n第三行")
  expect(output()).toBe("  第一行\n  第二行\n  第三行")
})

test("margin lands after erase sequences, not before", () => {
  const { io, output } = collectIO({ margin: 2 })
  io.write("\r\x1b[2K帧")
  expect(output()).toBe("\r\x1b[2K  帧")
})

test("margin follows cursor-down but cursor-up alone does not reset line state", () => {
  const { io, output } = collectIO({ margin: 2 })
  io.write("\x1b[1B下移")
  expect(output()).toBe("\x1b[1B  下移")
  const mid = collectIO({ margin: 2 })
  mid.io.write("x\x1b[1Ay")
  // x 触发边距;A 不改变状态,y 在行中不再补
  expect(mid.output()).toBe("  x\x1b[1Ay")
})

test("consecutive live redraws do not accumulate margin", () => {
  const { io, output } = collectIO({ margin: 2 })
  io.write("\r\x1b[2K帧一")
  io.write("\r\x1b[2K帧二")
  expect(output()).toBe("\r\x1b[2K  帧一\r\x1b[2K  帧二")
})

test("SGR at line start gets the margin before it", () => {
  const { io, output } = collectIO({ margin: 2 })
  io.write("\x1b[31m红\x1b[0m\n")
  expect(output()).toBe("  \x1b[31m红\x1b[0m\n")
})

test("margin 0 is an identity transform and memoryIO defaults to no margin", () => {
  const { io, output } = collectIO({ margin: 0 })
  io.write("\r\x1b[2K帧\n次行")
  expect(output()).toBe("\r\x1b[2K帧\n次行")
  const memory = memoryIO()
  memory.line("a")
  expect(memory.output()).toBe("a\n")
  expect(memory.margin).toBe(0)
})

test("memoryIO with margin indents through the same transform", () => {
  const memory = memoryIO({}, 2)
  memory.line("a")
  memory.write("\r\x1b[2K帧")
  expect(memory.output()).toBe("  a\n\r\x1b[2K  帧")
})

test("live line deducts the io margin from the frame width", async () => {
  const io = memoryIO({ color: "none", anim: true }, 2)
  const live = createLiveLine(io, (tick) => `帧${tick} ${"长".repeat(30)}`, 20)
  await new Promise((resolve) => setTimeout(resolve, 100))
  live.cancel()
  const frames = io.output().split("\r\x1b[2K").filter(Boolean)
  expect(frames.length).toBeGreaterThan(0)
  for (const frame of frames) {
    // 边距在擦除序列之后;内容宽 = 20 - 2(边距) - 1(防贴边) = 17
    expect(frame.startsWith("  ")).toBe(true)
    expect(displayWidth(frame)).toBeLessThanOrEqual(2 + 17)
    expect(frame.endsWith("…")).toBe(true)
  }
})

test("explicit margin only applies on TTY; pipes always get margin 0", () => {
  expect(collectIO({ margin: 4, isTTY: false }).io.margin).toBe(0)
  expect(collectIO({ margin: 4, isTTY: true }).io.margin).toBe(4)
  const { io, output } = collectIO({ margin: 4, isTTY: false })
  io.line("管道行")
  expect(output()).toBe("管道行\n")
})
