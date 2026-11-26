/** REPL 交互循环:懒创建会话 → 历史回放 → 事件订阅 → 输入分发,交互请求走顺序队列;输入框仅在空闲时绘制。 */

import { createInterface } from "node:readline/promises"
import type { NexumEvent } from "@nexum/client"
import type { ChatProtocolAdapter } from "@nexum/surface-adapter"
import { cmdMcpList, cmdModelGet, cmdStatus, cmdTheme } from "./admin"
import { cmdResume, cmdSessionList, type NexumClient } from "./commands"
import { askPermission, askQuestion, permissionFromEvent, questionFromEvent, type Prompter } from "./interact"
import { cmdPermission, permissionStatusText } from "./permission"
import { createRenderer, historyLines } from "./render"
import { displayWidth, paint, type TermCaps } from "./term"
import type { CliIO } from "./io"

export type LineSource = {
  next(): Promise<string | null>
  close(): void
  setSigintHandler?(handler: () => void): void
  /** 绘制输入提示(有输入框时画框);运行中不调用,输出保持干净。 */
  showPrompt?(): void
  /** 更新输入框提示行右侧的状态段(已着色;空串表示无状态段),下次画框生效。 */
  setStatus?(text: string): void
}

export function arrayLineSource(lines: readonly string[]): LineSource {
  let index = 0
  return {
    next: async () => (index < lines.length ? lines[index++]! : null),
    close: () => {},
  }
}

