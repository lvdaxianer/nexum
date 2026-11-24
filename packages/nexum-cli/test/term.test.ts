import { expect, test } from "bun:test"
import { detectCaps, gradient, paint, style } from "../src/term.ts"

test("detectCaps returns static mode for NO_COLOR, dumb term and non-TTY", () => {
  expect(detectCaps({ env: { NO_COLOR: "1" }, isTTY: true })).toEqual({ isTTY: true, color: "none", anim: false, theme: "dark" })
  expect(detectCaps({ env: { TERM: "dumb" }, isTTY: true })).toEqual({ isTTY: true, color: "none", anim: false, theme: "dark" })
  expect(detectCaps({ env: {}, isTTY: false })).toEqual({ isTTY: false, color: "none", anim: false, theme: "dark" })
})

test("detectCaps maps COLORTERM and TERM to color levels and keeps theme", () => {
  expect(detectCaps({ env: { COLORTERM: "truecolor" }, isTTY: true }).color).toBe("truecolor")
  expect(detectCaps({ env: { COLORTERM: "24bit" }, isTTY: true }).color).toBe("truecolor")
  expect(detectCaps({ env: { TERM: "xterm-256color" }, isTTY: true }).color).toBe("ansi256")
  expect(detectCaps({ env: { TERM: "xterm" }, isTTY: true }).color).toBe("ansi16")
  expect(detectCaps({ env: { TERM: "xterm" }, isTTY: true, theme: "light" }).theme).toBe("light")
})

test("detectCaps disables animation with noAnim option or NEXUM_NO_ANIM", () => {
  expect(detectCaps({ env: { TERM: "xterm" }, isTTY: true, noAnim: true }).anim).toBe(false)
  expect(detectCaps({ env: { TERM: "xterm", NEXUM_NO_ANIM: "1" }, isTTY: true }).anim).toBe(false)
  expect(detectCaps({ env: { TERM: "xterm" }, isTTY: true }).anim).toBe(true)
})

test("paint and style emit ANSI codes only when color is enabled", () => {
  const none = { isTTY: true, color: "none", anim: false, theme: "dark" } as const
  const ansi16 = { isTTY: true, color: "ansi16", anim: true, theme: "dark" } as const
  expect(paint(none, "green", "完成")).toBe("完成")
  expect(paint(ansi16, "green", "完成")).toBe("\x1b[32m完成\x1b[0m")
  expect(style(ansi16, ["cyan", "bold"], "思考")).toBe("\x1b[36;1m思考\x1b[0m")
})

test("gradient degrades by color level", () => {
  const none = { isTTY: true, color: "none", anim: false, theme: "dark" } as const
  const ansi16 = { isTTY: true, color: "ansi16", anim: true, theme: "dark" } as const
  const light16 = { isTTY: true, color: "ansi16", anim: true, theme: "light" } as const
  const ansi256 = { isTTY: true, color: "ansi256", anim: true, theme: "dark" } as const
  const truecolor = { isTTY: true, color: "truecolor", anim: true, theme: "dark" } as const
  expect(gradient(none, "NEX", ["#7dcfff", "#bb9af7", "#f7768e"])).toBe("NEX")
  expect(gradient(ansi16, "NEX", ["#7dcfff", "#bb9af7", "#f7768e"])).toBe("\x1b[36mNEX\x1b[0m")
  expect(gradient(light16, "NEX", ["#7dcfff", "#bb9af7", "#f7768e"])).toBe("\x1b[34mNEX\x1b[0m")
  const c256 = gradient(ansi256, "NEX", ["#7dcfff", "#bb9af7", "#f7768e"])
  expect(c256).toContain("38;5;")
  expect(c256.endsWith("\x1b[0m")).toBe(true)
  const colored = gradient(truecolor, "NEX", ["#7dcfff", "#bb9af7", "#f7768e"])
  expect(colored.startsWith("\x1b[38;2;125;207;255mN")).toBe(true)
  expect(colored.endsWith("\x1b[0m")).toBe(true)
  expect(gradient(truecolor, "", ["#7dcfff", "#bb9af7", "#f7768e"])).toBe("")
})
