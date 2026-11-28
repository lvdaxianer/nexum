import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import { createChatProtocolAdapter } from "./index"
import type {
  ChatHistoryPage,
  ChatProtocolAdapter,
  ChatSessionID,
  ChatStateSnapshot,
  NexumEvent,
  NexumPermission,
  NexumQuestion,
  NexumSession,
  NexumSessionMessages,
  NexumSkill,
} from "./index"
import { Marked } from "marked"
import DOMPurify from "dompurify"

type ChatStatus = "streaming" | "running" | "waiting" | "completed" | "failed" | "cancelled"
type PermissionRequest = NexumPermission
type QuestionRequest = NexumQuestion
type ContextSource = { readonly sourceID: string; readonly kind: string; readonly path: string }
type SurfaceStatus = ChatStatus | ChatStateSnapshot["session"]["status"] | "no session" | "retrying" | "awaiting permission" | "awaiting question"

export type ChatFileContext = {
  readonly name: string
  readonly text: string
}

export type ChatItemKind = "user" | "assistant" | "reasoning" | "execution" | "status"

export type ChatItem = {
  readonly id: string
  readonly kind: ChatItemKind
  readonly title: string
  readonly content?: string
  readonly sourceContent?: string
  readonly detail?: string
  readonly thinking?: boolean
  readonly thinkingStatus?: string
  readonly startedAt?: string
  readonly elapsedMs?: number
  readonly skillIDs?: readonly string[]
  readonly attachmentName?: string
  readonly status: ChatStatus
  readonly localTime: string
  readonly eventType?: string
}

export type ChatSurfaceProps = {
  readonly sessionID: ChatSessionID
  readonly adapter?: ChatProtocolAdapter
  readonly client?: Parameters<typeof createChatProtocolAdapter>[0]
  readonly class?: string
  /** 标头标题（如当前 Session 名称）；不设置则不渲染标头。 */
  readonly title?: string
  /** 组件根节点的 data-theme 值（如 "dark"），不设置则使用默认亮色。 */
  readonly theme?: string
  /** 宿主注入输入栏的扩展内容（如权限模式入口），渲染在发送键左侧。 */
  readonly composerExtras?: JSX.Element
  /** 当前生效的模型名；设置后作为 chip 显示在输入栏，便于确认本轮调用走哪个模型。 */
  readonly model?: string
  /** 宿主判定当前不可发送时的提示（如未配置模型）；设置后输入、上传与发送全部禁用并展示该提示。 */
  readonly composerDisabledHint?: string
  /** 用户从组件内请求打开权限设置时调用（请求条「权限设置」）。 */
  readonly onOpenPermissionSettings?: () => void
  /** 当前 Session 进入终态时通知宿主同步外层列表。 */
  readonly onSessionStatusChange?: (sessionID: ChatSessionID, status: NexumSession["status"]) => void
  /**
   * 当前 Session 收到 Skill registry 变更时通知宿主刷新管理列表。
   */
  readonly onSkillUpdated?: () => void
}

