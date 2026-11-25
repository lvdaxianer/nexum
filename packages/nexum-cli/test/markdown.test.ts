import { expect, test } from "bun:test"
import { createMarkdownStream, renderMarkdownText } from "../src/markdown.ts"
import type { TermCaps } from "../src/term.ts"

const none = { isTTY: true, color: "none", anim: false, theme: "dark" } as const satisfies TermCaps
const ansi16 = { isTTY: true, color: "ansi16", anim: false, theme: "dark" } as const satisfies TermCaps
const ansi256 = { isTTY: true, color: "ansi256", anim: false, theme: "dark" } as const satisfies TermCaps
const light256 = { isTTY: true, color: "ansi256", anim: false, theme: "light" } as const satisfies TermCaps
const truecolor = { isTTY: true, color: "truecolor", anim: false, theme: "dark" } as const satisfies TermCaps

test("headings strip #'s and render h1 magenta bold, h2/h3 cyan bold", () => {
  expect(renderMarkdownText(ansi16, "# 标题\n## 二级\n### 三级")).toEqual([
    "\x1b[35;1m标题\x1b[0m",
    "\x1b[36;1m二级\x1b[0m",
    "\x1b[36;1m三级\x1b[0m",
  ])
})

test("inline styles render bold, italic, code and link in order", () => {
  const [line] = renderMarkdownText(ansi16, "我是 **Nexum** 和 *斜体* 以及 `code` 还有 [链接](https://example.com)")
  expect(line).toContain("\x1b[1mNexum\x1b[0m")
  expect(line).toContain("\x1b[3m斜体\x1b[0m")
  expect(line).toContain("\x1b[33mcode\x1b[0m")
  expect(line).toContain("\x1b[36;4m链接\x1b[0m")
  expect(line).not.toContain("**")
  expect(line).not.toContain("https://example.com")
})

test("code spans keep their content literal", () => {
  const [line] = renderMarkdownText(ansi16, "使用 `**not bold**` 即可")
  expect(line).toBe("使用 \x1b[33m**not bold**\x1b[0m 即可")
})

test("bullets keep indent and use cyan marker", () => {
  expect(renderMarkdownText(ansi16, "- 第一项\n  * 嵌套\n+ 第三项")).toEqual([
    "\x1b[36m•\x1b[0m 第一项",
    "  \x1b[36m•\x1b[0m 嵌套",
    "\x1b[36m•\x1b[0m 第三项",
  ])
})

test("quotes render dim with dim border prefix", () => {
  expect(renderMarkdownText(ansi16, "> 引用内容")).toEqual(["\x1b[2m▎\x1b[0m \x1b[2m引用内容\x1b[0m"])
})

test("table rows pass through with inline styles still applied", () => {
  const [line] = renderMarkdownText(ansi16, "| **名称** | 值 |")
  expect(line).toContain("\x1b[1m名称\x1b[0m")
  expect(line.replace(/\x1b\[[0-9;]*m/g, "")).toBe("| 名称 | 值 |")
})

test("fenced code uses subtle bg and cyan border on 256/truecolor, markers hidden", () => {
  const dark = renderMarkdownText(ansi256, "```ts\nconst a = 1\n```")
  expect(dark).toHaveLength(1)
  expect(dark[0]).toContain("\x1b[48;5;234m")
  expect(dark[0]).toContain("\x1b[36m▎\x1b[0m")
  expect(dark[0]).toContain("const a = 1")
  expect(renderMarkdownText(light256, "```\nx\n```")[0]).toContain("\x1b[48;5;254m")
  expect(renderMarkdownText(truecolor, "```\nx\n```")[0]).toContain("\x1b[48;2;30;34;48m")
})

test("fenced code degrades to dim text with cyan border on ansi16", () => {
  const lines = renderMarkdownText(ansi16, "```\nconst a = 1\n```")
  expect(lines).toEqual(["\x1b[36m▎\x1b[0m \x1b[2mconst a = 1\x1b[0m"])
})

test("color none passes everything through untouched", () => {
  expect(renderMarkdownText(none, "# 标题\n```\ncode\n```\n**粗体**")).toEqual(["# 标题", "```", "code", "```", "**粗体**"])
  const chunks: string[] = []
  const md = createMarkdownStream(none, (text) => chunks.push(text))
  md.push("# 标题\n**粗")
  md.push("体**\n")
  md.flush()
  expect(chunks.join("")).toBe("# 标题\n**粗体**\n")
  expect(md.pending).toBe(false)
})

test("streaming shows raw tail with cursor, then erases and renders on line completion", () => {
  const chunks: string[] = []
  const md = createMarkdownStream(ansi16, (text) => chunks.push(text))
  md.push("**你")
  expect(chunks).toEqual(["**你\x1b[2m▍\x1b[0m"])
  expect(md.pending).toBe(true)
  md.push("好** world\n")
  expect(chunks[1]).toBe("\r\x1b[2K")
  expect(chunks[2]).toBe("\x1b[1m你好\x1b[0m world\n")
  expect(chunks[2]).not.toContain("**")
  expect(md.pending).toBe(false)
})

test("flush renders the pending tail with a newline", () => {
  const chunks: string[] = []
  const md = createMarkdownStream(ansi16, (text) => chunks.push(text))
  md.push("**尾行**")
  md.flush()
  expect(chunks).toEqual(["**尾行**\x1b[2m▍\x1b[0m", "\r\x1b[2K", "\x1b[1m尾行\x1b[0m\n"])
  expect(md.pending).toBe(false)
})

test("fence state survives chunk splits and resets on flush", () => {
  const chunks: string[] = []
  const md = createMarkdownStream(ansi256, (text) => chunks.push(text))
  md.push("```ts\nco")
  expect(chunks.join("")).toBe("co\x1b[2m▍\x1b[0m")
  md.push("de\n```\n**after**\n")
  const out = chunks.join("")
  expect(out).toContain("\x1b[48;5;234m")
  expect(out).toContain("code")
  expect(out).toContain("\x1b[1mafter\x1b[0m\n")
  md.push("```\n")
  md.flush()
  md.push("**x**\n")
  expect(chunks.join("")).toContain("\x1b[1mx\x1b[0m\n")
})

test("renderMarkdownText renders a full document line by line", () => {
  const doc = "# Nexum\n\n- **快** 且 *轻*\n> 引用\n\n```\nplain\n```\n尾行"
  expect(renderMarkdownText(ansi16, doc)).toEqual([
    "\x1b[35;1mNexum\x1b[0m",
    "",
    "\x1b[36m•\x1b[0m \x1b[1m快\x1b[0m 且 \x1b[3m轻\x1b[0m",
    "\x1b[2m▎\x1b[0m \x1b[2m引用\x1b[0m",
    "",
    "\x1b[36m▎\x1b[0m \x1b[2mplain\x1b[0m",
    "尾行",
  ])
})
