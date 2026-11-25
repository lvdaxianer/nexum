/** 终端能力检测与 ANSI 输出助手:语义内容恒为 16 色,装饰元素按能力降级。 */

export type ColorLevel = "none" | "ansi16" | "ansi256" | "truecolor"

export type Theme = "dark" | "light"

export type TermCaps = {
  readonly isTTY: boolean
  readonly color: ColorLevel
  readonly anim: boolean
  readonly theme: Theme
}

export type CapsOptions = {
  readonly env?: Record<string, string | undefined>
  readonly isTTY?: boolean
  readonly noAnim?: boolean
  readonly theme?: Theme
}

export function detectCaps(options: CapsOptions = {}): TermCaps {
  const env = options.env ?? process.env
  const isTTY = options.isTTY ?? process.stdout.isTTY ?? false
  const theme = options.theme ?? "dark"
  if (env.NO_COLOR !== undefined || env.TERM === "dumb" || !isTTY) return { isTTY, color: "none", anim: false, theme }
  const color: ColorLevel =
    env.COLORTERM === "truecolor" || env.COLORTERM === "24bit"
      ? "truecolor"
      : env.TERM?.includes("256color")
        ? "ansi256"
        : "ansi16"
  return { isTTY, color, anim: !options.noAnim && env.NEXUM_NO_ANIM === undefined, theme }
}

export type SemanticColor = "green" | "yellow" | "cyan" | "red" | "magenta" | "blue" | "dim" | "bold" | "italic" | "underline"

const CODES: Record<SemanticColor, number> = {
  green: 32,
  yellow: 33,
  cyan: 36,
  red: 31,
  magenta: 35,
  blue: 34,
  dim: 2,
  bold: 1,
  italic: 3,
  underline: 4,
}

export function style(caps: TermCaps, colors: readonly SemanticColor[], text: string): string {
  if (caps.color === "none" || colors.length === 0) return text
  return `\x1b[${colors.map((color) => CODES[color]).join(";")}m${text}\x1b[0m`
}

export function paint(caps: TermCaps, color: SemanticColor, text: string): string {
  return style(caps, [color], text)
}

type Rgb = readonly [number, number, number]

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function sample(stops: readonly Rgb[], t: number): Rgb {
  const scaled = t * (stops.length - 1)
  const index = Math.min(Math.floor(scaled), stops.length - 2)
  const local = scaled - index
  const [a, b] = [stops[index]!, stops[index + 1]!]
  return [
    Math.round(a[0] + (b[0] - a[0]) * local),
    Math.round(a[1] + (b[1] - a[1]) * local),
    Math.round(a[2] + (b[2] - a[2]) * local),
  ]
}

function to256([r, g, b]: Rgb): number {
  const cube = (v: number) => Math.round((v / 255) * 5)
  return 16 + 36 * cube(r) + 6 * cube(g) + cube(b)
}

/** 装饰性渐变:按能力降级 truecolor → 256 → 16(单色,深色 cyan/浅色 blue) → 无。 */
export function gradient(caps: TermCaps, text: string, stops: readonly [string, string, string]): string {
  if (text === "") return text
  if (caps.color === "none") return text
  if (caps.color === "ansi16") return paint(caps, caps.theme === "light" ? "blue" : "cyan", text)
  const rgb = stops.map(hexToRgb)
  const chars = [...text]
  const out = chars.map((ch, i) => {
    const [r, g, b] = sample(rgb, chars.length <= 1 ? 0 : i / (chars.length - 1))
    return caps.color === "truecolor" ? `\x1b[38;2;${r};${g};${b}m${ch}` : `\x1b[38;5;${to256([r, g, b])}m${ch}`
  })
  return out.join("") + "\x1b[0m"
}
