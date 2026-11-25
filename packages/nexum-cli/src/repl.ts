/** REPL 交互循环:懒创建会话 → 历史回放 → 事件订阅 → 输入分发,交互请求走顺序队列;输入框仅在空闲时绘制。 */

import { createInterface } from "node:readline/promises"
import type { NexumEvent } from "@nexum/client"
import type { ChatProtocolAdapter } from "@nexum/surface-adapter"
import { cmdMcpList, cmdModelGet, cmdStatus, cmdTheme } from "./admin"
import { cmdResume, cmdSessionList, type NexumClient } from "./commands"
import { askPermission, askQuestion, permissionFromEvent, questionFromEvent, type Prompter } from "./interact"
import { createRenderer, historyLines } from "./render"
import { paint, type TermCaps } from "./term"
import type { CliIO } from "./io"

export type LineSource = {
  next(): Promise<string | null>
  close(): void
  setSigintHandler?(handler: () => void): void
  /** 绘制输入提示(有输入框时画框);运行中不调用,输出保持干净。 */
  showPrompt?(): void
}

export function arrayLineSource(lines: readonly string[]): LineSource {
  let index = 0
  return {
    next: async () => (index < lines.length ? lines[index++]! : null),
    close: () => {},
  }
}

export type InputBox = { readonly top: string; readonly hint: string; readonly inputPrefix: string; readonly spacer: string; readonly bottom: string }

/** 行式近似的输入框:非 TTY 或无颜色时降级为 undefined(调用方退回普通提示符)。 */
export function inputBoxLines(caps: TermCaps, columns: number): InputBox | undefined {
  if (!caps.isTTY || caps.color === "none") return undefined
  const width = Math.max(44, Math.min(columns - 6, 110))
  const hintText = "输入任务,Enter 发送 · @ 引用 Skill · /help 命令 · Ctrl+C 取消/退出"
  return {
    top: paint(caps, "cyan", `╭${"─".repeat(width - 2)}╮`),
    hint: `${paint(caps, "cyan", "│")} ${paint(caps, "dim", hintText)}`,
    inputPrefix: `${paint(caps, "cyan", "│")} ${paint(caps, "cyan", "›")} `,
    spacer: `${paint(caps, "cyan", "│")} `,
    bottom: paint(caps, "cyan", `╰${"─".repeat(width - 2)}╯`),
  }
}

export function readlineLineSource(
  skills: () => readonly string[],
  options: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream; box?: InputBox } = {},
): LineSource & { prompter: Prompter } {
  const rawOutput = options.output ?? process.stdout
  const box = options.box
  // 实证(bun terminal 模式):退格等编辑触发全行重绘,序列 ^[[0J 清到屏尾会抹掉闭合框底边;
  // box 模式改写为 ^[[0K(清到行尾),重绘只影响输入行。已知限制:多行粘贴的重绘会留残影。
  const output = box
    ? (Object.create(rawOutput, {
        write: { value: (text: string) => rawOutput.write(text.replaceAll("\x1b[0J", "\x1b[0K")) },
      }) as NodeJS.WritableStream)
    : rawOutput
  const rl = createInterface({
    input: options.input ?? process.stdin,
    output,
    // 注入测试流时强制终端模式,补全器才会在 Tab 时触发;生产路径保持默认(随 stdout.isTTY)。
    ...(options.input ? { terminal: true } : {}),
    completer: (line: string): [string[], string] => {
      const match = line.match(/(?:^|\s)@([a-z0-9-]*)$/i)
      if (!match) return [[], line]
      const query = match[1]?.toLowerCase() ?? ""
      const hits = skills()
        .filter((id) => id.toLowerCase().startsWith(query))
        .map((id) => `@${id} `)
      return [hits, line.slice(line.length - match[1]!.length - 1)]
    },
  })
  const lines: string[] = []
  const waiters: ((line: string | null) => void)[] = []
  let closed = false
  let promptActive = false
  let sigintHandler: (() => void) | undefined
  rl.on("SIGINT", () => {
    if (sigintHandler) sigintHandler()
    else rl.close()
  })
  let notifyClosed: () => void = () => {}
  const closedSignal = new Promise<never>((_, reject) => {
    notifyClosed = () => reject(new Error("readline closed"))
  })
  closedSignal.catch(() => {})
  rl.on("line", (line) => {
    // 闭合框在 showPrompt 时已画好;实证(bun terminal 模式):Enter 时 readline 先写 \r\n,
    // 'line' 触发时光标在留白行行首,下移两行(留白→底边→框外),后续输出落在框外下方。
    if (promptActive && box) output.write("\x1b[2B")
    promptActive = false
    const waiter = waiters.shift()
    if (waiter) waiter(line)
    else lines.push(line)
  })
  rl.on("close", () => {
    closed = true
    notifyClosed()
    while (waiters.length > 0) waiters.shift()!(null)
  })
  return {
    next: () => {
      if (lines.length > 0) return Promise.resolve(lines.shift()!)
      if (closed) return Promise.resolve(null)
      return new Promise<string | null>((resolve) => waiters.push(resolve))
    },
    prompter: (query) => {
      // question 接管下一次行输入,不再触发 'line';提示状态随之失效。
      promptActive = false
      return Promise.race([rl.question(query), closedSignal])
    },
    close: () => rl.close(),
    setSigintHandler: (handler) => {
      sigintHandler = handler
    },
    showPrompt: () => {
      if (closed || promptActive) return
      promptActive = true
      if (box) {
        output.write(`${box.top}\n${box.hint}\n`)
        rl.setPrompt(box.inputPrefix)
        rl.prompt()
        // 画留白行与底边形成五行闭合框,再上移两行归位:光标回到输入行 inputPrefix 之后,
        // 与 readline 内部跟踪的位置一致(补全/退格的重绘都基于该位置)。
        // 已知限制:输入超长换行会压到留白行。
        output.write(`\n${box.spacer}\n${box.bottom}`)
        output.write(`\x1b[2A\r${box.inputPrefix}`)
        return
      }
      rl.setPrompt("nexum ▸ ")
      rl.prompt()
    },
  }
}

