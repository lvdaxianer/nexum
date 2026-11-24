import { expect, test } from "bun:test"
import { barberPole, breathing, logoLines, progressBar, shimmer, SPINNER_FRAMES, spinnerFrame } from "../src/anim.ts"

const ansi16 = { isTTY: true, color: "ansi16", anim: true, theme: "dark" } as const
const light16 = { isTTY: true, color: "ansi16", anim: true, theme: "light" } as const
const none = { isTTY: true, color: "none", anim: false, theme: "dark" } as const

test("spinnerFrame cycles through braille frames", () => {
  expect(SPINNER_FRAMES.length).toBe(10)
  expect(spinnerFrame(0)).toBe("⠋")
  expect(spinnerFrame(9)).toBe("⠏")
  expect(spinnerFrame(10)).toBe("⠋")
})

test("breathing alternates between dim and normal within 1.2s period", () => {
  expect(breathing(ansi16, "正在思考", 0)).toBe("\x1b[2m正在思考\x1b[0m")
  expect(breathing(ansi16, "正在思考", 10)).toBe("正在思考")
  expect(breathing(none, "正在思考", 0)).toBe("正在思考")
})

test("shimmer moves a highlight window across the text", () => {
  const at0 = shimmer(ansi16, "正在思考", 0)
  expect(at0).toContain("\x1b[36;1m正")
  const at1 = shimmer(ansi16, "正在思考", 1)
  expect(at1).toContain("\x1b[36;1m在")
  expect(shimmer(none, "正在思考", 3)).toBe("正在思考")
})

test("progressBar renders filled and empty cells", () => {
  expect(progressBar(0)).toBe("░".repeat(13))
  expect(progressBar(100)).toBe("▓".repeat(13))
  expect(progressBar(50, 10)).toBe("▓▓▓▓▓░░░░░")
  expect(progressBar(140)).toBe("▓".repeat(13))
})

test("barberPole shifts stripes with tick", () => {
  expect(barberPole(0)).not.toBe(barberPole(1))
  expect(barberPole(0).length).toBe(13)
  expect(barberPole(0, 13, 4)).toBe(barberPole(4, 13, 4))
})

test("logoLines renders six gradient rows, plain when colorless", () => {
  const lines = logoLines(none)
  expect(lines.length).toBe(6)
  expect(lines[0]).toContain("███╗")
  expect(logoLines(ansi16)[0]).toContain("\x1b[36m")
})

test("shimmer uses blue head in light theme and logo uses dark palette", () => {
  expect(shimmer(light16, "正在思考", 0)).toContain("\x1b[34;1m正")
  expect(logoLines(light16)[0]).not.toContain("\x1b[36m")
})
