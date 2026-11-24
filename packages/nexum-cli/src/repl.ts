/** REPL 交互循环:历史回放 → 事件订阅 → 输入分发,交互请求走顺序队列。 */

import { createInterface } from "node:readline/promises"
import type { NexumEvent } from "@nexum/client"
import type { ChatProtocolAdapter } from "@nexum/surface-adapter"
import { cmdMcpList, cmdModelGet, cmdStatus, cmdTheme } from "./admin"
import { cmdResume, cmdSessionList, type NexumClient } from "./commands"
import { askPermission, askQuestion, permissionFromEvent, questionFromEvent, type Prompter } from "./interact"
import { createRenderer, historyLines } from "./render"
import { paint } from "./term"
import type { CliIO } from "./io"

export type LineSource = {
  next(): Promise<string | null>
  close(): void
  setSigintHandler?(handler: () => void): void
}

export function arrayLineSource(lines: readonly string[]): LineSource {
  let index = 0
  return {
    next: async () => (index < lines.length ? lines[index++]! : null),
    close: () => {},
  }
}

export function readlineLineSource(
  skills: () => readonly string[],
  options: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream } = {},
): LineSource & { prompter: Prompter } {
  const rl = createInterface({
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
    // 注入测试流时强制终端模式,补全器才会在 Tab 时触发;生产路径保持默认(随 stdout.isTTY)。
    ...(options.input ? { terminal: true } : {}),
    prompt: "nexum ▸ ",
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
    const waiter = waiters.shift()
    if (waiter) waiter(line)
    else lines.push(line)
    if (!closed) rl.prompt()
  })
  rl.on("close", () => {
    closed = true
    notifyClosed()
    while (waiters.length > 0) waiters.shift()!(null)
  })
  rl.prompt()
  return {
    next: () => {
      if (lines.length > 0) return Promise.resolve(lines.shift()!)
      if (closed) return Promise.resolve(null)
      return new Promise<string | null>((resolve) => waiters.push(resolve))
    },
    prompter: (query) =>
      Promise.race([rl.question(query), closedSignal]).then((answer) => {
        if (!closed) rl.prompt()
        return answer
      }),
    close: () => rl.close(),
    setSigintHandler: (handler) => {
      sigintHandler = handler
    },
  }
}

