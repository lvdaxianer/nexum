/** Markdown → ANSI 渲染:按行缓冲,未完成半行先原样显示,行完成时擦除重渲;非 TTY 原样透传。 */

import { displayWidth, paint, style, type TermCaps } from "./term"

export type MarkdownSink = (text: string) => void

export type MarkdownStream = {
  push(chunk: string): void
  /** 渲染并输出剩余半行(带换行),重置 fence 状态。 */
  flush(): void
  /** 是否有未完成的显示中行。 */
  readonly pending: boolean
}

/** 一次性渲染完整文本(历史回放用)。 */
export function renderMarkdownText(caps: TermCaps, text: string): string[] {
  if (caps.color === "none") return text.split("\n")
  const state: BlockState = { inFence: false }
  return text.split("\n").flatMap((line) => {
    const rendered = renderBlockLine(caps, state, line)
    return rendered === undefined ? [] : [rendered]
  })
}

/** 流式渲染器:完整行即时渲染;fence 标记行不输出。columns 支持 getter,擦除时求值以适应终端 resize。 */
export function createMarkdownStream(caps: TermCaps, sink: MarkdownSink, columns?: number | (() => number)): MarkdownStream {
  if (caps.color === "none") {
    return {
      push: (chunk) => sink(chunk),
      flush: () => {},
      pending: false,
    }
  }
  let pending = ""
  let tailShown = false
  const state: BlockState = { inFence: false }

  function eraseTail() {
    if (!tailShown) return
    // tail(原始 pending + 宽 1 的 ▍)超宽自动换行占多行,需逐行上清;恰满列时终端延迟换行仍算 1 行
    const resolved = typeof columns === "function" ? columns() : columns
    const cols = resolved ?? process.stdout.columns ?? 80
    const width = displayWidth(pending) + 1
    const rows = width <= cols ? 1 : Math.ceil(width / cols)
    sink("\r\x1b[2K" + "\x1b[1A\r\x1b[2K".repeat(rows - 1))
    tailShown = false
  }

  function emit(line: string) {
    const rendered = renderBlockLine(caps, state, line)
    if (rendered !== undefined) sink(rendered + "\n")
  }

  return {
    push(chunk) {
      eraseTail()
      pending += chunk
      const lines = pending.split("\n")
      pending = lines.pop() ?? ""
      lines.forEach(emit)
      if (pending === "") return
      sink(pending + paint(caps, "dim", "▍"))
      tailShown = true
    },
    flush() {
      eraseTail()
      if (pending !== "") {
        emit(pending)
        pending = ""
      }
      state.inFence = false
    },
    get pending() {
      return tailShown
    },
  }
}

type BlockState = { inFence: boolean }

/** 单行块级渲染;返回 undefined 表示该行不输出(围栏标记行)。 */
function renderBlockLine(caps: TermCaps, state: BlockState, line: string): string | undefined {
  if (/^\s*```/.test(line)) {
    state.inFence = !state.inFence
    return undefined
  }
  if (state.inFence) return codeLine(caps, line)
  const heading = /^(#{1,6})\s+(.*)$/.exec(line)
  if (heading) {
    const text = inline(caps, heading[2] ?? "")
    return heading[1]?.length === 1 ? style(caps, ["magenta", "bold"], text) : style(caps, ["cyan", "bold"], text)
  }
  const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line)
  if (bullet) return `${bullet[1]}${paint(caps, "cyan", "•")} ${inline(caps, bullet[2] ?? "")}`
  const quote = /^>\s?(.*)$/.exec(line)
  if (quote) return `${paint(caps, "dim", "▎")} ${paint(caps, "dim", inline(caps, quote[1] ?? ""))}`
  return inline(caps, line)
}

/** 围栏代码内容行:256/truecolor 淡底色 + 青左边线,16 色降级暗色;代码内容不做行内解析。 */
function codeLine(caps: TermCaps, line: string): string {
  if (caps.color === "truecolor" || caps.color === "ansi256") {
    const bg =
      caps.color === "truecolor"
        ? caps.theme === "light"
          ? "\x1b[48;2;238;241;246m"
          : "\x1b[48;2;30;34;48m"
        : caps.theme === "light"
          ? "\x1b[48;5;254m"
          : "\x1b[48;5;234m"
    // 边线先复位再铺底色,避免 paint 的 \x1b[0m 清掉整行背景
    return `${paint(caps, "cyan", "▎")}${bg} ${line}\x1b[0m`
  }
  return `${paint(caps, "cyan", "▎")} ${paint(caps, "dim", line)}`
}

/** 行内样式:行内代码 → 链接 → 粗体/斜体;简单扫描,不支持嵌套强调。链接先于强调,否则强调插入的 SGR 序列会被链接正则的 [ 误匹配。 */
function inline(caps: TermCaps, text: string): string {
  return text
    .split(/(`[^`\n]*`)/g)
    .map((part) => {
      if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) return paint(caps, "yellow", part.slice(1, -1))
      return emphasize(caps, linkify(caps, part))
    })
    .join("")
}

function emphasize(caps: TermCaps, text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, (_match, inner: string) => style(caps, ["bold"], inner))
    .replace(/\*([^*]+)\*/g, (_match, inner: string) => style(caps, ["italic"], inner))
}

function linkify(caps: TermCaps, text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string) => style(caps, ["cyan", "underline"], label))
}
