/** Permission / Question 的终端问答流:编号选项,按题序提交二维数组。 */

import type { NexumPermission, NexumQuestion } from "@nexum/client"
import type { CliIO } from "./io"
import { paint, style } from "./term"

export type Prompter = (query: string) => Promise<string>

export type PermissionDecision = "allow_once" | "allow_always" | "deny"

export async function askPermission(io: CliIO, prompter: Prompter, request: NexumPermission): Promise<PermissionDecision> {
  io.line(style(io.caps, ["yellow", "bold"], "⚠ 需要权限确认"))
  io.line(`  ${style(io.caps, ["bold"], request.action)} · ${request.resource}`)
  if (request.reason) io.line(paint(io.caps, "dim", `  原因: ${request.reason}`))
  io.line(`  ${paint(io.caps, "blue", "[1]")} 允许一次   ${paint(io.caps, "blue", "[2]")} 始终允许   ${paint(io.caps, "blue", "[3]")} 拒绝`)
  while (true) {
    const answer = (await prompter(paint(io.caps, "cyan", "选择 › "))).trim()
    if (answer === "1") return "allow_once"
    if (answer === "2") return "allow_always"
    if (answer === "3") return "deny"
    io.line(paint(io.caps, "dim", "请输入 1、2 或 3"))
  }
}

export async function askQuestion(io: CliIO, prompter: Prompter, request: NexumQuestion): Promise<readonly (readonly string[])[] | "cancel"> {
  io.line(style(io.caps, ["cyan", "bold"], "? 需要补充信息"))
  const answers: string[][] = []
  for (const [index, question] of request.questions.entries()) {
    io.line(`  ${style(io.caps, ["bold"], `${index + 1}. ${question.question}`)}`)
    question.options.forEach((option, optionIndex) => {
      const description = option.description ? paint(io.caps, "dim", ` — ${option.description}`) : ""
      io.line(`     ${paint(io.caps, "blue", `${optionIndex + 1})`)} ${option.label}${description}`)
    })
    while (true) {
      const hint = question.multiple ? "回答(多选逗号分隔,c 取消) › " : "回答(c 取消) › "
      const answer = (await prompter(paint(io.caps, "cyan", hint))).trim()
      if (answer === "c") return "cancel"
      const picks = answer.split(/[,\s]+/).filter(Boolean)
      const indexes = picks.map((pick) => Number.parseInt(pick, 10) - 1)
      const valid =
        picks.length > 0 &&
        indexes.every((i) => Number.isInteger(i) && i >= 0 && i < question.options.length) &&
        (question.multiple === true || indexes.length === 1)
      if (!valid) {
        io.line(paint(io.caps, "dim", "无效选择,请重试"))
        continue
      }
      answers.push(indexes.map((i) => question.options[i]!.label))
      break
    }
  }
  return answers
}

export function permissionFromEvent(data: Record<string, unknown>, sessionID: string): NexumPermission | undefined {
  const id = stringValue(data.requestID)
  const action = stringValue(data.action)
  const resource = stringValue(data.resource)
  if (!id || !action || !resource) return undefined
  const reason = stringValue(data.reason)
  return { id, sessionID, action, resource, ...(reason ? { reason } : {}) }
}

export function questionFromEvent(data: Record<string, unknown>, sessionID: string): NexumQuestion | undefined {
  const id = stringValue(data.requestID)
  if (!id || !Array.isArray(data.questions)) return undefined
  const questions = data.questions.filter(isQuestion)
  if (questions.length === 0) return undefined
  return { id, sessionID, toolCallID: stringValue(data.toolCallID), questions }
}

function isQuestion(value: unknown): value is NexumQuestion["questions"][number] {
  if (!value || typeof value !== "object") return false
  const question = value as Record<string, unknown>
  return typeof question.header === "string" && typeof question.question === "string" && Array.isArray(question.options) && question.options.every(isOption)
}

function isOption(value: unknown): value is { label: string; description: string } {
  if (!value || typeof value !== "object") return false
  const option = value as Record<string, unknown>
  return typeof option.label === "string" && typeof option.description === "string"
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}