export type InputBox = {
  readonly top: string
  readonly hint: string
  readonly inputPrefix: string
  readonly spacer: string
  readonly bottom: string
  /** 未着色的提示文本与框宽,供状态段右对齐时重新计算留白。 */
  readonly hintText: string
  readonly width: number
  readonly caps: TermCaps
}

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
    hintText,
    width,
    caps,
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
      // slash 命令名补全:行首 / 且光标仍在命令名 token 内;前缀优先,无命中退回子串模糊
      const command = line.match(/^\/(\S*)$/)
      if (command) {
        const query = command[1]!.toLowerCase()
        const names = SLASH_COMMANDS.map((cmd) => cmd.name)
        const prefix = names.filter((name) => name.startsWith(query))
        const hits = prefix.length > 0 ? prefix : names.filter((name) => name.includes(query))
        return [hits.map((name) => `/${name} `), line]
      }
      // 子命令补全:已完成的命令 + 空格后的第二个 token
      const sub = line.match(/^\/(\S+)\s+(\S*)$/)
      if (sub) {
        const cmd = SLASH_COMMANDS.find((entry) => entry.name === sub[1])
        if (!cmd?.subcommands) return [[], line]
        const hits = cmd.subcommands.filter((name) => name.startsWith(sub[2]!.toLowerCase()))
        return [hits.map((name) => `${name} `), sub[2]!]
      }
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
  let status = ""
  // 提示行右侧状态段:按显示宽度右对齐到框宽(与顶/底边同宽);无状态或宽度放不下时退回纯提示行。
  const hintRow = (box: InputBox) => {
    if (status === "") return box.hint
    const pad = box.width - 2 - displayWidth(box.hintText) - displayWidth(status.replace(/\x1b\[[0-9;]*m/g, ""))
    if (pad < 1) return box.hint
    return `${paint(box.caps, "cyan", "│")} ${paint(box.caps, "dim", box.hintText)}${" ".repeat(pad)}${status}`
  }
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
    setStatus: (text) => {
      status = text
    },
    showPrompt: () => {
      if (closed || promptActive) return
      promptActive = true
      if (box) {
        output.write(`${box.top}\n${hintRow(box)}\n`)
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

/** slash 命令清单:HELP 与 Tab 补全的单一数据源;solo 表示在 HELP 中独占一行(不与下一条同行)。 */
type SlashCommand = {
  readonly name: string
  readonly args?: string
  readonly desc: string
  readonly subcommands?: readonly string[]
  readonly solo?: boolean
}

const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: "help", desc: "显示帮助" },
  { name: "new", args: "[名称]", desc: "新会话(首条消息时创建)" },
  { name: "sessions", desc: "列出会话" },
  { name: "use", args: "<id>", desc: "切换会话" },
  { name: "resume", desc: "交互式恢复会话" },
  { name: "status", desc: "连接与配置总览" },
  { name: "skills", desc: "列出可用 Skill" },
  { name: "mcp", desc: "MCP 列表" },
  { name: "model", desc: "当前模型" },
  { name: "theme", desc: "查看/切换主题" },
  { name: "permissions", desc: "查看/切换权限", subcommands: ["mode", "allow", "deny", "remove"] },
  { name: "events", desc: "最近事件" },
  { name: "clear", desc: "清屏", solo: true },
  { name: "cancel", desc: "取消当前运行" },
  { name: "continue", desc: "继续上次运行" },
  { name: "thinking", args: "live|summary|full", desc: "", subcommands: ["live", "summary", "full"] },
  { name: "expand", desc: "展开最近思考" },
  { name: "quit", desc: "退出", solo: true },
]

/** 两列 HELP:命令段补齐到 13 列,描述段补齐到 18 列(与既有手写排版一致);无描述的条目(如 /thinking)只占命令段。 */
const HELP = (() => {
  const cell = (cmd: SlashCommand) => {
    const label = `/${cmd.name}${cmd.args ? ` ${cmd.args}` : ""}`
    return label + " ".repeat(Math.max(1, 13 - displayWidth(label)))
  }
  const descCell = (cmd: SlashCommand) => (cmd.desc === "" ? "" : cmd.desc + " ".repeat(Math.max(1, 18 - displayWidth(cmd.desc))))
  const lines = ["可用命令:"]
  for (let index = 0; index < SLASH_COMMANDS.length; index++) {
    const cmd = SLASH_COMMANDS[index]!
    const next = SLASH_COMMANDS[index + 1]
    if (cmd.solo || !next || next.solo) {
      lines.push(`  ${cell(cmd)}${cmd.desc}`.trimEnd())
      continue
    }
    lines.push(`  ${cell(cmd)}${descCell(cmd)}${cell(next)}${next.desc}`.trimEnd())
    index += 1
  }
  return lines.join("\n")
})()

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

  // 权限状态段:启动时获取,/permissions 变更与权限回复(allow_always 会写规则)后刷新;失败静默置空。
  const refreshPermission = async () => {
    if (!options.lineSource.setStatus) return
    const status = await client.experimental.nexum.permissionPolicy
      .list()
      .then((list) => permissionStatusText(io.caps, list.data))
      .catch(() => "")
    options.lineSource.setStatus?.(status)
  }
  await refreshPermission()

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
              await refreshPermission()
              // 拒绝后服务器会失败本次运行,由 run.settled 收敛,不恢复执行行
              if (decision !== "deny") renderer.resumeTool()
              return
            }
            const request = questionFromEvent(data, id)
            if (!request) return
            const answers = await askQuestion(io, options.prompter, request)
            if (answers === "cancel") {
              io.line(paint(io.caps, "dim", "已取消补充信息"))
              // 取消后运行由后续事件收敛,不恢复执行行
              try {
                await adapter.cancelQuestion({ sessionID: id, requestID: request.id })
              } catch (error) {
                io.line(paint(io.caps, "red", `取消提交失败:${error instanceof Error ? error.message : "未知错误"}`))
              }
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
          renderer.flushThinking()
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
            // slash 输出落在思考 live 区域外:先收起区域,避免 collapse 上移擦除吞掉插入行
            renderer.flushThinking()
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
              for (const skill of ready) io.line(paint(io.caps, "cyan", `@${skill.id}`))
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
            else if (command === "permissions") {
              await cmdPermission(client, io, rest)
              await refreshPermission()
            }
            else if (command === "clear") {
              io.write("\x1b[2J\x1b[H")
              io.line(paint(io.caps, "dim", sessionID ? `会话 ${sessionID} · 已清屏` : "已清屏"))
            } else if (command === "events") {
              if (recentEvents.length === 0) io.line(paint(io.caps, "dim", "本轮还没有事件"))
              for (const item of recentEvents.slice(-20)) io.line(paint(io.caps, "dim", item))
            } else if (command === "thinking") {
              const mode = rest[0] === "summary" || rest[0] === "full" ? rest[0] : "live"
              renderer.setThinkingMode(mode)
              io.line(paint(io.caps, "dim", `思考展示:${mode}`))
            } else if (command === "expand") renderer.expandLastReasoning()
            else io.line(paint(io.caps, "yellow", `未知命令 /${command},输入 /help 查看帮助`))
            if (!locked()) options.lineSource.showPrompt?.()
            continue
          }
          if (locked()) {
            renderer.flushThinking()
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
