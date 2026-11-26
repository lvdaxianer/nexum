/** NexumEvent → 终端文本投影;同一时刻最多一个活动行,终态只认 run.settled 与 session.*。 */

import type { NexumEvent, NexumSessionMessages } from "@nexum/client"
import { barberPole, breathing, shimmer, spinnerFrame } from "./anim"
import { createLiveLine, type CliIO, type LiveLine } from "./io"
import { createMarkdownStream, renderMarkdownText } from "./markdown"
import { paint, style, type TermCaps } from "./term"

export type ThinkingMode = "live" | "summary" | "full"
export type RunResult = "completed" | "failed" | "cancelled"
export type RenderStatus = "idle" | "running" | "retrying" | "awaiting permission" | "awaiting question" | RunResult

export type Renderer = {
  event(event: NexumEvent): void
  status(): RenderStatus
  thinkingMode(): ThinkingMode
  setThinkingMode(mode: ThinkingMode): void
  expandLastReasoning(): void
  /** 思考 live 区域打开时立即收起(live 模式即 collapse);无打开区域时 no-op。slash 等区域内打印前调用。 */
  flushThinking(): void
  /** 权限/问题等待结束后恢复被冻结的工具活动行;未暂停时为空操作。 */
  resumeTool(): void
  close(): void
}