const HELP = `可用命令:
  /help        显示帮助          /new [名称]   新建并切换会话
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
  readonly sessionID: string
  readonly lineSource: LineSource
  readonly prompter: Prompter
  readonly baseUrl?: string
  readonly reconnectDelayMs?: number
}

export async function runRepl(options: ReplOptions): Promise<void> {
  const { adapter, client, io } = options
  let sessionID = options.sessionID
  const recentEvents: string[] = []

  try {
    while (true) {
      const renderer = createRenderer({ io })
      const controller = new AbortController()
      const seen = new Set<string>()
      let interactionQueue = Promise.resolve()
      let switchTo: string | undefined

      const failOpen = (error: unknown) => {
        io.line(paint(io.caps, "red", `会话打开失败:${error instanceof Error ? error.message : "未知错误"}`))
        return undefined
      }
      const state = await adapter.loadState(sessionID).catch(failOpen)
      if (!state) return
      const history = await adapter.loadHistory({ sessionID, limit: 50 }).catch(failOpen)
      if (!history) return
      io.line(paint(io.caps, "dim", `会话 ${sessionID} · ${state.session.name} · 已回放历史 ${history.messages.length} 条`))
      for (const line of historyLines(io.caps, history.messages)) io.line(line)
      let afterSequence = state.lastSequence

      function enqueueInteraction(event: NexumEvent) {
        interactionQueue = interactionQueue
          .then(async () => {
            const data = (event.data ?? {}) as Record<string, unknown>
            if (event.type === "permission.requested") {
              const request = permissionFromEvent(data, sessionID)
              if (!request) return
              const decision = await askPermission(io, options.prompter, request)
              await adapter.replyPermission({ sessionID, requestID: request.id, decision })
              io.line(paint(io.caps, "green", decision === "deny" ? "权限已拒绝" : "权限已通过"))
              return
            }
            const request = questionFromEvent(data, sessionID)
            if (!request) return
            const answers = await askQuestion(io, options.prompter, request)
            if (answers === "cancel") {
              await adapter.cancelQuestion({ sessionID, requestID: request.id })
              io.line(paint(io.caps, "dim", "已取消补充信息"))
              return
            }
            await adapter.replyQuestion({ sessionID, requestID: request.id, answers })
            io.line(paint(io.caps, "green", "补充信息已提交,运行继续"))
          })
          .catch((error) => io.line(paint(io.caps, "red", `交互处理失败:${error instanceof Error ? error.message : "未知错误"}`)))
      }

      const pump = (async () => {
        while (!controller.signal.aborted) {
          try {
            for await (const event of adapter.subscribeEvents({ sessionID, afterSequence, signal: controller.signal })) {
              if (controller.signal.aborted) return
              if (seen.has(event.eventID)) continue
              if (event.sequence <= afterSequence) continue
              seen.add(event.eventID)
              afterSequence = event.sequence
              recentEvents.push(`${event.sequence} ${event.type}`)
              if (recentEvents.length > 50) recentEvents.shift()
              renderer.event(event)
              if (event.type === "permission.requested" || event.type === "question.request") enqueueInteraction(event)
            }
            if (!controller.signal.aborted) io.line(paint(io.caps, "yellow", "事件流已断开,3s 后重连…"))
          } catch {
            if (!controller.signal.aborted) io.line(paint(io.caps, "yellow", "事件流已断开,3s 后重连…"))
          }
          if (controller.signal.aborted) return
          await new Promise((resolve) => setTimeout(resolve, options.reconnectDelayMs ?? 3000))
        }
      })()

      const locked = () => ["running", "retrying", "awaiting permission", "awaiting question"].includes(renderer.status())

      options.lineSource.setSigintHandler?.(() => {
        if (locked()) {
          io.line(paint(io.caps, "dim", "已请求取消运行(Ctrl+C)"))
          void adapter.cancelRun(sessionID).catch(() => {})
          return
        }
        options.lineSource.close()
      })

      try {
        while (true) {
          const line = await options.lineSource.next()
          if (line === null) return
          const text = line.trim()
          if (!text) continue
          if (text.startsWith("/")) {
            const [command, ...rest] = text.slice(1).split(/\s+/)
            if (command === "quit" || command === "exit") return
            if (command === "help") io.line(HELP)
            else if (command === "cancel") {
              await adapter.cancelRun(sessionID)
              io.line(paint(io.caps, "dim", "已请求取消运行"))
            } else if (command === "continue") {
              await adapter.continueRun(sessionID)
              io.line(paint(io.caps, "dim", "正在继续运行"))
            } else if (command === "skills") {
              const skills = await adapter.listSkills()
              const ready = skills.filter((skill) => skill.status === "ready")
              if (ready.length === 0) io.line(paint(io.caps, "dim", "暂无可用 Skill"))
              for (const skill of ready) io.line(`${paint(io.caps, "cyan", `@${skill.id}`)} ${paint(io.caps, "dim", skill.description)}`)
            } else if (command === "new") {
              const created = (await client.experimental.nexum.session.create({ directory: process.cwd(), ...(rest[0] ? { name: rest.join(" ") } : {}) })).data
              switchTo = created.id
              io.line(paint(io.caps, "green", `✓ 已创建会话 ${created.id}`))
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
              io.line(paint(io.caps, "dim", `会话 ${sessionID} · 已清屏`))
            } else if (command === "events") {
              if (recentEvents.length === 0) io.line(paint(io.caps, "dim", "本轮还没有事件"))
              for (const item of recentEvents.slice(-20)) io.line(paint(io.caps, "dim", item))
            } else if (command === "thinking") {
              const mode = rest[0] === "full" ? "full" : "summary"
              renderer.setThinkingMode(mode)
              io.line(paint(io.caps, "dim", `思考展示:${mode}`))
            } else if (command === "expand") renderer.expandLastReasoning()
            else io.line(paint(io.caps, "yellow", `未知命令 /${command},输入 /help 查看帮助`))
            continue
          }
          if (locked()) {
            io.line(paint(io.caps, "yellow", "Agent 正在回复,/cancel 取消本轮"))
            continue
          }
          await adapter.sendMessage({ sessionID, text }).catch((error: unknown) => {
            io.line(paint(io.caps, "red", `发送失败:${error instanceof Error ? error.message : "未知错误"}`))
          })
        }
      } finally {
        controller.abort()
        await interactionQueue.catch(() => {})
        await pump.catch(() => {})
        renderer.close()
      }
      if (!switchTo) return
      sessionID = switchTo
    }
  } finally {
    options.lineSource.close()
  }
}
