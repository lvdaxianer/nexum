/** 输出抽象:生产写 stdout,测试用内存 IO;LiveLine 负责原地刷新的活动行。 */

import { detectCaps, displayWidth, type TermCaps } from "./term"
import { SPINNER_INTERVAL_MS } from "./anim"

export type CliIO = {
  readonly caps: TermCaps
  /** 统一左边距列数(TTY 默认 2,非 TTY 0,上限 8);写路径在行首注入。 */
  readonly margin: number
  write(text: string): void
  line(text?: string): void
}

/**
 * 左边距注入:行首状态机。\n/\r 与光标下移(B)后处于行首,光标上移(A)不改变状态;
 * 行首的擦除序列(2K/0K/0J/2J)先原样输出,边距补在其后;其余 token(含 SGR)在行首触发一次边距。
 * margin 0 时原样返回(恒等快速路径)。
 */
export function createMarginWriter(write: (text: string) => void, margin: number): (text: string) => void {
  if (margin <= 0) return write
  const pad = " ".repeat(margin)
  let atLineStart = true
  return (text) => {
    let out = ""
    for (const token of text.match(/\x1b\[[0-9;]*[A-Za-z]|\n|\r|./gsu) ?? []) {
      if (token === "\n" || token === "\r") {
        out += token
        atLineStart = true
        continue
      }
      if (token.startsWith("\x1b")) {
        const command = token.at(-1)
        if (atLineStart && (token === "\x1b[2K" || token === "\x1b[0K" || token === "\x1b[0J" || token === "\x1b[2J")) {
          out += token
          continue
        }
        if (command === "B" || command === "H") {
          out += token
          atLineStart = true
          continue
        }
        if (command === "A") {
          out += token
          continue
        }
        if (atLineStart) {
          out += pad
          atLineStart = false
        }
        out += token
        continue
      }
      if (atLineStart) {
        out += pad
        atLineStart = false
      }
      out += token
    }
    write(out)
  }
}

export function createIO(options: { caps?: TermCaps; out?: { write(text: string): unknown }; margin?: number } = {}): CliIO {
  const caps = options.caps ?? detectCaps()
  const out = options.out ?? process.stdout
  const margin = Math.min(8, Math.max(0, options.margin ?? (caps.isTTY ? 2 : 0)))
  const write = createMarginWriter((text) => void out.write(text), margin)
  return {
    caps,
    margin,
    write,
    line: (text = "") => write(text + "\n"),
  }
}

export function memoryIO(caps: Partial<TermCaps> = {}, margin = 0) {
  let buffer = ""
  const write = createMarginWriter((text) => {
    buffer += text
  }, margin)
  return {
    caps: { isTTY: true, color: "none", anim: false, theme: "dark", ...caps } as TermCaps,
    margin,
    write,
    line: (text = "") => {
      write(text + "\n")
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
  // 帧宽扣除左边距:写路径会在行首注入 margin,帧内容超宽换行会破坏 \r\x1b[2K 的整行擦除
  const cols = (columns ?? process.stdout.columns ?? 80) - io.margin
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
      // 插入行截断到列宽内(与帧截断同逻辑):整行恒占 1 行,从根上消灭换行行数折算;
      // 流式行是瞬态(收起即擦除),全文由 /expand 保留
      rowsAbove += 1
      io.write(`\r\x1b[2K${truncateFrame(text, width)}\n`)
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