export function createRenderer(options: { io: CliIO; thinking?: ThinkingMode }): Renderer {
  const io = options.io
  const caps = io.caps
  const md = createMarkdownStream(caps, (text) => io.write(text), () => (process.stdout.columns ?? 80) - io.margin)
  let mode = options.thinking ?? "live"
  let status: RenderStatus = "idle"
  let live: LiveLine | undefined
  let liveKind: "thinking" | "tool" | "compaction" | undefined
  let liveToolName = ""
  let liveStartedAt = 0
  let pausedToolName = ""
  let runStartedAt = 0
  let reasoningChars = 0
  let reasoningStartedAt = 0
  let reasoningTail = ""
  let reasoningBuffer = ""
  let lastReasoning = ""
  let reasoningHeaderPrinted = false
  let assistantHeaderPrinted = false
  let cursorOut = false

  const data = (event: NexumEvent) => (event.data ?? {}) as Record<string, unknown>
  const str = (record: Record<string, unknown>, key: string) => (typeof record[key] === "string" ? (record[key] as string) : "")

  function eraseCursor() {
    if (!cursorOut) return
    io.write("\x1b[D\x1b[K")
    cursorOut = false
  }

  function streamChunk(content: string) {
    eraseCursor()
    io.write(paint(caps, "dim", content))
    io.write(paint(caps, "dim", "▍"))
    cursorOut = true
  }

  function markRunStarted() {
    if (runStartedAt === 0) runStartedAt = Date.now()
  }

  /** 思考块收尾:live 擦除流式区收敛,summary 收敛活动行,full 补打总结行;lastReasoning 保留给 /expand。 */
  function closeReasoning() {
    if (reasoningStartedAt === 0) return
    const elapsed = formatElapsed(Date.now() - reasoningStartedAt)
    const summary = `${paint(caps, "green", "✓")} ${paint(caps, "dim", `思考过程 · ${reasoningChars} 字 · 用时 ${elapsed}`)}`
    if (liveKind === "thinking" && live) {
      const text = `${summary}${paint(caps, "dim", "(默认折叠,/expand 查看)")}`
      if (mode === "live") live.collapse(text)
      else live.settle(text)
      live = undefined
      liveKind = undefined
    } else if (mode === "full") {
      eraseCursor()
      io.line(summary)
    }
    reasoningChars = 0
    reasoningStartedAt = 0
    reasoningTail = ""
    reasoningBuffer = ""
  }

  function settleLive(text: string) {
    if (!live) return
    live.settle(text)
    live = undefined
    liveKind = undefined
  }

  function cancelLive() {
    if (!live) return
    live.cancel()
    live = undefined
    liveKind = undefined
  }

  /** 权限/问题等待期间冻结工具活动行:收敛为静态等待行,记住工具名供 resumeTool 恢复。 */
  function pauseToolLive(reason: string) {
    if (liveKind !== "tool" || !live) return
    pausedToolName = liveToolName
    settleLive(`${paint(caps, "yellow", "⏸")} ${paint(caps, "dim", `工具调用 ${liveToolName} · ${reason}`)}`)
  }

  function ensureThinkingLive() {
    if (mode === "full" || liveKind !== undefined) return
    liveKind = "thinking"
    live = createLiveLine(io, (tick) => {
      const elapsed = ((Date.now() - reasoningStartedAt) / 1000).toFixed(1)
      const label = caps.color === "truecolor" || caps.color === "ansi256" ? shimmer(caps, "正在思考", tick) : breathing(caps, "正在思考", tick)
      const tail = reasoningTail ? paint(caps, "dim", ` · ${reasoningTail}`) : ""
      return `${paint(caps, "cyan", spinnerFrame(tick))} ${label} · 已 ${reasoningChars} 字 · ${elapsed}s${tail}`
    })
  }

  function printAgentHeader() {
    if (assistantHeaderPrinted) return
    assistantHeaderPrinted = true
    io.line(style(caps, ["magenta", "bold"], "Agent"))
  }

  function event(event: NexumEvent): void {
    // 非 assistant 文本事件到达前先收敛 markdown 半行,避免工具/权限等行与未渲染尾巴交织
    if (event.type !== "assistant.text") md.flush()
    const record = data(event)
    switch (event.type) {
      case "assistant.thinking":
        status = "running"
        markRunStarted()
        if (reasoningStartedAt === 0) reasoningStartedAt = Date.now()
        ensureThinkingLive()
        return
      case "assistant.reasoning": {
        status = "running"
        markRunStarted()
        if (reasoningStartedAt === 0) reasoningStartedAt = Date.now()
        const content = str(record, "content")
        reasoningChars += [...content].length
        lastReasoning += content
        reasoningTail = [...lastReasoning].slice(-30).join("").replace(/\s+/g, " ").trim()
        if (mode === "full") {
          if (!reasoningHeaderPrinted) {
            reasoningHeaderPrinted = true
            io.line(paint(caps, "dim", "思考全文:"))
          }
          streamChunk(content)
        } else {
          ensureThinkingLive()
          if (mode === "live") {
            // 按行缓冲:完整行暗色流入活动行上方,半行留在缓冲里(字符已计入 reasoningChars)
            reasoningBuffer += content
            let newline = reasoningBuffer.indexOf("\n")
            while (newline >= 0) {
              const line = reasoningBuffer.slice(0, newline)
              reasoningBuffer = reasoningBuffer.slice(newline + 1)
              if (liveKind === "thinking" && live) live.writeAbove(paint(caps, "dim", `  ${line}`))
              newline = reasoningBuffer.indexOf("\n")
            }
          }
        }
        return
      }
      case "assistant.text": {
        status = "running"
        markRunStarted()
        closeReasoning()
        printAgentHeader()
        md.push(str(record, "content"))
        return
      }
      case "tool.request": {
        status = "running"
        markRunStarted()
        closeReasoning()
        eraseCursor()
        cancelLive()
        pausedToolName = ""
        liveToolName = str(record, "toolName") || str(record, "toolCallID") || "工具"
        liveKind = "tool"
        liveStartedAt = Date.now()
        const name = liveToolName
        live = createLiveLine(io, (tick) => `${paint(caps, "cyan", spinnerFrame(tick))} ${paint(caps, "dim", `工具调用 ${name} · ${((Date.now() - liveStartedAt) / 1000).toFixed(1)}s`)}`)
        return
      }
      case "tool.result": {
        status = "running"
        const ok = record.ok !== false
        const name = str(record, "toolName") || liveToolName || "工具"
        const summary = compact(str(record, "output"))
        const mark = ok ? paint(caps, "green", "✓") : paint(caps, "red", "✗")
        const text = `${mark} ${paint(caps, "dim", `工具结果 ${name}${summary ? ` · ${summary}` : ""}`)}`
        // 等待期间工具行已冻结成静态行,没有活动行可收敛时直接打印结果行
        if (live) settleLive(text)
        else io.line(text)
        liveToolName = ""
        pausedToolName = ""
        return
      }
      case "permission.requested":
        status = "awaiting permission"
        closeReasoning()
        eraseCursor()
        pauseToolLive("等待权限确认")
        return
      case "question.request":
        status = "awaiting question"
        closeReasoning()
        eraseCursor()
        pauseToolLive("等待回答")
        return
      case "question.result":
      case "question.cancelled":
        status = "running"
        return
      case "context.compaction.started":
        status = "running"
        closeReasoning()
        cancelLive()
        liveKind = "compaction"
        live = createLiveLine(io, (tick) => `${paint(caps, "cyan", spinnerFrame(tick))} ${paint(caps, "dim", "上下文压缩")} ${paint(caps, "cyan", barberPole(tick))}`)
        return
      case "context.compaction.completed":
        settleLive(`${paint(caps, "green", "✓")} ${paint(caps, "dim", "上下文压缩完成")}`)
        return
      case "context.compaction.failed":
        settleLive(`${paint(caps, "red", "✗")} ${paint(caps, "dim", "上下文压缩失败")}`)
        return
      case "context.project.loaded":
        io.line(paint(caps, "dim", `项目上下文已加载 ${Array.isArray(record.sources) ? record.sources.length : 0} 个来源`))
        return
      case "skill.activated":
        io.line(`${paint(caps, "green", "✓")} Skill ${paint(caps, "cyan", `@${str(record, "skillID")}`)} 已进入上下文`)
        return
      case "skill.failed":
        io.line(`${paint(caps, "red", "✗")} Skill 激活失败 ${paint(caps, "dim", str(record, "code"))}`)
        return
      case "model.attempt":
        status = "running"
        markRunStarted()
        closeReasoning()
        io.line(paint(caps, "dim", `模型尝试 · 第 ${String(record.attempt ?? "?")} 次调用`))
        return
      case "model.retry":
        status = "retrying"
        closeReasoning()
        io.line(paint(caps, "yellow", `模型重试 · ${String(record.delayMs ?? 0)}ms 后重试`))
        return
      case "coding-loop.limit.reached":
        closeReasoning()
        io.line(paint(caps, "yellow", "已达到本轮步数上限,/continue 可继续"))
        return
      case "run.settled": {
        const result = record.result === "failed" || record.result === "cancelled" ? record.result : "completed"
        status = result
        closeReasoning()
        eraseCursor()
        cancelLive()
        pausedToolName = ""
        const elapsed = runStartedAt === 0 ? "" : ` · 用时 ${formatElapsed(Date.now() - runStartedAt)}`
        if (result === "completed") io.line(`${paint(caps, "green", "✓ 运行完成")}${paint(caps, "dim", elapsed)}`)
        if (result === "failed") io.line(paint(caps, "red", "✗ 运行失败"))
        if (result === "cancelled") io.line(paint(caps, "dim", "— 已取消运行"))
        runStartedAt = 0
        reasoningChars = 0
        reasoningStartedAt = 0
        reasoningBuffer = ""
        lastReasoning = ""
        reasoningHeaderPrinted = false
        assistantHeaderPrinted = false
        return
      }
      case "session.completed":
        status = "completed"
        return
      case "session.failed":
        status = "failed"
        closeReasoning()
        io.line(paint(caps, "red", `运行失败 ${str(record, "message")}`))
        return
      case "session.cancelled":
        status = "cancelled"
        return
      default:
        return
    }
  }

  return {
    event,
    status: () => status,
    thinkingMode: () => mode,
    setThinkingMode: (next) => {
      mode = next
    },
    expandLastReasoning: () => {
      md.flush()
      if (!lastReasoning) {
        io.line(paint(caps, "dim", "暂无可展开的思考过程"))
        return
      }
      eraseCursor()
      io.line(paint(caps, "dim", "思考全文"))
      io.line(paint(caps, "dim", lastReasoning))
    },
    flushThinking: () => {
      if (liveKind === "thinking") closeReasoning()
    },
    resumeTool: () => {
      if (!pausedToolName) return
      const name = pausedToolName
      pausedToolName = ""
      cancelLive()
      liveToolName = name
      liveKind = "tool"
      liveStartedAt = Date.now()
      live = createLiveLine(io, (tick) => `${paint(caps, "cyan", spinnerFrame(tick))} ${paint(caps, "dim", `工具调用 ${name} · 执行中… ${((Date.now() - liveStartedAt) / 1000).toFixed(1)}s`)}`)
    },
    close: () => {
      md.flush()
      closeReasoning()
      eraseCursor()
      cancelLive()
    },
  }
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function compact(value: string): string {
  return [...value.replace(/\s+/g, " ").trim()].slice(0, 60).join("")
}

/** 历史消息 → 紧凑 transcript 行。 */
export function historyLines(caps: TermCaps, messages: NexumSessionMessages["messages"]): string[] {
  const lines: string[] = []
  for (const entry of messages) {
    const message = entry.message
    if (message.role === "user") {
      lines.push(`${paint(caps, "green", "你")} ${paint(caps, "dim", "历史")}`)
      lines.push(`  ${message.content}`)
      continue
    }
    if (message.role === "assistant") {
      if (message.reasoningContent !== undefined) lines.push(paint(caps, "dim", `  思考过程 · ${[...message.reasoningContent].length} 字(历史)`))
      if (message.content !== undefined) {
        lines.push(`${style(caps, ["magenta", "bold"], "Agent")} ${paint(caps, "dim", "历史")}`)
        lines.push(...renderMarkdownText(caps, message.content))
      }
      for (const toolCall of message.toolCalls ?? []) lines.push(paint(caps, "dim", `  ● 工具调用 ${toolCall.name}(历史)`))
      continue
    }
    if (message.role === "tool") {
      lines.push(paint(caps, "dim", `  ✓ 工具结果 · ${compact(message.content)}`))
      continue
    }
    lines.push(paint(caps, "dim", `  系统消息 · ${message.sourceID ?? "context"}`))
  }
  return lines
}
