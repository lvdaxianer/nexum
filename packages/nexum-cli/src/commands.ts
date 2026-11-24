/** 会话类一次性命令:session list / session create / prompt(流式,退出码 0/1/130)。 */

import { Nexum } from "@nexum/client"
import type { ChatProtocolAdapter } from "@nexum/surface-adapter"
import { askPermission, askQuestion, permissionFromEvent, questionFromEvent, type Prompter } from "./interact"
import { createRenderer } from "./render"
import { paint } from "./term"
import type { CliIO } from "./io"

export type NexumClient = ReturnType<typeof Nexum.make>

const STATUS_LABELS: Record<string, string> = {
  idle: "空闲",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
}

function statusText(io: CliIO, status: string): string {
  const label = STATUS_LABELS[status] ?? status
  if (status === "completed") return paint(io.caps, "green", label)
  if (status === "failed") return paint(io.caps, "red", label)
  if (status === "cancelled") return paint(io.caps, "dim", label)
  if (status === "running") return paint(io.caps, "cyan", label)
  return paint(io.caps, "dim", label)
}

export async function cmdSessionList(client: NexumClient, io: CliIO): Promise<void> {
  const sessions = (await client.experimental.nexum.session.list()).data
  io.line(`${paint(io.caps, "dim", "ID        名称            目录                状态     更新于")}`)
  for (const session of sessions) {
    const id = paint(io.caps, "blue", session.id.slice(0, 8).padEnd(8))
    const name = session.name.slice(0, 14).padEnd(14)
    const directory = session.directory.slice(-18).padEnd(18)
    io.line(`${id}  ${name}  ${directory}  ${statusText(io, session.status)}  ${session.updatedAt.slice(0, 16).replace("T", " ")}`)
  }
  if (sessions.length === 0) io.line(paint(io.caps, "dim", "暂无会话,nexum session create 创建"))
}

export async function cmdSessionCreate(client: NexumClient, io: CliIO, input: { directory: string; name?: string }): Promise<void> {
  const session = (await client.experimental.nexum.session.create(input)).data
  io.line(`${paint(io.caps, "green", "✓")} 已创建会话 ${paint(io.caps, "blue", session.id)}`)
}

export async function resolveSessionID(client: NexumClient, io: CliIO, requested?: string): Promise<string> {
  if (requested) return requested
  const sessions = (await client.experimental.nexum.session.list()).data
  const latest = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (latest) return latest.id
  const created = (await client.experimental.nexum.session.create({ directory: process.cwd() })).data
  io.line(paint(io.caps, "dim", `已创建会话 ${created.id}`))
  return created.id
}

/** 交互式恢复会话:编号列出,选择后返回会话 ID;取消或无效返回 undefined。 */
export async function cmdResume(client: NexumClient, io: CliIO, prompter: Prompter): Promise<string | undefined> {
  const sessions = (await client.experimental.nexum.session.list()).data
  if (sessions.length === 0) {
    io.line(paint(io.caps, "dim", "暂无可恢复的会话,nexum session create 创建"))
    return undefined
  }
  io.line(paint(io.caps, "dim", "选择会话:"))
  sessions.forEach((session, index) => {
    const id = paint(io.caps, "blue", session.id.slice(0, 8))
    io.line(`  ${paint(io.caps, "blue", `${index + 1})`)} ${id}  ${session.name}  ${paint(io.caps, "dim", session.directory)}  ${statusText(io, session.status)}  ${paint(io.caps, "dim", session.updatedAt.slice(0, 16).replace("T", " "))}`)
  })
  const answer = (await prompter(paint(io.caps, "cyan", "选择 › "))).trim()
  const index = Number.parseInt(answer, 10) - 1
  if (!Number.isInteger(index) || index < 0 || index >= sessions.length) {
    io.line(paint(io.caps, "dim", "已取消恢复"))
    return undefined
  }
  return sessions[index]!.id
}

export type PromptOptions = {
  readonly client: NexumClient
  readonly adapter: ChatProtocolAdapter
  readonly io: CliIO
  readonly prompter: Prompter
  readonly text: string
  readonly sessionID?: string
  readonly directory: string
}

export async function cmdPrompt(options: PromptOptions): Promise<number> {
  const { client, adapter, io, prompter } = options
  const sessionID = options.sessionID ?? (await client.experimental.nexum.session.create({ directory: options.directory })).data.id
  if (!options.sessionID) io.line(paint(io.caps, "dim", `会话 ${sessionID}`))
  const renderer = createRenderer({ io })
  let settled: "completed" | "failed" | "cancelled" | undefined
  let interrupted = false
  const onSigint = () => {
    interrupted = true
    void adapter.cancelRun(sessionID).catch(() => {})
  }
  process.once("SIGINT", onSigint)
  try {
    await adapter.sendMessage({ sessionID, text: options.text })
    for await (const event of adapter.subscribeEvents({ sessionID })) {
      renderer.event(event)
      if (event.type === "permission.requested") {
        const request = permissionFromEvent((event.data ?? {}) as Record<string, unknown>, sessionID)
        if (!request) continue
        if (!io.caps.isTTY) {
          await adapter.replyPermission({ sessionID, requestID: request.id, decision: "deny" })
          io.line(paint(io.caps, "yellow", "非交互环境,权限已自动拒绝"))
          continue
        }
        const decision = await askPermission(io, prompter, request)
        await adapter.replyPermission({ sessionID, requestID: request.id, decision })
        continue
      }
      if (event.type === "question.request") {
        const request = questionFromEvent((event.data ?? {}) as Record<string, unknown>, sessionID)
        if (!request) continue
        if (!io.caps.isTTY) {
          await adapter.cancelQuestion({ sessionID, requestID: request.id })
          io.line(paint(io.caps, "yellow", "非交互环境,补充信息已取消"))
          continue
        }
        const answers = await askQuestion(io, prompter, request)
        if (answers === "cancel") await adapter.cancelQuestion({ sessionID, requestID: request.id })
        else await adapter.replyQuestion({ sessionID, requestID: request.id, answers })
        continue
      }
      if (event.type === "run.settled") {
        const data = (event.data ?? {}) as Record<string, unknown>
        settled = data.result === "failed" || data.result === "cancelled" ? data.result : "completed"
        break
      }
    }
  } finally {
    process.removeListener("SIGINT", onSigint)
    renderer.close()
  }
  if (settled === "completed") return 0
  if (settled === "cancelled" || interrupted) return 130
  return 1
}