const HELP = `可用命令:
  /help        显示帮助          /new [名称]   新会话(首条消息时创建)
  /sessions    列出会话          /use <id>     切换会话
  /resume      交互式恢复会话    /status       连接与配置总览
  /skills      列出可用 Skill    /mcp          MCP 列表
  /model       当前模型          /theme        查看/切换主题
  /events      最近事件          /clear        清屏
  /cancel      取消当前运行      /continue     继续上次运行
  /thinking    summary|full      /expand       展开最近思考
  /quit        退出`

export type ReplOptions = {
  readonly adapter: ChatProtocolAdapter
  readonly client: NexumClient
  readonly io: CliIO
  /** 缺省时进入待创建状态:首条非 slash 消息到达时才创建会话。 */
  readonly sessionID?: string
  readonly lineSource: LineSource
  readonly prompter: Prompter
  readonly baseUrl?: string
  readonly reconnectDelayMs?: number
}

export async function runRepl(options: ReplOptions): Promise<void> {
  const { adapter, client, io } = options
  let sessionID = options.sessionID
  let pendingName: string | undefined
  const recentEvents: string[] = []

  try {
    while (true) {
      const renderer = createRenderer({ io })
      let controller: AbortController | undefined
      let pump: Promise<void> | undefined
      let awaitingRun = false
      let switchTo: string | undefined
      let resetToPending = false
      let interactionQueue = Promise.resolve()

      const failOpen = (error: unknown) => {
        io.line(paint(io.caps, "red", `会话打开失败:${error instanceof Error ? error.message : "未知错误"}`))
        return undefined
      }
      const isTerminal = (status: string) => status === "completed" || status === "failed" || status === "cancelled"
      const locked = () => awaitingRun || ["running", "retrying", "awaiting permission", "awaiting question"].includes(renderer.status())

      function enqueueInteraction(id: string, event: NexumEvent) {
        interactionQueue = interactionQueue
          .then(async () => {
            const data = (event.data ?? {}) as Record<string, unknown>
            if (event.type === "permission.requested") {
              const request = permissionFromEvent(data, id)
              if (!request) return
              const decision = await askPermission(io, options.prompter, request)
              // 先打印结果再回复:服务器收到回复后可能立刻执行工具并推送 tool.result
              io.line(paint(io.caps, "green", decision === "deny" ? "权限已拒绝" : "权限已通过"))
              try {
                await adapter.replyPermission({ sessionID: id, requestID: request.id, decision })
              } catch (error) {
                io.line(paint(io.caps, "red", `权限回复失败:${error instanceof Error ? error.message : "未知错误"}`))
                return
              }
              renderer.resumeTool()
              return
            }
            const request = questionFromEvent(data, id)
            if (!request) return
            const answers = await askQuestion(io, options.prompter, request)
            if (answers === "cancel") {
              io.line(paint(io.caps, "dim", "已取消补充信息"))
              try {
                await adapter.cancelQuestion({ sessionID: id, requestID: request.id })
              } catch (error) {
                io.line(paint(io.caps, "red", `取消提交失败:${error instanceof Error ? error.message : "未知错误"}`))
                return
              }
              renderer.resumeTool()
              return
            }
            io.line(paint(io.caps, "green", "补充信息已提交,运行继续"))
            try {
              await adapter.replyQuestion({ sessionID: id, requestID: request.id, answers })
            } catch (error) {
              io.line(paint(io.caps, "red", `回答提交失败:${error instanceof Error ? error.message : "未知错误"}`))
              return
            }
            renderer.resumeTool()
          })
          .catch((error) => io.line(paint(io.caps, "red", `交互处理失败:${error instanceof Error ? error.message : "未知错误"}`)))
      }

      const openSession = async (id: string): Promise<boolean> => {
        const state = await adapter.loadState(id).catch(failOpen)
        if (!state) return false
        const history = await adapter.loadHistory({ sessionID: id, limit: 50 }).catch(failOpen)
        if (!history) return false
        io.line(paint(io.caps, "dim", `会话 ${id} · ${state.session.name} · 已回放历史 ${history.messages.length} 条`))
        for (const line of historyLines(io.caps, history.messages)) io.line(line)
        let afterSequence = state.lastSequence
        const seen = new Set<string>()
        const ctrl = new AbortController()
        controller = ctrl
        pump = (async () => {
          while (!ctrl.signal.aborted) {
            try {
              for await (const event of adapter.subscribeEvents({ sessionID: id, afterSequence, signal: ctrl.signal })) {
                if (ctrl.signal.aborted) return
                if (seen.has(event.eventID)) continue
                if (event.sequence <= afterSequence) continue
                seen.add(event.eventID)
                afterSequence = event.sequence
                recentEvents.push(`${event.sequence} ${event.type}`)
                if (recentEvents.length > 50) recentEvents.shift()
                renderer.event(event)
                if (event.type === "permission.requested" || event.type === "question.request") enqueueInteraction(id, event)
                // 服务器总是先发 session.* 终态再发 run.settled(publishTerminalEvents);
                // 只有 run.settled 才重画输入框,否则终态行会粘到 │ › 输入行后面。
                if (event.type === "run.settled") {
                  awaitingRun = false
                  options.lineSource.showPrompt?.()
                }
              }
              // 终态后流结束属正常关闭,静默续订;仅在非终态掉线时提示。
              if (!ctrl.signal.aborted && !isTerminal(renderer.status())) io.line(paint(io.caps, "yellow", "事件流已断开,3s 后重连…"))
            } catch {
              if (!ctrl.signal.aborted && !isTerminal(renderer.status())) io.line(paint(io.caps, "yellow", "事件流已断开,3s 后重连…"))
            }
            if (ctrl.signal.aborted) return
            await new Promise((resolve) => setTimeout(resolve, options.reconnectDelayMs ?? 3000))
          }
        })()
        return true
      }

      options.lineSource.setSigintHandler?.(() => {
        if (locked()) {
          io.line(paint(io.caps, "dim", "已请求取消运行(Ctrl+C)"))
          if (sessionID) void adapter.cancelRun(sessionID).catch(() => {})
          return
        }
        options.lineSource.close()
      })

      try {
        if (sessionID) {
          const opened = await openSession(sessionID)
          if (!opened) return
        } else {
          io.line(paint(io.caps, "dim", "新会话 · 发送第一条消息后创建(空会话不会产生垃圾)"))
        }
        if (!locked()) options.lineSource.showPrompt?.()

        while (true) {
          const line = await options.lineSource.next()
          if (line === null) return
          const text = line.trim()
          if (!text) {
            // 空行提交同样闭合了输入框,空闲时立即重画。
            if (!locked()) options.lineSource.showPrompt?.()
            continue
          }
          if (text.startsWith("/")) {
            const [command, ...rest] = text.slice(1).split(/\s+/)
            if (command === "quit" || command === "exit") return
            if (command === "help") io.line(HELP)
            else if (command === "cancel") {
              if (!sessionID) io.line(paint(io.caps, "dim", "会话尚未创建,发送第一条消息后可用"))
              else {
                await adapter.cancelRun(sessionID)
                io.line(paint(io.caps, "dim", "已请求取消运行"))
              }
            } else if (command === "continue") {
              if (!sessionID) io.line(paint(io.caps, "dim", "会话尚未创建,发送第一条消息后可用"))
              else {
                await adapter.continueRun(sessionID)
                io.line(paint(io.caps, "dim", "正在继续运行"))
              }
            } else if (command === "skills") {
              const skills = await adapter.listSkills()
              const ready = skills.filter((skill) => skill.status === "ready")
              if (ready.length === 0) io.line(paint(io.caps, "dim", "暂无可用 Skill"))
              for (const skill of ready) io.line(`${paint(io.caps, "cyan", `@${skill.id}`)} ${paint(io.caps, "dim", skill.description)}`)
            } else if (command === "new") {
              // 回到待创建状态:不立即建会话,名称留给首条消息。
              pendingName = rest.join(" ") || undefined
              resetToPending = true
              break
            } else if (command === "use" && rest[0]) {
              switchTo = rest[0]
              break
            } else if (command === "resume") {
              const picked = await cmdResume(client, io, options.prompter)
              if (picked) {
                switchTo = picked
                break
              }
            } else if (command === "sessions") await cmdSessionList(client, io)
            else if (command === "status") await cmdStatus(client, io, { baseUrl: options.baseUrl })
            else if (command === "theme") await cmdTheme(io, rest)
            else if (command === "mcp") await cmdMcpList(client, io)
            else if (command === "model") await cmdModelGet(client, io)
            else if (command === "clear") {
              io.write("\x1b[2J\x1b[H")
              io.line(paint(io.caps, "dim", sessionID ? `会话 ${sessionID} · 已清屏` : "已清屏"))
            } else if (command === "events") {
              if (recentEvents.length === 0) io.line(paint(io.caps, "dim", "本轮还没有事件"))
              for (const item of recentEvents.slice(-20)) io.line(paint(io.caps, "dim", item))
            } else if (command === "thinking") {
              const mode = rest[0] === "full" ? "full" : "summary"
              renderer.setThinkingMode(mode)
              io.line(paint(io.caps, "dim", `思考展示:${mode}`))
            } else if (command === "expand") renderer.expandLastReasoning()
            else io.line(paint(io.caps, "yellow", `未知命令 /${command},输入 /help 查看帮助`))
            if (!locked()) options.lineSource.showPrompt?.()
            continue
          }
          if (locked()) {
            io.line(paint(io.caps, "yellow", "Agent 正在回复,/cancel 取消本轮"))
            continue
          }
          if (!sessionID) {
            const created = await client.experimental.nexum.session
              .create({ directory: process.cwd(), ...(pendingName ? { name: pendingName } : {}) })
              .catch((error: unknown) => {
                io.line(paint(io.caps, "red", `创建会话失败:${error instanceof Error ? error.message : "未知错误"}`))
                return undefined
              })
            if (!created) {
              if (!locked()) options.lineSource.showPrompt?.()
              continue
            }
            sessionID = created.data.id
            pendingName = undefined
            io.line(paint(io.caps, "dim", `会话 ${sessionID} · 已创建`))
            const opened = await openSession(sessionID)
            if (!opened) return
          }
          awaitingRun = true
          await adapter.sendMessage({ sessionID, text }).catch((error: unknown) => {
            io.line(paint(io.caps, "red", `发送失败:${error instanceof Error ? error.message : "未知错误"}`))
            awaitingRun = false
          })
          if (!locked()) options.lineSource.showPrompt?.()
        }
      } finally {
        controller?.abort()
        await interactionQueue.catch(() => {})
        await pump?.catch(() => {})
        renderer.close()
      }
      if (resetToPending) {
        sessionID = undefined
        resetToPending = false
        continue
      }
      if (!switchTo) return
      sessionID = switchTo
    }
  } finally {
    options.lineSource.close()
  }
}
