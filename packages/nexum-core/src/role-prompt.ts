/** Nexum 默认角色提示词的持久化端口。 */

export type NexumRolePromptSource = "default" | "custom"

export interface NexumRolePrompt {
  readonly prompt: string
  readonly source: NexumRolePromptSource
  readonly updatedAt?: string
}

export interface NexumRolePromptStore {
  readonly get: () => Promise<NexumRolePrompt>
  readonly update: (prompt: string) => Promise<NexumRolePrompt>
  readonly reset: () => Promise<NexumRolePrompt>
}

export type NexumRolePromptErrorCode = "invalid_prompt"

export class NexumRolePromptError extends Error {
  constructor(readonly code: NexumRolePromptErrorCode, message: string) {
    super(message)
    this.name = "NexumRolePromptError"
  }
}

export const NEXUM_DEFAULT_ROLE_PROMPT =
  "你是 Nexum Agent。请使用中文理解任务并回答；需要解释时使用清晰、简洁的中文。遵守系统和用户指令，不编造执行结果。"
