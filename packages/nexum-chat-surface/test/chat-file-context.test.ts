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
    "请总结重点\n\n【本地上传文件上下文开始】\n以下正文已经由浏览器读取并随本条消息发送。请直接使用正文回答，不要根据文件名调用 read、ls 或其他工作目录工具查找文件。\n文件名：README.md\n【文件正文开始】\n# 标题\n正文\n【文件正文结束】\n【本地上传文件上下文结束】",
  )
})
