import type { PermissionPort, ToolRequest } from "./index.js"
import type { HeadlessSkillRegistry, HeadlessSkillSummary } from "./skill-registry.js"

/** Skill mention 在原始用户输入中的位置。 */
export interface HeadlessSkillMention {
  /** 原始输入中的起始 UTF-16 下标。 */
  readonly start: number
  /** 原始输入中的结束 UTF-16 下标。 */
  readonly end: number
  /** 包含 @ 前缀的原始 mention 文本。 */
  readonly text: string
}
/** 一次 Skill 激活后附着到 Prompt 的内容。 */
export interface HeadlessSkillAttachment {
  /** Registry 中稳定的 Skill ID。 */
  readonly id: string
  /** 对 UI 和模型展示的 Skill 名称。 */
  readonly name: string
  /** 经过授权后读取的 Skill 指令文本。 */
  readonly text: string
  /** 触发该附件的首次 mention。 */
  readonly mention: HeadlessSkillMention
}

/** Skill 激活产生的系统消息。 */
export interface HeadlessSkillSystemMessage {
  /** 固定为 system，避免 Skill 指令被误当作用户内容。 */
  readonly role: "system"
  /** 包裹后的 Skill 指令内容。 */
  readonly content: string
  /** 用于上下文来源识别和去重的稳定标识。 */
  readonly sourceID: string
}

/** Skill 解析后供 Coding Loop 使用的 Prompt 增量。 */
export interface HeadlessSkillPrompt {
  /** 本次 Prompt 实际激活的 Skill 附件。 */
  readonly skills: readonly HeadlessSkillAttachment[]
  readonly systemMessages: readonly HeadlessSkillSystemMessage[]
}

/** Skill 激活请求。 */
export interface HeadlessSkillInvocationInput {
  readonly sessionID: string
  readonly text: string
}

/** 可替换的 Skill 激活端口。 */
export interface HeadlessSkillInvocationPort {
  readonly resolve: (input: HeadlessSkillInvocationInput) => Promise<HeadlessSkillPrompt>
}

/** Skill 激活失败的稳定错误码。 */
export type HeadlessSkillInvocationErrorCode = "skill_not_found" | "skill_not_ready" | "skill_permission_denied"

/** Skill 激活失败错误，供 API/UI 映射稳定错误码。 */
export class HeadlessSkillInvocationError extends Error {
  constructor(
    readonly code: HeadlessSkillInvocationErrorCode,
    message: string,
    readonly skillID: string,
  ) {
    super(message)
    this.name = "HeadlessSkillInvocationError"
  }
}

/** Skill 激活端口依赖。 */
export interface HeadlessSkillInvocationOptions {
  readonly registry: HeadlessSkillRegistry
  readonly permission: PermissionPort
}

/** 单个 Skill 激活的内部参数。 */
interface SkillActivationInput {
  readonly sessionID: string
  readonly mention: HeadlessSkillMention
  readonly summaries: readonly HeadlessSkillSummary[]
  readonly options: HeadlessSkillInvocationOptions
}

/** 用户输入中 Skill mention 的识别规则。 */
const SKILL_MENTION = /@([a-z0-9]+(?:-[a-z0-9]+)*)/g

/** Skill 主说明文件的固定相对路径。 */
const SKILL_INSTRUCTION_FILE = "SKILL.md"

/** Skill 激活必须经过的统一权限动作。 */
const SKILL_PERMISSION_ACTION = "skill.use"

