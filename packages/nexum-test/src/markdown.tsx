/**
 * Nexum UI 的消息 markdown 渲染入口。
 *
 * 模型输出是不可信内容：marked 负责解析，DOMPurify 负责按白名单消毒，
 * 两者都通过后才允许进入 innerHTML。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-21
 */

import type { JSX } from "solid-js"
import { Marked } from "marked"
import DOMPurify from "dompurify"

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    link({ href, title, tokens }) {
      const titleAttr = title ? ` title="${escapeAttribute(title)}"` : ""
      const text = this.parser.parseInline(tokens)
      return `<a href="${escapeAttribute(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
    },
  },
})

/** 渲染并消毒一段 markdown，输出可直接交给 innerHTML 的安全 HTML。 */
export function renderMarkdown(content: string): string {
  return DOMPurify.sanitize(marked.parse(content, { async: false }))
}

/** 按消息流渲染 markdown 文本块。 */
export function MarkdownView(props: { readonly content: string; readonly class?: string }): JSX.Element {
  return <div class={props.class} innerHTML={renderMarkdown(props.content)} />
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}
