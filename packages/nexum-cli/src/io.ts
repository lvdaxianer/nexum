/** 输出抽象:生产写 stdout,测试用内存 IO;LiveLine 负责原地刷新的活动行。 */

import { detectCaps, type TermCaps } from "./term"
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
}

/**
 * 活动行:动画开启时按 80ms 原地重写 render(tick),同一时刻只允许一个;
 * 静态模式(非 TTY/无色/--no-anim)不产生任何中间帧。
 */
export function createLiveLine(io: CliIO, render: (tick: number) => string): LiveLine {
  if (!io.caps.anim) {
    return { settle: (text) => io.line(text), cancel: () => {} }
  }
  let tick = 0
  const draw = () => io.write(`\r\x1b[2K${render(tick)}`)
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
  }
}
