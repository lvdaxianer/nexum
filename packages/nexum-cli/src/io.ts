/** 输出抽象:生产写 stdout,测试用内存 IO;LiveLine 负责原地刷新的活动行。 */

import { detectCaps, displayWidth, type TermCaps } from "./term"
import { SPINNER_INTERVAL_MS } from "./anim"

export type CliIO = {
  readonly caps: TermCaps
  write(text: string): void
  line(text?: string): void
}

export function createIO(options: { caps?: TermCaps; out?: { write(text: string): unknown } } = {}): CliIO {
  const caps = options.caps ?? detectCaps()
  const out = options.out ?? process.stdout
  return {
    caps,
    write: (text) => void out.write(text),
    line: (text = "") => void out.write(text + "\n"),
  }
}

export function memoryIO(caps: Partial<TermCaps> = {}) {
  let buffer = ""
  return {
    caps: { isTTY: true, color: "none", anim: false, theme: "dark", ...caps } as TermCaps,
    write: (text: string) => {
      buffer += text
    },
    line: (text = "") => {
      buffer += text + "\n"
    },
    output: () => buffer,
    plain: () => buffer.replace(/\x1b\[[0-9;]*m/g, ""),
  }
}

export type LiveLine = {
  /** 结束活动行并打印最终内容(静态模式下直接打印)。 */
  settle(text: string): void
  /** 丢弃活动行,不留下任何输出。 */
  cancel(): void
  /** 在活动行上方插入一行(仅动画模式;静态模式为 no-op)。 */
  writeAbove(text: string): void
  /** 擦除活动行及其上方由 writeAbove 写入的所有行,并打印最终行。 */
  collapse(text: string): void
}

/**
 * 活动行:动画开启时按 80ms 原地重写 render(tick),同一时刻只允许一个;
 * 每帧按显示宽度截断到 columns - 1(留一列防止贴边换行),保证 \r\x1b[2K 总能整行擦除;
 * 静态模式(非 TTY/无色/--no-anim)不产生任何中间帧。
 */
export function createLiveLine(io: CliIO, render: (tick: number) => string, columns?: number): LiveLine {
  if (!io.caps.anim) {
    return { settle: (text) => io.line(text), cancel: () => {}, writeAbove: () => {}, collapse: (text) => io.line(text) }
  }
  const cols = columns ?? process.stdout.columns ?? 80
  const width = Math.max(1, cols - 1)
  let tick = 0
  let rowsAbove = 0
  const draw = () => io.write(`\r\x1b[2K${truncateFrame(render(tick), width)}`)
  const timer = setInterval(() => {
    tick += 1
    draw()
  }, SPINNER_INTERVAL_MS)
  draw()
  const stop = () => {
    clearInterval(timer)
    io.write("\r\x1b[2K")
  }
  return {
    settle: (text) => {
      stop()
      io.line(text)
    },
    cancel: stop,
    writeAbove: (text) => {
      // 插入行可能携带 ANSI 样式,行数统计按剥离样式后的显示宽度折算换行行数
      rowsAbove += Math.max(1, Math.ceil(displayWidth(text.replace(/\x1b\[[0-9;]*m/g, "")) / cols))
      io.write(`\r\x1b[2K${text}\n`)
      draw()
    },
    collapse: (text) => {
      clearInterval(timer)
      io.write("\r\x1b[2K")
      // \x1b[0J 清到屏尾,前提是活动行与其上方插入行是屏幕最后的输出(运行中没有输入框)
      if (rowsAbove > 0) io.write(`\x1b[${rowsAbove}A\x1b[0J`)
      io.line(text)
    },
  }
}

/** 按显示宽度截断帧(CJK 计 2,ANSI 序列零宽原样保留),超宽时末位以 … 收尾;宽字符不劈开。 */
function truncateFrame(text: string, width: number): string {
  const tokens = text.match(/\x1b\[[0-9;]*[A-Za-z]|./gsu) ?? []
  const widths = tokens.map((token) => (token.startsWith("\x1b") ? 0 : displayWidth(token)))
  if (widths.reduce((sum, w) => sum + w, 0) <= width) return text
  let out = ""
  let used = 0
  for (const [index, token] of tokens.entries()) {
    if (used + widths[index]! > width - 1) break
    out += token
    used += widths[index]!
  }
  return `${out}…${text.includes("\x1b") ? "\x1b[0m" : ""}`
}
