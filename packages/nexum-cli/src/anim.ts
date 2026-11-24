/** 动画帧生成器:全部为纯函数,输入 tick 输出字符串,便于测试。 */

import { gradient, paint, style, type TermCaps } from "./term"

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const
export const SPINNER_INTERVAL_MS = 80

export function spinnerFrame(tick: number): string {
  return SPINNER_FRAMES[((tick % SPINNER_FRAMES.length) + SPINNER_FRAMES.length) % SPINNER_FRAMES.length]!
}

/** 呼吸:80ms tick 下 15 tick ≈ 1.2s 周期,前半 dim 后半正常。 */
export function breathing(caps: TermCaps, text: string, tick: number): string {
  return tick % 15 < 8 ? paint(caps, "dim", text) : text
}

/** 扫描光:高亮窗口从左向右扫过,1 步/tick;浅色主题高亮用 blue,深色用 cyan;无色终端原样返回。 */
export function shimmer(caps: TermCaps, text: string, tick: number): string {
  if (caps.color === "none") return text
  const accent = caps.theme === "light" ? "blue" : "cyan"
  const chars = [...text]
  const pos = tick % (chars.length + 5)
  return chars
    .map((ch, i) => {
      const d = pos - i
      if (d === 0) return style(caps, [accent, "bold"], ch)
      if (d > 0 && d < 5) return paint(caps, accent, ch)
      return paint(caps, "dim", ch)
    })
    .join("")
}

/** 确定进度条:▓ 已完成 + ░ 剩余。 */
export function progressBar(percent: number, width = 13): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const filled = Math.round((clamped / 100) * width)
  return "▓".repeat(filled) + "░".repeat(width - filled)
}

/** 不确定进度条(理发店杆):条纹随 tick 平移,用于无百分比的长任务。 */
export function barberPole(tick: number, width = 13, period = 4): string {
  const unit = "▓▓▓░"
  const offset = tick % period
  return (unit.repeat(Math.ceil((width + period) / unit.length)) + unit).slice(offset, offset + width)
}

export const NEXUM_LOGO = [
  "███╗   ██╗███████╗██╗  ██╗██╗   ██╗███╗   ███╗",
  "████╗  ██║██╔════╝╚██╗██╔╝██║   ██║████╗ ████║",
  "██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║██╔████╔██║",
  "██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║██║╚██╔╝██║",
  "██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝██║ ╚═╝ ██║",
  "╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝",
] as const

export function logoLines(caps: TermCaps): string[] {
  const stops = caps.theme === "light" ? (["#0550ae", "#8250df", "#cf222e"] as const) : (["#7dcfff", "#bb9af7", "#f7768e"] as const)
  return NEXUM_LOGO.map((row) => gradient(caps, row, stops))
}