const historyPageSize = 50
const KIB_BYTES = 1024
const CHAT_FILE_MAX_KIB = 512
export const CHAT_FILE_MAX_BYTES = CHAT_FILE_MAX_KIB * KIB_BYTES
const CHAT_FILE_EXTENSIONS = [".md", ".txt"] as const
const CHAT_FILE_ACCEPT = ".md,.txt,text/markdown,text/plain"
const CHAT_FILE_CONTEXT_START = "【本地上传文件上下文开始】"
const CHAT_FILE_CONTEXT_END = "【本地上传文件上下文结束】"
const CHAT_FILE_BODY_START = "【文件正文开始】"
const CHAT_FILE_BODY_END = "【文件正文结束】"
const CHAT_FILE_CONTEXT_INSTRUCTION = "以下正文已经由浏览器读取并随本条消息发送。请直接使用正文回答，不要根据文件名调用 read、ls 或其他工作目录工具查找文件。"
const LEGACY_CHAT_FILE_NAME_PREFIX = "【文件："
const LEGACY_CHAT_FILE_END_MARKER = "【文件结束】"
const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    link({ href, title, tokens }) {
      const titleAttr = title ? ` title="${escapeAttribute(title)}"` : ""
      const text = this.parser.parseInline(tokens)
      return `<a href="${escapeAttribute(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
    },
  },
})

/**
 * 校验聊天附件是否为支持的文本文件。
 *
 * @param file - 待校验的文件元数据
 * @returns 通过时返回 undefined，否则返回可直接展示的错误消息
 * @author lvdaxianer@yeah.net
 * @date 2026-11-26
 */
export function validateChatFile(file: Pick<File, "name" | "size">): string | undefined {
  const name = file.name.toLowerCase()
  if (!CHAT_FILE_EXTENSIONS.some((extension) => name.endsWith(extension))) return "只支持 .md 和 .txt 文件"
  if (file.size > CHAT_FILE_MAX_BYTES) return `文件不能超过 ${CHAT_FILE_MAX_KIB} KiB`
  return undefined
}

/**
 * 将用户问题和已读取的文件文本组成一次 Prompt。
 *
 * @param text - 用户输入的问题
 * @param file - 已读取的文件上下文
 * @returns 包含文件名、全文和结束标记的最终 Prompt
 * @author lvdaxianer@yeah.net
 * @date 2026-11-26
 */
export function composeChatPrompt(text: string, file: ChatFileContext): string {
  return [
    text,
    "",
    CHAT_FILE_CONTEXT_START,
    CHAT_FILE_CONTEXT_INSTRUCTION,
    `文件名：${file.name}`,
    CHAT_FILE_BODY_START,
    file.text,
    CHAT_FILE_BODY_END,
    CHAT_FILE_CONTEXT_END,
  ].join("\n")
}

/** 渲染不可信模型输出，并限制链接打开行为。 */
function MarkdownView(props: { readonly content: string; readonly class?: string }) {
  return <div class={props.class} innerHTML={DOMPurify.sanitize(markdown.parse(props.content, { async: false }))} />
}

/** 完整的、以 Session 为边界的可嵌入聊天组件。 */
export function ChatSurface(props: ChatSurfaceProps) {
  const adapter = props.adapter ?? createChatProtocolAdapter(props.client)
  const [prompt, setPrompt] = createSignal("")
  const [status, setStatus] = createSignal<SurfaceStatus>("no session")
  const [chatItems, setChatItems] = createSignal<ChatItem[]>([])
  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([])
  const [questions, setQuestions] = createSignal<QuestionRequest[]>([])
  const [questionAnswers, setQuestionAnswers] = createSignal<Record<string, string[][]>>({})
  const [skills, setSkills] = createSignal<readonly NexumSkill[]>([])
  const [activeSkillIDs, setActiveSkillIDs] = createSignal<string[]>([])
  const [contextSources, setContextSources] = createSignal<ContextSource[]>([])
  const [historyBefore, setHistoryBefore] = createSignal<number | undefined>()
  const [historySnapshot, setHistorySnapshot] = createSignal<string | undefined>()
  const [historyHasMore, setHistoryHasMore] = createSignal(false)
  const [historyLoading, setHistoryLoading] = createSignal(false)
  const [historyError, setHistoryError] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [pendingDecisionID, setPendingDecisionID] = createSignal("")
  const [pendingQuestionID, setPendingQuestionID] = createSignal("")
  const [continueAvailable, setContinueAvailable] = createSignal(false)
  const [canCancel, setCanCancel] = createSignal(false)
  const [continueBusy, setContinueBusy] = createSignal(false)
  const [cancelBusy, setCancelBusy] = createSignal(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = createSignal(false)
  const [notice, setNotice] = createSignal("")
  const [fileContext, setFileContext] = createSignal<ChatFileContext | undefined>()
  const [fileBusy, setFileBusy] = createSignal(false)
  const [fileError, setFileError] = createSignal("")

  let conversationBody: HTMLDivElement | undefined
  let fileInput: HTMLInputElement | undefined
  let streamController: AbortController | undefined
  let lifecycle = 0
  let promptSequence = 0
  let skillLoadSequence = 0
  let surfaceRoot: HTMLElement | undefined
  const [followTail, setFollowTail] = createSignal(true)
  const seenEventIDs = new Map<string, Set<string>>()
  const eventSequences = new Map<string, number>()

  const inputLocked = createMemo(() => ["running", "retrying", "awaiting permission", "awaiting question"].includes(status()))
  const skillSuggestions = createMemo(() => {
    const match = prompt().match(/(?:^|\s)@([a-z0-9-]*)$/i)
    if (!match) return []
    const query = match[1]?.toLowerCase() ?? ""
    return skills()
      .filter((skill) => skill.status === "ready" && skill.id.toLowerCase().includes(query))
      .slice(0, 5)
  })

  createEffect(() => {
    const id = props.sessionID
    const currentLifecycle = ++lifecycle
    streamController?.abort()
    resetState(id)
    if (!id) return
    void initialize(id, currentLifecycle)
  })

  onCleanup(() => streamController?.abort())

  function isCurrent(id: string, currentLifecycle: number) {
    return id === props.sessionID && currentLifecycle === lifecycle
  }

  async function initialize(id: string, currentLifecycle: number) {
    setHistoryLoading(true)
    try {
      const [state, history] = await Promise.all([adapter.loadState(id), adapter.loadHistory({ sessionID: id, limit: historyPageSize })])
      if (!isCurrent(id, currentLifecycle)) return
      applyState(state)
      applyHistory(history)
      void loadSkills(id, currentLifecycle)
      void connectEvents(id, currentLifecycle, state.lastSequence)
    } catch (error) {
      if (!isCurrent(id, currentLifecycle)) return
      setHistoryError(messageFrom(error, "聊天数据加载失败，请重试"))
      setNotice(messageFrom(error, "聊天数据加载失败，请重试"))
    } finally {
      if (isCurrent(id, currentLifecycle)) setHistoryLoading(false)
    }
  }

  async function loadSkills(id: string, currentLifecycle: number) {
    const loadSequence = ++skillLoadSequence
    try {
      const nextSkills = await adapter.listSkills()
      if (isCurrent(id, currentLifecycle) && loadSequence === skillLoadSequence) setSkills(nextSkills)
    } catch (error) {
      if (isCurrent(id, currentLifecycle) && loadSequence === skillLoadSequence) {
        setNotice(messageFrom(error, "Skill 列表加载失败"))
      }
    }
  }

  async function refreshPending(id: string) {
    try {
      const state = await adapter.loadState(id)
      if (id !== props.sessionID) return
      setPermissions([...state.pendingPermissions])
      setQuestions([...state.pendingQuestions])
    } catch (error) {
      if (id === props.sessionID) setNotice(messageFrom(error, "交互请求状态刷新失败"))
    }
  }

  async function connectEvents(id: string, currentLifecycle = lifecycle, afterSequence?: number) {
    streamController?.abort()
    const controller = new AbortController()
    streamController = controller
    try {
      const nextAfterSequence = eventSequences.get(id) ?? afterSequence
      for await (const event of adapter.subscribeEvents({ sessionID: id, afterSequence: nextAfterSequence, signal: controller.signal })) {
        if (!isCurrent(id, currentLifecycle) || controller.signal.aborted) return
        const lastSequence = eventSequences.get(id) ?? -1
        if (event.sequence <= lastSequence) continue
        const seen = seenEventIDs.get(id) ?? new Set<string>()
        if (seen.has(event.eventID)) continue
        seen.add(event.eventID)
        seenEventIDs.set(id, seen)
        eventSequences.set(id, event.sequence)
        setChatItems((current) => projectChatEvent(current, event))
        applyEventState(event, id, currentLifecycle)
      }
      if (!controller.signal.aborted && isCurrent(id, currentLifecycle)) scheduleReconnect(id, currentLifecycle)
    } catch (error) {
      if (!controller.signal.aborted && isCurrent(id, currentLifecycle)) {
        setNotice(messageFrom(error, "事件流已断开"))
        scheduleReconnect(id, currentLifecycle)
      }
    } finally {
      if (streamController === controller) streamController = undefined
    }
  }

  /** 断线后 3s 自动重连；Session 切换或组件卸载后 lifecycle 变化会自动失效。 */
  function scheduleReconnect(id: string, currentLifecycle: number) {
    globalThis.setTimeout(() => {
      if (isCurrent(id, currentLifecycle) && !streamController) void connectEvents(id, currentLifecycle)
    }, 3000)
  }

  function applyState(state: ChatStateSnapshot) {
    setStatus(state.session.status)
    setContinueAvailable(state.canContinue)
    setCanCancel(state.canCancel)
    setPermissions([...state.pendingPermissions])
    setQuestions([...state.pendingQuestions])
    setChatItems((current) => mergePendingChatItems(current, state))
  }

  function applyHistory(history: ChatHistoryPage) {
    setHistoryBefore(history.nextBefore)
    setHistorySnapshot(history.snapshotID)
    setHistoryHasMore(history.hasMore)
    setChatItems((current) => mergeHistoryItems(current, historyItemsFromMessages(history.messages)))
  }

  function resetState(id: string) {
    setPrompt("")
    setStatus(id ? "idle" : "no session")
    setChatItems([])
    setFollowTail(true)
    setPermissions([])
    setQuestions([])
    setQuestionAnswers({})
    setSkills([])
    setActiveSkillIDs([])
    setContextSources([])
    setHistoryBefore(undefined)
    setHistorySnapshot(undefined)
    setHistoryHasMore(false)
    setHistoryLoading(false)
    setHistoryError("")
    setBusy(false)
    setContinueAvailable(false)
    setCanCancel(false)
    setContinueBusy(false)
    setCancelBusy(false)
    setCancelConfirmOpen(false)
    clearFileContext()
    setNotice("")
    if (id) {
      seenEventIDs.set(id, new Set())
      eventSequences.delete(id)
    }
  }

  function applyEventState(event: NexumEvent, id: string, currentLifecycle: number) {
    const data = eventDataOf(event.data)
    if (event.type === "model.attempt") {
      setStatus("running")
      setCanCancel(true)
    }
    if (event.type === "model.retry") {
      setStatus("retrying")
      setCanCancel(true)
    }
    if (event.type === "run.settled") {
      const result = runResultFromEvent(data)
      if (result) {
        setStatus(result)
        setCanCancel(false)
        setContinueAvailable(result === "failed")
        setContinueBusy(false)
        setNotice(result === "failed" ? "本轮运行失败，可以继续运行" : result === "completed" ? "本轮运行已完成" : "本轮运行已取消")
        props.onSessionStatusChange?.(id, result)
      }
    }
    if (event.type === "session.completed") {
      setStatus("completed")
      setCanCancel(false)
      setContinueAvailable(false)
      props.onSessionStatusChange?.(id, "completed")
    }
    if (event.type === "session.failed") {
      setStatus("failed")
      setCanCancel(false)
      props.onSessionStatusChange?.(id, "failed")
    }
    if (event.type === "session.cancelled") {
      setStatus("cancelled")
      setCanCancel(false)
      setContinueAvailable(false)
      setCancelBusy(false)
      props.onSessionStatusChange?.(id, "cancelled")
    }
    if (["assistant.thinking", "assistant.reasoning", "assistant.text", "tool.request", "tool.result"].includes(event.type)) {
      setStatus("running")
      setCanCancel(true)
    }
    if (event.type === "permission.requested") {
      const request = permissionFromEvent(data, id)
      if (request) setPermissions((current) => upsertRequest(current, request))
      setStatus("awaiting permission")
      setCanCancel(true)
      void refreshPending(id)
    }
    if (event.type === "question.request") {
      const request = questionFromEvent(data, id)
      if (request) setQuestions((current) => upsertRequest(current, request))
      setStatus("awaiting question")
      setCanCancel(true)
      void refreshPending(id)
    }
    if (event.type === "question.result" || event.type === "question.cancelled") {
      const requestID = stringValue(data.requestID)
      setQuestions((current) => current.filter((request) => request.id !== requestID))
      void refreshPending(id)
    }
    if (event.type === "context.project.loaded") setContextSources(sourcesFromEvent(data))
    if (event.type === "skill.activated") {
      const skillID = stringValue(data.skillID)
      if (skillID) setActiveSkillIDs((current) => (current.includes(skillID) ? current : [...current, skillID]))
    }
    if (event.type === "skill.updated") {
      void loadSkills(id, currentLifecycle)
      props.onSkillUpdated?.()
    }
    if (event.type === "skill.failed") setNotice("Skill 激活失败，请检查状态和权限")
  }

  async function loadEarlierHistory(element: HTMLDivElement) {
    const before = historyBefore()
    const id = props.sessionID
    if (before === undefined || !id || historyLoading()) return
    const previousHeight = element.scrollHeight
    setHistoryLoading(true)
    setHistoryError("")
    try {
      const history = await adapter.loadHistory({ sessionID: id, before, limit: historyPageSize, snapshotID: historySnapshot() })
      if (id !== props.sessionID) return
      setHistoryBefore(history.nextBefore)
      setHistoryHasMore(history.hasMore)
      setChatItems((current) => mergeHistoryItems(current, historyItemsFromMessages(history.messages)))
      queueMicrotask(() => (element.scrollTop += element.scrollHeight - previousHeight))
    } catch (error) {
      if (isSnapshotError(error)) {
        setHistoryBefore(undefined)
        setHistoryHasMore(false)
      } else setHistoryError(messageFrom(error, "历史对话加载失败，请重试"))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function sendPrompt() {
    const id = props.sessionID
    const text = prompt().trim()
    const file = fileContext()
    const finalText = file ? composeChatPrompt(text, file) : text
    if (!id || !text || busy() || fileBusy() || historyLoading() || inputLocked() || props.composerDisabledHint) return
    setBusy(true)
    setFollowTail(true)
    const thinkingID = `thinking:${id}:${Date.now()}:${promptSequence++}`
    setChatItems((current) => [
      ...current,
      userChatItem(finalText, `user:${Date.now()}:${promptSequence++}`, formatLocalTime()),
      thinkingChatItem(thinkingID),
    ])
    setActiveSkillIDs(skillIDsFromText(text))
    setStatus("running")
    setContinueAvailable(false)
    setCanCancel(true)
    try {
      await adapter.sendMessage({ sessionID: id, text: finalText })
      setPrompt("")
      clearFileContext()
      setNotice("消息已提交，等待运行事件")
      // Prompt admission can race the initial SSE subscription; replay from the last known sequence.
      void connectEvents(id)
      void refreshPending(id)
      globalThis.setTimeout(() => {
        if (id === props.sessionID) void refreshPending(id)
      }, 50)
    } catch (error) {
      setStatus("failed")
      setCanCancel(false)
      setChatItems((current) => [...current.filter((item) => item.id !== thinkingID), failureChatItem(messageFrom(error, "消息发送失败"))])
      setNotice(messageFrom(error, "消息发送失败，请重试"))
    } finally {
      setBusy(false)
    }
  }

  /**
   * 读取用户选中的 Markdown 或纯文本文件，并保留可重试的失败状态。
   *
   * @param event - 原生文件选择事件
   * @author lvdaxianer@yeah.net
   * @date 2026-11-26
   */
  async function handleFileSelection(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const validationError = validateChatFile(file)
    if (validationError) {
      setFileError(validationError)
      resetFileInput(input)
      return
    }
    setFileError("")
    setFileBusy(true)
    try {
      setFileContext({ name: file.name, text: await file.text() })
      setNotice(`已读取文件：${file.name}`)
    } catch {
      handleFileReadFailure(input)
    } finally {
      setFileBusy(false)
    }
  }

  /**
   * 清理读取失败的原生文件选择值并提示用户重新选择。
   *
   * @param input - 原生文件选择器
   * @author lvdaxianer@yeah.net
   * @date 2026-11-26
   */
  function handleFileReadFailure(input: HTMLInputElement) {
    setFileContext(undefined)
    setFileError("文件读取失败，请重新选择文件")
    resetFileInput(input)
    setNotice("文件读取失败，请重试")
  }

  /**
   * 重置原生选择器，使用户可以再次选择同一个文件。
   *
   * @param input - 原生文件选择器
   * @author lvdaxianer@yeah.net
   * @date 2026-11-26
   */
  function resetFileInput(input: HTMLInputElement) {
    input.value = ""
  }

  /**
   * 清理已选择的文件和原生选择器值，允许重复选择同名文件。
   *
   * @author lvdaxianer@yeah.net
   * @date 2026-11-26
   */
  function clearFileContext() {
    setFileContext(undefined)
    setFileError("")
    if (fileInput) fileInput.value = ""
  }

  async function continueRun() {
    const id = props.sessionID
    if (!id || !continueAvailable() || continueBusy()) return
    setContinueBusy(true)
    setStatus("running")
    setCanCancel(true)
    try {
      await adapter.continueRun(id)
      setNotice("正在继续运行")
    } catch (error) {
      setContinueBusy(false)
      setStatus("failed")
      setCanCancel(false)
      setNotice(messageFrom(error, "继续运行失败，请重试"))
    }
  }

  async function cancelRun() {
    const id = props.sessionID
    if (!id || !canCancel() || cancelBusy()) return
    setCancelBusy(true)
    try {
      await adapter.cancelRun(id)
      setStatus("cancelled")
      setCanCancel(false)
      setNotice("已请求取消运行")
    } catch (error) {
      setCancelBusy(false)
      setNotice(messageFrom(error, "取消运行失败，请重试"))
    } finally {
      setCancelConfirmOpen(false)
    }
  }

  async function decide(requestID: string, decision: ChatProtocolAdapter["replyPermission"] extends (input: infer Input) => Promise<void> ? Input extends { decision: infer Decision } ? Decision : never : never) {
    const id = props.sessionID
    if (!id || pendingDecisionID()) return
    setPendingDecisionID(requestID)
    try {
      await adapter.replyPermission({ sessionID: id, requestID, decision })
      setPermissions((current) => current.filter((request) => request.id !== requestID))
      setChatItems((current) => updateChatItem(current, `permission:${requestID}`, { status: decision === "deny" ? "failed" : "completed", content: decision === "deny" ? "权限已拒绝" : "权限已通过" }))
      setNotice(
        decision === "deny"
          ? "权限已拒绝"
          : decision === "allow_always"
            ? "已保存全局「始终允许」策略"
            : "权限已通过",
      )
    } catch (error) {
      setNotice(messageFrom(error, "权限处理失败，请重试"))
    } finally {
      setPendingDecisionID("")
    }
  }

  function chooseAnswer(request: QuestionRequest, questionIndex: number, label: string) {
    const answers = questionAnswers()[request.id] ?? request.questions.map(() => [])
    const current = answers[questionIndex] ?? []
    const question = request.questions[questionIndex]
    const next = question?.multiple
      ? current.includes(label)
        ? current.filter((value) => value !== label)
        : [...current, label]
      : [label]
    setQuestionAnswers((currentAnswers) => ({
      ...currentAnswers,
      [request.id]: answers.map((value, index) => (index === questionIndex ? next : value)),
    }))
  }

  async function replyQuestion(request: QuestionRequest) {
    const id = props.sessionID
    if (!id || busy()) return
    setBusy(true)
    try {
      const answers = questionAnswers()[request.id] ?? request.questions.map(() => [])
      await adapter.replyQuestion({ sessionID: id, requestID: request.id, answers })
      setQuestions((current) => current.filter((item) => item.id !== request.id))
      setChatItems((current) => updateChatItem(current, `question:${request.id}`, { status: "completed", content: "补充信息已提交" }))
      setNotice("补充信息已提交，运行继续")
    } catch (error) {
      setNotice(messageFrom(error, "补充信息提交失败，请重试"))
    } finally {
      setBusy(false)
    }
  }

  async function cancelQuestion(requestID: string) {
    const id = props.sessionID
    if (!id || pendingQuestionID()) return
    setPendingQuestionID(requestID)
    try {
      await adapter.cancelQuestion({ sessionID: id, requestID })
      setQuestions((current) => current.filter((request) => request.id !== requestID))
      setChatItems((current) => updateChatItem(current, `question:${requestID}`, { status: "cancelled", content: "补充信息已取消" }))
      setNotice("已取消补充信息")
    } catch (error) {
      setNotice(messageFrom(error, "取消补充信息失败，请重试"))
    } finally {
      setPendingQuestionID("")
    }
  }

  function openPermissionSettings() {
    props.onOpenPermissionSettings?.()
    surfaceRoot?.dispatchEvent(new CustomEvent("permission-settings", { bubbles: true }))
  }

  function selectSkill(skill: NexumSkill) {
    const value = prompt()
    const match = value.match(/(?:^|\s)@([a-z0-9-]*)$/i)
    if (!match || match.index === undefined) return
    const tokenStart = match.index + (match[0].startsWith(" ") ? 1 : 0)
    setPrompt(`${value.slice(0, tokenStart)}@${skill.id} `)
    setActiveSkillIDs((current) => (current.includes(skill.id) ? current : [...current, skill.id]))
  }

  function handleScroll(element: HTMLDivElement) {
    setFollowTail(element.scrollHeight - element.scrollTop - element.clientHeight < 96)
    if (element.scrollTop <= 96 && historyHasMore() && !historyLoading()) void loadEarlierHistory(element)
  }

  /** 回到最新消息：跳到底部并恢复生成时的自动跟随。 */
  function jumpToBottom() {
    setFollowTail(true)
    if (conversationBody) conversationBody.scrollTop = conversationBody.scrollHeight
  }

  createEffect(() => {
    if (!followTail() || !conversationBody) return
    chatItems()
    queueMicrotask(() => {
      if (followTail() && conversationBody) conversationBody.scrollTop = conversationBody.scrollHeight
    })
  })

  return (
    <section
      class={`nexum-chat-surface ${props.class ?? ""}`}
      data-testid="chat-surface"
      data-theme={props.theme}
      ref={(element) => (surfaceRoot = element)}
    >
      <Show when={props.title}>
        <header class="nexum-chat-header">
          <h2>{props.title}</h2>
        </header>
      </Show>
      <div class="nexum-chat-body-wrap">
        <div class="nexum-chat-body conversation-body" ref={(element) => (conversationBody = element)} onScroll={(event) => handleScroll(event.currentTarget)}>
          <div class="nexum-chat-stream" role="log" aria-live="polite">
            <Show when={historyLoading()}><div class="nexum-chat-load-status" role="status">正在加载聊天…</div></Show>
            <Show when={historyError()}>
              <div class="nexum-chat-error" role="alert"><span>{historyError()}</span><button type="button" onClick={() => void initialize(props.sessionID, lifecycle)}>重试</button></div>
            </Show>
            <Show when={chatItems().length > 0} fallback={<div class="nexum-chat-empty"><strong>{props.sessionID ? "Session 已就绪" : "等待 Session"}</strong><p>{props.sessionID ? "在下方输入第一个任务，Agent 的输出会实时显示在这里。" : "宿主传入 sessionID 后即可开始聊天。"}</p></div>}>
              <For each={chatItems()}>{(item) => <ChatItemView item={item} />}</For>
            </Show>
          </div>
        </div>
        <Show when={!followTail()}>
          <button type="button" class="nexum-chat-jump" onClick={jumpToBottom} aria-label="回到底部">↓ 回到底部</button>
        </Show>
      </div>

      <Show when={permissions().length > 0}>
        <section class="nexum-chat-requests" data-testid="prompt-permission" aria-live="assertive">
          <div class="nexum-chat-request-title">
            <strong>需要权限确认</strong>
            <span>
              {permissions().length} 条
              <Show when={props.onOpenPermissionSettings}>
                <> · <button type="button" class="nexum-chat-request-settings" onClick={() => openPermissionSettings()}>权限设置</button></>
              </Show>
            </span>
          </div>
          <For each={permissions()}>{(request) => <div class="nexum-chat-request"><div><strong>{request.action} · {request.resource}</strong><small>{request.reason}</small></div><div class="nexum-chat-request-actions" data-testid="permission-actions"><button disabled={Boolean(pendingDecisionID())} onClick={() => void decide(request.id, "allow_once")}>{pendingDecisionID() === request.id ? "处理中…" : "允许一次"}</button><button disabled={Boolean(pendingDecisionID())} onClick={() => void decide(request.id, "allow_always")}>始终允许</button><button class="is-danger" disabled={Boolean(pendingDecisionID())} onClick={() => void decide(request.id, "deny")}>拒绝</button></div></div>}</For>
        </section>
      </Show>

      <Show when={questions().length > 0}>
        <section class="nexum-chat-requests" aria-live="assertive"><div class="nexum-chat-request-title"><strong>需要补充信息</strong><span>{questions().length} 条</span></div><For each={questions()}>{(request) => <div class="nexum-chat-question"><div class="nexum-chat-question-head"><strong>{request.id}</strong><button type="button" onClick={() => void cancelQuestion(request.id)} disabled={pendingQuestionID() === request.id}>{pendingQuestionID() === request.id ? "取消中…" : "取消"}</button></div><For each={request.questions}>{(question, questionIndex) => <div class="nexum-chat-question-block"><strong>{question.question}</strong><div class="nexum-chat-options"><For each={question.options}>{(option) => <button type="button" classList={{ "is-selected": questionAnswers()[request.id]?.[questionIndex()]?.includes(option.label) }} aria-pressed={questionAnswers()[request.id]?.[questionIndex()]?.includes(option.label)} onClick={() => chooseAnswer(request, questionIndex(), option.label)}><span>{option.label}</span><small>{option.description}</small></button>}</For></div></div>}</For><button type="button" class="nexum-chat-primary" disabled={busy()} onClick={() => void replyQuestion(request)}>{busy() ? "提交中…" : "提交回答"}</button></div>}</For></section>
      </Show>

      <div class="nexum-chat-composer">
        <div class="nexum-chat-composer-inner">
          <Show when={skillSuggestions().length > 0}><div class="nexum-chat-suggestions" role="listbox" aria-label="Skill 建议"><For each={skillSuggestions()}>{(skill) => <button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => selectSkill(skill)}><span>@{skill.id}</span><small>{skill.description}</small></button>}</For></div></Show>
          <div class="nexum-chat-composer-card">
            <Show when={fileContext() || fileBusy() || fileError()}>
              <div class="nexum-chat-file-status" aria-live="polite">
                <Show when={fileBusy()}>
                  <span class="nexum-chat-file-chip is-busy"><span class="nexum-chat-file-icon" aria-hidden="true">📄</span>正在读取文件…</span>
                </Show>
                <Show when={!fileBusy() && fileContext()}>
                  {(file) => (
                    <span class="nexum-chat-file-chip">
                      <span class="nexum-chat-file-icon" aria-hidden="true">📄</span>
                      <span class="nexum-chat-file-name" title={file().name}>{file().name}</span>
                      <button type="button" class="nexum-chat-file-remove" aria-label="移除文件" title="移除文件" onClick={clearFileContext} disabled={busy() || inputLocked()}>✕</button>
                    </span>
                  )}
                </Show>
                <Show when={!fileBusy() && fileError()}>
                  <span class="nexum-chat-file-error" role="alert">{fileError()}</span>
                </Show>
              </div>
            </Show>
            <Show when={activeSkillIDs().length > 0}><div class="nexum-chat-active-skills"><span>已附加</span><For each={activeSkillIDs()}>{(id) => <span class="nexum-chat-chip skill-chip">@{id}</span>}</For></div></Show>
            <textarea aria-label="Coding Prompt" rows={3} value={prompt()} onInput={(event) => setPrompt(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); void sendPrompt() } }} placeholder={props.composerDisabledHint ?? (inputLocked() ? "Agent 正在回复，本轮完成后可继续输入…" : "描述下一步 Coding 任务…")} disabled={!props.sessionID || busy() || inputLocked() || Boolean(props.composerDisabledHint)} />
            <div class="nexum-chat-composer-bar prompt-bar">
              <Show when={props.model}>
                <span class="nexum-chat-model" title={`当前模型：${props.model}`}>
                  <span aria-hidden="true">◈</span>
                  {props.model}
                </span>
              </Show>
              <span class="nexum-chat-hint" classList={{ "is-blocked": Boolean(props.composerDisabledHint) }}>
                {props.composerDisabledHint ?? (inputLocked() ? "Agent 正在回复" : (<><span class="hint-enter">Enter 发送<span class="hint-sep"> · </span></span><span class="hint-shift">Shift+Enter 换行 · </span>@ 引用 Skill</>))}
              </span>
              <input ref={(element) => (fileInput = element)} class="nexum-chat-file-input" type="file" accept={CHAT_FILE_ACCEPT} aria-label="选择 Markdown 或纯文本文件" tabindex="-1" onChange={(event) => void handleFileSelection(event)} disabled={!props.sessionID || busy() || fileBusy() || inputLocked() || Boolean(props.composerDisabledHint)} />
              <button type="button" class="nexum-chat-button nexum-chat-file-button" onClick={() => fileInput?.click()} disabled={!props.sessionID || busy() || fileBusy() || inputLocked() || Boolean(props.composerDisabledHint)} aria-label="上传 Markdown 或纯文本文件">
                <span class="nexum-chat-file-icon" aria-hidden="true">📎</span>{fileBusy() ? "读取中…" : "上传文件"}
              </button>
              <Show when={props.composerExtras}>
                <span class="nexum-chat-composer-extras">{props.composerExtras}</span>
              </Show>
              <Show when={props.sessionID && canCancel()}>
                <Show
                  when={!cancelConfirmOpen()}
                  fallback={
                    <span class="nexum-chat-confirm">
                      <span>确认取消运行？</span>
                      <button type="button" class="is-danger" onClick={() => void cancelRun()} disabled={cancelBusy()}>确认</button>
                      <button type="button" onClick={() => setCancelConfirmOpen(false)}>返回</button>
                    </span>
                  }
                >
                  <button type="button" class="nexum-chat-button is-danger" onClick={() => setCancelConfirmOpen(true)}>取消运行</button>
                </Show>
              </Show>
              <button type="button" class="nexum-chat-primary" aria-label="发送 Prompt" disabled={!props.sessionID || !prompt().trim() || busy() || fileBusy() || inputLocked() || Boolean(props.composerDisabledHint)} onClick={() => void sendPrompt()}>{busy() ? "发送中…" : "发送"}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="nexum-chat-footer"><span>{notice()}</span><Show when={contextSources().length > 0}><span>上下文来源 {contextSources().length}</span><For each={contextSources()}>{(source) => <span class="nexum-chat-context-source">{source.path}</span>}</For></Show><div><span class={`nexum-chat-status-pill pill-${statusPillClass(status())}`}>{statusLabel(status())}</span><Show when={continueAvailable()}><button type="button" class="nexum-chat-button" disabled={continueBusy()} onClick={() => void continueRun()}>继续运行</button></Show></div></div>
    </section>
  )
}

function ChatItemView(props: { readonly item: ChatItem }) {
  return <Switch>
    <Match when={props.item.kind === "user"}>
      <article class={`nexum-chat-item chat-message user status-${props.item.status}`}>
        <div class="nexum-chat-user-bubble">
          <MarkdownView content={props.item.content ?? ""} />
          <Show when={props.item.attachmentName}>
            <div class="nexum-chat-user-attachment" aria-label={`已附加文件 ${props.item.attachmentName}`}>
              <span aria-hidden="true">📄</span> 已附加文件：{props.item.attachmentName}
            </div>
          </Show>
        </div>
        <div class="nexum-chat-user-meta">{props.item.localTime} · {statusLabel(props.item.status)}</div>
        <Show when={props.item.skillIDs?.length}><div class="nexum-chat-chips"><For each={props.item.skillIDs}>{(id) => <span class="nexum-chat-chip">@{id}</span>}</For></div></Show>
      </article>
    </Match>
    <Match when={props.item.kind === "assistant"}>
      <article class={`nexum-chat-item chat-message assistant status-${props.item.status}`}>
        <div class="nexum-chat-turn">
          <div class="nexum-chat-avatar" aria-hidden="true">✦</div>
          <div class="nexum-chat-turn-main">
            <div class="nexum-chat-turn-label">
              <strong>{props.item.title}</strong>
              <span>{props.item.localTime}</span>
              <Show when={props.item.status === "streaming"}>
                <span class="nexum-chat-turn-state is-live">输出中</span>
              </Show>
            </div>
            <MarkdownView class="nexum-chat-copy" content={props.item.content ?? ""} />
            <Show when={props.item.skillIDs?.length}><div class="nexum-chat-chips"><For each={props.item.skillIDs}>{(id) => <span class="nexum-chat-chip">@{id}</span>}</For></div></Show>
          </div>
        </div>
      </article>
    </Match>
    <Match when={props.item.kind === "reasoning"}>
      <article class={`nexum-chat-item chat-message reasoning status-${props.item.status}`}>
        <ReasoningView item={props.item} />
      </article>
    </Match>
    <Match when={props.item.kind === "execution"}>
      <article class={`nexum-chat-item chat-message execution status-${props.item.status}`}>
        <div class="nexum-chat-execution act-row">
          <span class="nexum-chat-exec-icon" aria-hidden="true">{execIcon(props.item.status)}</span>
          <strong>{props.item.title}</strong>
          <span>{props.item.content}</span>
          <em>{statusLabel(props.item.status)}</em>
          <Show when={props.item.detail}><details><summary>查看详情</summary><pre>{props.item.detail}</pre></details></Show>
        </div>
      </article>
    </Match>
    <Match when={props.item.kind === "status"}>
      <Show
        when={props.item.thinking}
        fallback={<div class="nexum-chat-status-item">{props.item.content || props.item.title}</div>}
      >
        <div class="nexum-chat-status-item thinking-status">
          <span class="thinking-dot" aria-hidden="true" />
          <span>{props.item.content || props.item.title}</span>
          <Show when={props.item.thinkingStatus && props.item.thinkingStatus !== props.item.content}>
            <small>{props.item.thinkingStatus}</small>
          </Show>
        </div>
      </Show>
    </Match>
  </Switch>
}

/** 思考过程生命周期面板：占位（尚无文本）→ 流式 → 折叠/展开。 */
function ReasoningView(props: { readonly item: ChatItem }) {
  const live = () => props.item.status === "streaming"
  const [touched, setTouched] = createSignal(false)
  const [userOpen, setUserOpen] = createSignal(false)
  const open = () => (touched() ? userOpen() : live())
  const chars = () => (props.item.content ?? "").length
  const elapsedLabel = () => {
    const ms = props.item.elapsedMs
    if (ms === undefined) return ""
    return ` · 用时 ${Math.max(1, Math.round(ms / 1000))}s`
  }
  return (
    <details
      class={`nexum-chat-reasoning reasoning-fold ${live() ? "is-live" : ""} ${chars() === 0 ? "is-empty" : ""}`}
      open={open()}
    >
      <summary onClick={(event) => { event.preventDefault(); setTouched(true); setUserOpen(!open()) }}>
        <Show
          when={live()}
          fallback={<span>模型思考 · {chars()} 字{elapsedLabel()} · {props.item.localTime}</span>}
        >
          <span>正在思考 · 已 {chars()} 字</span>
        </Show>
      </summary>
      <Show when={chars() > 0} fallback={<div class="reasoning-copy reasoning-empty-copy">模型未返回可展示的思考内容</div>}>
        <div class="reasoning-copy">{props.item.content}</div>
      </Show>
    </details>
  )
}

export function historyItemsFromMessages(messages: NexumSessionMessages["messages"]): ChatItem[] {
  return messages.reduce<ChatItem[]>((items, entry) => {
    const message = entry.message
    if (message.role === "user") return [...items, userChatItem(message.content, `history:user:${entry.index}`, "历史")]
    if (message.role === "assistant") {
      const next = [...items]
      if (message.reasoningContent !== undefined) next.push({ id: `history:reasoning:${entry.index}`, kind: "reasoning", title: "模型思考", content: message.reasoningContent, status: "completed", localTime: "历史" })
      if (message.content !== undefined) next.push({ id: `history:assistant:${entry.index}`, kind: "assistant", title: "Agent", content: message.content, status: "completed", localTime: "历史" })
      message.toolCalls?.forEach((toolCall) => next.push({ id: `history:tool-call:${entry.index}:${toolCall.id}`, kind: "execution", title: `工具调用 · ${toolCall.name}`, content: "历史工具调用", detail: JSON.stringify(toolCall.input, null, 2), status: "completed", localTime: "历史" }))
      return next
    }
    if (message.role === "tool") return [...items, { id: `history:tool-result:${entry.index}:${message.toolCallID}`, kind: "execution", title: "工具结果", content: compactSummary(message.content) || "工具执行完成", detail: message.content, status: "completed", localTime: "历史" }]
    return [...items, { id: `history:system:${entry.index}`, kind: "execution", title: message.sourceID === "context:summary" ? "上下文压缩摘要" : "系统上下文", content: message.sourceID === "context:summary" ? "已保存的上下文压缩摘要" : "已保存的系统消息", detail: message.content, status: "completed", localTime: "历史" }]
  }, [])
}

function userChatItem(content: string, id: string, localTime: string): ChatItem {
  const display = parseChatPrompt(content)
  return {
    id,
    kind: "user",
    title: "你",
    content: display.text,
    sourceContent: content,
    ...(display.fileName ? { attachmentName: display.fileName } : {}),
    skillIDs: skillIDsFromText(display.text),
    status: "completed",
    localTime,
  }
}

function parseChatPrompt(content: string): { readonly text: string; readonly fileName?: string } {
  const contextStart = content.indexOf(CHAT_FILE_CONTEXT_START)
  if (contextStart >= 0) {
    const context = content.slice(contextStart)
    const fileName = context.match(/^文件名：(.+)$/m)?.[1]?.trim()
    return { text: content.slice(0, contextStart).trimEnd(), ...(fileName ? { fileName } : {}) }
  }

  const legacyStart = content.indexOf(`\n\n${LEGACY_CHAT_FILE_NAME_PREFIX}`)
  if (legacyStart < 0 || !content.endsWith(`\n${LEGACY_CHAT_FILE_END_MARKER}`)) return { text: content }
  const nameStart = legacyStart + 2 + LEGACY_CHAT_FILE_NAME_PREFIX.length
  const nameEnd = content.indexOf("】", nameStart)
  if (nameEnd < 0) return { text: content }
  return { text: content.slice(0, legacyStart).trimEnd(), fileName: content.slice(nameStart, nameEnd) }
}

/**
 * 合并状态快照中的待处理交互，不覆盖已经渲染的对话内容。
 *
 * @param items - 当前已经渲染的聊天项
 * @param state - Session 状态快照
 * @returns 保留现有聊天项并补充新的待处理交互
 * @author lvdaxianer@yeah.net
 * @date 2026-11-26
 */
export function mergePendingChatItems(items: readonly ChatItem[], state: ChatStateSnapshot): ChatItem[] {
  const existingIDs = new Set(items.map((item) => item.id))
  const pending = [...state.pendingPermissions.map(permissionChatItem), ...state.pendingQuestions.map(questionChatItem)]
  return [...items, ...pending.filter((item) => !existingIDs.has(item.id))]
}

export function mergeHistoryItems(current: readonly ChatItem[], incoming: readonly ChatItem[]): ChatItem[] {
  const existingIDs = new Set(current.map((item) => item.id))
  const currentUserContent = new Map<string, number>()
  current.forEach((item) => {
    if (item.kind !== "user" || !item.id.startsWith("user:") || item.sourceContent === undefined) return
    currentUserContent.set(item.sourceContent, (currentUserContent.get(item.sourceContent) ?? 0) + 1)
  })
  const history = incoming.filter((item) => {
    if (existingIDs.has(item.id)) return false
    if (item.kind !== "user" || item.sourceContent === undefined) return true
    const count = currentUserContent.get(item.sourceContent) ?? 0
    if (count === 0) return true
    currentUserContent.set(item.sourceContent, count - 1)
    return false
  })
  return [...history, ...current]
}

export function projectChatEvent(items: ChatItem[], event: NexumEvent): ChatItem[] {
  const data = eventDataOf(event.data)
  const timestamp = formatLocalTime(event.occurredAt)
  const detail = JSON.stringify(data, null, 2)
  const value = (key: string) => stringValue(data[key])
  if (event.type === "assistant.thinking") {
    const hasActiveTool = items.some((item) => item.eventType === "tool.request" && (item.status === "running" || item.status === "waiting"))
    const hasSettledRun = items.some((item) => item.id === `run:${event.runID}:settled` || item.id.startsWith(`session:${event.runID}:`))
    if (hasActiveTool || hasSettledRun) return items
    const message = value("message") || "模型正在思考"
    return upsertChatItem(items, { id: `thinking:${event.runID}`, kind: "status", title: "Agent 思考", content: message, thinking: true, thinkingStatus: `${message} · 若模型提供思考内容会显示在这里`, status: "streaming", localTime: timestamp, eventType: event.type })
  }
  if (event.type === "assistant.reasoning") {
    const content = value("content")
    if (!content) return items
    const active = items.filter((item) => !item.thinking)
    const last = active.at(-1)
    if (last?.kind === "reasoning" && last.id.startsWith(`reasoning:${event.runID}:`)) return updateChatItem(active, last.id, { content: `${last.content ?? ""}${content}`, status: "streaming", localTime: timestamp, eventType: event.type })
    return [...active, { id: `reasoning:${event.runID}:${event.sequence}`, kind: "reasoning", title: "模型思考", content, status: "streaming", startedAt: event.occurredAt, localTime: timestamp, eventType: event.type }]
  }
  if (event.type === "assistant.text") {
    const active = closeReasoning(items.filter((item) => !item.thinking), event.runID, event.occurredAt)
    const last = active.at(-1)
    if (last?.kind === "assistant" && last.id.startsWith(`assistant:${event.runID}:`)) return updateChatItem(active, last.id, { content: `${last.content ?? ""}${value("content")}`, status: "streaming", localTime: timestamp, eventType: event.type })
    return [...active, { id: `assistant:${event.runID}:${event.sequence}`, kind: "assistant", title: "Agent", content: value("content"), status: "streaming", localTime: timestamp, eventType: event.type }]
  }
  if (event.type === "tool.request" || event.type === "tool.result") {
    const errorCode = value("errorCode")
    const content = event.type === "tool.request"
      ? "Core 正在执行工具"
      : errorCode === "timeout"
        ? "工具执行超时，可继续运行"
        : errorCode === "cancelled"
          ? "工具执行已取消"
          : data.ok === false
            ? "工具执行失败"
            : compactSummary(value("output")) || "工具执行完成"
    return upsertChatItem(closeReasoning(items.filter((item) => !item.thinking), event.runID, event.occurredAt), { id: `tool:${value("toolCallID")}`, kind: "execution", title: `${event.type === "tool.request" ? "工具调用" : "工具结果"} · ${value("toolName") || value("toolCallID") || "工具"}`, content, detail, status: event.type === "tool.request" ? "running" : data.ok === false ? "failed" : "completed", localTime: timestamp, eventType: event.type })
  }
  if (event.type === "permission.requested") return upsertChatItem(items, { id: `permission:${value("requestID")}`, kind: "execution", title: `权限请求 · ${value("action") || "操作"}`, content: value("reason") || "等待权限处理", detail, status: "waiting", localTime: timestamp, eventType: event.type })
  if (event.type === "question.request") return upsertChatItem(items, { id: `question:${value("requestID")}`, kind: "execution", title: "补充信息 · 等待回答", content: "Core 正在等待你的补充信息", detail, status: "waiting", localTime: timestamp, eventType: event.type })
  if (event.type === "question.result" || event.type === "question.cancelled") return updateChatItem(items, `question:${value("requestID")}`, { status: event.type === "question.result" ? "completed" : "cancelled", content: event.type === "question.result" ? "补充信息已提交" : "补充信息已取消", localTime: timestamp })
  if (["context.compaction.started", "context.compaction.completed", "context.compaction.failed"].includes(event.type)) return upsertChatItem(items, { id: `context:${event.runID}`, kind: "execution", title: "上下文压缩", content: value("message") || `上下文压缩${event.type.endsWith("started") ? "进行中" : event.type.endsWith("failed") ? "失败" : "完成"}`, detail, status: event.type.endsWith("started") ? "running" : event.type.endsWith("failed") ? "failed" : "completed", localTime: timestamp, eventType: event.type })
  if (event.type === "context.project.loaded") return [...items, { id: `context-source:${event.sequence}`, kind: "execution", title: "项目上下文 · 已加载", content: "Core 已加载项目指令和上下文来源", detail, status: "completed", localTime: timestamp, eventType: event.type }]
  if (event.type === "skill.activated" || event.type === "skill.failed") return upsertChatItem(items, { id: `skill:${value("skillID")}`, kind: "execution", title: `Skill · ${value("name") || value("skillID") || "Skill"}`, content: event.type === "skill.activated" ? "Skill 已进入模型上下文" : value("code") || "Skill 激活失败", detail, status: event.type === "skill.activated" ? "completed" : "failed", localTime: timestamp, eventType: event.type })
  if (event.type === "model.attempt" || event.type === "model.retry") return upsertChatItem(items, { id: `${event.type}:${event.runID}`, kind: "execution", title: event.type === "model.attempt" ? "模型尝试" : "模型重试", content: event.type === "model.attempt" ? `第 ${String(data.attempt ?? "")} 次模型调用` : `调用失败，${String(data.delayMs ?? 0)}ms 后重试`, detail, status: "running", localTime: timestamp, eventType: event.type })
  if (event.type === "run.settled") {
    const result = runResultFromEvent(data)
    if (!result) return items
    return upsertChatItem(settleRunItems(items, event.runID, result, event.occurredAt), { id: `run:${event.runID}:settled`, kind: "status", title: "运行已结算", content: result === "failed" ? "运行失败，可继续执行" : result === "completed" ? "运行完成" : "运行已取消", status: result, localTime: timestamp, eventType: event.type })
  }
  if (event.type === "session.completed" || event.type === "session.failed" || event.type === "session.cancelled") {
    const result = event.type === "session.failed" ? "failed" : event.type === "session.cancelled" ? "cancelled" : "completed"
    return [...settleRunItems(items, event.runID, result, event.occurredAt), { id: `session:${event.runID}:${result}`, kind: "status", title: result === "failed" ? "运行失败" : result === "cancelled" ? "运行已取消" : "运行完成", content: result === "failed" ? value("message") || "Core 返回运行失败" : result === "cancelled" ? "本轮运行已停止，可以继续输入新的 Prompt" : "本轮 Coding 任务已完成", status: result, localTime: timestamp, eventType: event.type }]
  }
  return items
}

function eventDataOf(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {}
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function formatLocalTime(value = new Date().toISOString()): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function statusLabel(value: SurfaceStatus | ChatStatus): string {
  return { streaming: "输出中…", running: "执行中", waiting: "等待处理", completed: "已完成", failed: "失败", cancelled: "已取消", idle: "空闲", "no session": "无 Session", retrying: "重试中", "awaiting permission": "等待权限", "awaiting question": "等待回答" }[value] ?? value
}

function statusPillClass(value: SurfaceStatus): string {
  return value.replace(/\s+/g, "-")
}

function execIcon(value: ChatStatus): string {
  if (value === "running" || value === "streaming") return "●"
  if (value === "failed") return "✗"
  if (value === "cancelled") return "—"
  return "✓"
}

function skillIDsFromText(text: string): string[] {
  return [...text.matchAll(/@([a-z0-9]+(?:-[a-z0-9]+)*)/gi)].map((match) => match[1]!).filter((id, index, values) => values.indexOf(id) === index)
}

function thinkingChatItem(id: string): ChatItem {
  return { id, kind: "status", title: "Agent 思考", content: "正在思考", thinkingStatus: "模型正在处理，若模型提供思考内容会显示在这里", thinking: true, status: "running", localTime: formatLocalTime() }
}

function failureChatItem(content: string): ChatItem {
  return { id: `status:failure:${Date.now()}`, kind: "status", title: "消息发送失败", content, status: "failed", localTime: formatLocalTime() }
}

function permissionChatItem(request: PermissionRequest): ChatItem {
  return { id: `permission:${request.id}`, kind: "execution", title: `权限请求 · ${request.action}`, content: request.reason || "等待权限处理", status: "waiting", localTime: "当前" }
}

function questionChatItem(request: QuestionRequest): ChatItem {
  return { id: `question:${request.id}`, kind: "execution", title: "补充信息 · 等待回答", content: "Core 正在等待你的补充信息", status: "waiting", localTime: "当前" }
}

function permissionFromEvent(data: Record<string, unknown>, sessionID: string): PermissionRequest | undefined {
  const id = stringValue(data.requestID)
  const action = stringValue(data.action)
  const resource = stringValue(data.resource)
  if (!id || !action || !resource) return undefined
  return { id, sessionID, action, resource, ...(stringValue(data.reason) ? { reason: stringValue(data.reason) } : {}) }
}

function questionFromEvent(data: Record<string, unknown>, sessionID: string): QuestionRequest | undefined {
  const id = stringValue(data.requestID)
  if (!id || !Array.isArray(data.questions)) return undefined
  const questions = data.questions.filter(isQuestion)
  if (questions.length === 0) return undefined
  return { id, sessionID, toolCallID: stringValue(data.toolCallID), questions }
}

function isQuestion(value: unknown): value is QuestionRequest["questions"][number] {
  if (!value || typeof value !== "object") return false
  const question = value as Record<string, unknown>
  return typeof question.header === "string" && typeof question.question === "string" && Array.isArray(question.options) && question.options.every(isQuestionOption)
}

function isQuestionOption(value: unknown): value is { readonly label: string; readonly description: string } {
  if (!value || typeof value !== "object") return false
  const option = value as Record<string, unknown>
  return typeof option.label === "string" && typeof option.description === "string"
}

function upsertRequest<T extends { readonly id: string }>(requests: readonly T[], request: T): T[] {
  const existing = requests.some((item) => item.id === request.id)
  return existing ? requests.map((item) => item.id === request.id ? request : item) : [...requests, request]
}

function updateChatItem(items: ChatItem[], id: string, patch: Partial<ChatItem>): ChatItem[] {
  return items.map((item) => item.id === id ? { ...item, ...patch } : item)
}

function upsertChatItem(items: ChatItem[], item: ChatItem): ChatItem[] {
  return items.some((current) => current.id === item.id) ? updateChatItem(items, item.id, item) : [...items, item]
}

function closeReasoning(items: ChatItem[], runID: string, occurredAt?: string): ChatItem[] {
  const last = items.at(-1)
  if (last?.kind !== "reasoning" || !last.id.startsWith(`reasoning:${runID}:`)) return items
  const elapsedMs = last.startedAt ? Math.max(0, new Date(occurredAt ?? Date.now()).getTime() - new Date(last.startedAt).getTime()) : undefined
  return updateChatItem(items, last.id, { status: "completed", ...(elapsedMs !== undefined ? { elapsedMs } : {}) })
}

/**
 * 将同一 run 的瞬时投影项收敛到终态。
 *
 * @param items 当前聊天投影项
 * @param runID 需要收敛的运行 ID
 * @param result 运行的终态
 * @param occurredAt 运行终态事件时间
 * @returns 收敛后的聊天投影项
 * @author lvdaxianer@yeah.net
 * @date 2026-11-24
 */
function settleRunItems(items: ChatItem[], runID: string, result: "completed" | "failed" | "cancelled", occurredAt?: string): ChatItem[] {
  return items
    .filter((item) => !(item.thinking && item.id === `thinking:${runID}`))
    .map((item) => {
      if (item.kind === "reasoning" && item.id.startsWith(`reasoning:${runID}:`)) {
        const elapsedMs = item.startedAt ? Math.max(0, new Date(occurredAt ?? Date.now()).getTime() - new Date(item.startedAt).getTime()) : undefined
        return { ...item, status: result, ...(elapsedMs !== undefined ? { elapsedMs } : {}) }
      }
      if (item.kind === "assistant" && item.id.startsWith(`assistant:${runID}:`)) return { ...item, status: result }
      if (item.kind === "execution" && (item.eventType === "model.attempt" || item.eventType === "model.retry") && item.id.endsWith(`:${runID}`)) return { ...item, status: result }
      return item
    })
}

function compactSummary(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 120)
}

function runResultFromEvent(data: Record<string, unknown>): "completed" | "failed" | "cancelled" | undefined {
  return data.result === "completed" || data.result === "failed" || data.result === "cancelled" ? data.result : undefined
}

function sourcesFromEvent(data: Record<string, unknown>): ContextSource[] {
  if (!Array.isArray(data.sources)) return []
  return data.sources.filter(isContextSource)
}

function isContextSource(value: unknown): value is ContextSource {
  if (!value || typeof value !== "object") return false
  const source = value as Record<string, unknown>
  return typeof source.sourceID === "string" && typeof source.kind === "string" && typeof source.path === "string"
}

function isSnapshotError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error.code === "NEXUM_INVALID_REQUEST" || error.code === "NEXUM_HISTORY_SNAPSHOT_EXPIRED")
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}