/**
 * 创建独立的 Skill 激活端口。
 *
 * 该端口只解析显式 @skill，并通过 skill.use 权限请求加载 SKILL.md。
 * @param options - Registry 与权限端口
 * @returns 可被 Coding Loop 复用的 Skill Prompt 解析器
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
export function createHeadlessSkillInvocationPort(options: HeadlessSkillInvocationOptions): HeadlessSkillInvocationPort {
  return {
    resolve: (input) => resolveSkillPrompt(input, options),
  }
}

/**
 * 解析一条用户输入并加载其显式 Skill。
 *
 * 同一个 Skill 的重复 mention 只激活一次，并保留首次出现的位置。
 * @param input - Session 与用户原始输入
 * @param options - Skill Registry 与权限端口
 * @returns Skill 附件和系统消息
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function resolveSkillPrompt(
  input: HeadlessSkillInvocationInput,
  options: HeadlessSkillInvocationOptions,
): Promise<HeadlessSkillPrompt> {
  // 先解析文本，再一次性读取摘要，避免在每个 mention 上重复扫描 Registry。
  const mentions = parseSkillMentions(input.text)
  const unique = deduplicateMentions(mentions)
  const summaries = await options.registry.list()
  const attachments: HeadlessSkillAttachment[] = []
  // 权限请求按 mention 顺序串行发出，保证 UI 的审批顺序稳定。
  for (const mention of unique) {
    attachments.push(await activateSkill({ sessionID: input.sessionID, mention, summaries, options }))
  }
  // 系统消息按激活顺序生成，后续由 Coding Loop 放在用户消息之前。
  return {
    skills: attachments,
    systemMessages: attachments.map(toSystemMessage),
  }
}

/**
 * 提取合法 Skill ID 及原文范围。
 * @param text - 用户原始输入
 * @returns 按输入顺序排列的 mention
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function parseSkillMentions(text: string): HeadlessSkillMention[] {
  const mentions: HeadlessSkillMention[] = []
  // matchAll 保留 UTF-16 下标，范围可直接回填到原始用户输入。
  for (const match of text.matchAll(SKILL_MENTION)) {
    const start = match.index ?? 0
    const mentionText = match[0]
    mentions.push({ start, end: start + mentionText.length, text: mentionText })
  }
  // 没有 mention 时返回空数组，调用方无需分支处理 undefined。
  return mentions
}

/**
 * 按 Skill ID 去重而不改变首次出现顺序。
 * @param mentions - 原始 mention 列表
 * @returns 每个 Skill 的首次 mention
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function deduplicateMentions(mentions: readonly HeadlessSkillMention[]): HeadlessSkillMention[] {
  const seen = new Set<string>()
  return mentions.filter((mention) => {
    const id = mention.text.slice(1)
    // 重复 mention 只保留第一次，避免重复审批和重复注入上下文。
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/**
 * 对单个 mention 执行 Registry 查询、权限审批和内容读取。
 * @param input - 单个 Skill 激活的上下文参数
 * @returns 已加载的 Skill 附件
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function activateSkill(input: SkillActivationInput): Promise<HeadlessSkillAttachment> {
  const id = input.mention.text.slice(1)
  const summary = findSkillSummary(input.summaries, id)
  assertSkillReady(summary, id)
  await requestSkillPermission(input.options.permission, input.sessionID, id)
  const skill = await input.options.registry.get(id)
  assertSkillReadable(skill, id)
  // 只读取主说明文件，附加 references/scripts 仍由 Skill 自己声明和引导。
  return { id: skill.id, name: skill.name, text: await skill.read(SKILL_INSTRUCTION_FILE), mention: input.mention }
}

/**
 * 按 ID 查找 Skill 摘要。
 * @param summaries - Registry 快照
 * @param skillID - 目标 Skill ID
 * @returns 匹配的摘要或 undefined
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function findSkillSummary(summaries: readonly HeadlessSkillSummary[], skillID: string): HeadlessSkillSummary | undefined {
  return summaries.find((item) => item.id === skillID)
}

/**
 * 校验 Skill 已注册且处于可激活状态。
 * @param summary - Registry 摘要
 * @param skillID - 目标 Skill ID
 * @returns 无返回值，失败时抛出稳定错误
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function assertSkillReady(summary: HeadlessSkillSummary | undefined, skillID: string): void {
  // 未注册的 ID 直接返回稳定错误，不触发任何工具或权限动作。
  if (!summary) throw new HeadlessSkillInvocationError("skill_not_found", `Skill 不存在: ${skillID}`, skillID)
  // invalid/conflict Skill 不允许绕过 Registry 状态直接读取。
  if (summary.status !== "ready") {
    throw new HeadlessSkillInvocationError("skill_not_ready", `Skill 不可激活: ${skillID}`, skillID)
  }
}

/**
 * 通过统一 PermissionPort 审批 Skill 激活。
 * @param permission - 权限端口
 * @param sessionID - 当前 Session
 * @param skillID - 目标 Skill ID
 * @returns 权限允许后的完成 Promise
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function requestSkillPermission(permission: PermissionPort, sessionID: string, skillID: string): Promise<void> {
  const request = createSkillPermissionRequest(sessionID, skillID)
  // 权限端口可以阻塞等待 UI 决策，取消由共享 PermissionPort 负责唤醒。
  const effect = await permission.evaluate(request)
  // ask/deny 都不能当作授权，取消时 Broker 会将 pending request 解析为 deny。
  if (effect !== "allow") {
    throw new HeadlessSkillInvocationError("skill_permission_denied", `Skill 权限被拒绝: ${skillID}`, skillID)
  }
}

/**
 * 校验审批后仍可读取的 Skill 包。
 * @param skill - Registry 返回的 Skill 包
 * @param skillID - 目标 Skill ID
 * @returns 非空 Skill 包
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function assertSkillReadable<T>(skill: T | undefined, skillID: string): asserts skill is T {
  // Registry 在审批期间可能刷新，读取不到时按不可用处理。
  if (!skill) throw new HeadlessSkillInvocationError("skill_not_ready", `Skill 不可读取: ${skillID}`, skillID)
}

/**
 * 构造统一的 skill.use 权限请求。
 * @param sessionID - 当前 Session
 * @param skillID - 已校验的 Skill ID
 * @returns 权限端口可消费的请求
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function createSkillPermissionRequest(sessionID: string, skillID: string): ToolRequest {
  // skill.use 使用与普通工具相同的 ToolRequest 形状，保持权限边界统一。
  return {
    sessionID,
    toolName: "skill",
    action: SKILL_PERMISSION_ACTION,
    resource: skillID,
    input: { skillID },
  }
}

/**
 * 把 Skill 附件转换为模型可见的系统消息。
 * @param attachment - 已授权并读取的 Skill
 * @returns 带稳定 sourceID 的系统消息
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function toSystemMessage(attachment: HeadlessSkillAttachment): HeadlessSkillSystemMessage {
  // sourceID 用于上下文压缩与项目上下文恢复时的来源去重。
  return {
    role: "system",
    content: `<skill_content id="${attachment.id}">\n${attachment.text}\n</skill_content>`,
    sourceID: `skill:${attachment.id}`,
  }
}
