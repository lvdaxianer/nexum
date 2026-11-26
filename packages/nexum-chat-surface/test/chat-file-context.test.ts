import { expect, test } from "bun:test"
import { CHAT_FILE_MAX_BYTES, composeChatPrompt, validateChatFile } from "../src/chat-surface.tsx"

test("接受大小写不敏感的 Markdown 和纯文本文件", () => {
  expect(validateChatFile({ name: "README.MD", size: 120 })).toBeUndefined()
  expect(validateChatFile({ name: "notes.txt", size: CHAT_FILE_MAX_BYTES })).toBeUndefined()
})

test("拒绝不支持的扩展名和超大文件", () => {
  expect(validateChatFile({ name: "archive.pdf", size: 120 })).toContain("只支持 .md 和 .txt")
  expect(validateChatFile({ name: "notes.txt", size: CHAT_FILE_MAX_BYTES + 1 })).toContain("512 KiB")
})

test("用清晰分隔符把文件全文附加到用户问题", () => {
  expect(composeChatPrompt("请总结重点", { name: "README.md", text: "# 标题\n正文" })).toBe(
    "请总结重点\n\n【文件：README.md】\n# 标题\n正文\n【文件结束】",
  )
})
