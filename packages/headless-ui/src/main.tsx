import { For, Match, Show, Switch, createSignal, onCleanup, onMount } from "solid-js"
import { render } from "solid-js/web"
import { OpenCode } from "@opencode/client"
import { Drawer } from "./drawer"
import { ConfirmDialog } from "./confirm-dialog"
import type {
  ExperimentalHeadlessModelProbeOutput,
  ExperimentalHeadlessSessionEventsOutput,
  ExperimentalHeadlessSessionListOutput,
  ExperimentalHeadlessSessionPermissionListOutput,
  ExperimentalHeadlessSessionQuestionListOutput,
  ExperimentalHeadlessSkillListOutput,
} from "@opencode/client"
import "./styles.css"

type TimelineEvent = ExperimentalHeadlessSessionEventsOutput & { localTime: string }
type PermissionRequest = ExperimentalHeadlessSessionPermissionListOutput["data"][number]
type QuestionRequest = ExperimentalHeadlessSessionQuestionListOutput["data"][number]
type SessionSummary = ExperimentalHeadlessSessionListOutput["data"][number]
type ModelProbeResult = ExperimentalHeadlessModelProbeOutput["data"]
type SkillSummary = ExperimentalHeadlessSkillListOutput["data"][number]
type ContextSource = { sourceID: string; kind: string; path: string }
type ChatItemKind = "user" | "assistant" | "execution" | "status"
type ChatStatus = "streaming" | "running" | "waiting" | "completed" | "failed" | "cancelled"
type ChatItem = {
  id: string
  kind: ChatItemKind
  title: string
  content?: string
  detail?: string
  status: ChatStatus
  localTime: string
  eventType?: string
}
type ModelField = "baseUrl" | "model" | "credential"
type ModelFieldErrors = Partial<Record<ModelField, string>>
type ActionState = "idle" | "pending" | "success" | "error"

const maxChatItems = 160

const apiBaseUrl = import.meta.env.VITE_HEADLESS_API_URL ?? "http://127.0.0.1:4097"
const client = OpenCode.make({ baseUrl: apiBaseUrl })

function App() {
  const [baseUrl, setBaseUrl] = createSignal("")
  const [model, setModel] = createSignal("")
  const [credentialRef, setCredentialRef] = createSignal("")
  const [credential, setCredential] = createSignal("")
  const [sessionName, setSessionName] = createSignal("")
  const [sessionCreateName, setSessionCreateName] = createSignal("")
  const [directory, setDirectory] = createSignal("")
  const [prompt, setPrompt] = createSignal("")
  const [sessionID, setSessionID] = createSignal("")
  const [sessionStatus, setSessionStatus] = createSignal("no session")
  const [sessions, setSessions] = createSignal<SessionSummary[]>([])
  const [events, setEvents] = createSignal<TimelineEvent[]>([])
  const [chatItems, setChatItems] = createSignal<ChatItem[]>([])
  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([])
  const [questions, setQuestions] = createSignal<QuestionRequest[]>([])
  const [questionAnswers, setQuestionAnswers] = createSignal<Record<string, string[][]>>({})
  const [compactionStatus, setCompactionStatus] = createSignal("idle")
  const [contextSources, setContextSources] = createSignal<ContextSource[]>([])
  const [busy, setBusy] = createSignal(false)
  const [modelSaveBusy, setModelSaveBusy] = createSignal(false)
  const [sessionBusy, setSessionBusy] = createSignal(false)
  const [probeBusy, setProbeBusy] = createSignal(false)
  const [probeResult, setProbeResult] = createSignal<ModelProbeResult | undefined>()
  const [modelErrors, setModelErrors] = createSignal<ModelFieldErrors>({})
  const [modelSaveState, setModelSaveState] = createSignal<ActionState>("idle")
  const [modelSaveMessage, setModelSaveMessage] = createSignal("")
  const [directoryError, setDirectoryError] = createSignal("")
  const [sessionNameError, setSessionNameError] = createSignal("")
  const [sessionCreateState, setSessionCreateState] = createSignal<ActionState>("idle")
  const [sessionCreateMessage, setSessionCreateMessage] = createSignal("")
  const [refreshBusy, setRefreshBusy] = createSignal(false)
  const [modelDrawerOpen, setModelDrawerOpen] = createSignal(false)
  const [sessionDrawerOpen, setSessionDrawerOpen] = createSignal(false)
  const [sessionEditDrawerOpen, setSessionEditDrawerOpen] = createSignal(false)
  const [sessionEditName, setSessionEditName] = createSignal("")
  const [skillsDrawerOpen, setSkillsDrawerOpen] = createSignal(false)
  const [skills, setSkills] = createSignal<SkillSummary[]>([])
  const [skillBusy, setSkillBusy] = createSignal(false)
  const [skillValidation, setSkillValidation] = createSignal<Record<string, string>>({})
  const [activeSkillIDs, setActiveSkillIDs] = createSignal<string[]>([])
  const [notice, setNotice] = createSignal("准备开始一次 Headless 运行")
  const [connected, setConnected] = createSignal(false)
  const [modelConfigured, setModelConfigured] = createSignal(false)
  const [pendingDecisionID, setPendingDecisionID] = createSignal("")
  const [pendingQuestionID, setPendingQuestionID] = createSignal("")
  const [cancelBusy, setCancelBusy] = createSignal(false)
  const [renameBusy, setRenameBusy] = createSignal(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = createSignal(false)
  let streamController: AbortController | undefined
  let promptSequence = 0
  let sessionSelectSequence = 0
  const eventCursors = new Map<string, string>()
  const seenEventKeys = new Set<string>()

  onMount(async () => {
    try {
      const active = await client.experimental.headless.model.get()
      if (active.data) {
        setBaseUrl(active.data.baseUrl)
        setModel(active.data.model)
        setCredentialRef(active.data.credentialRef ?? "")
        setModelConfigured(true)
        setNotice(active.data.credentialConfigured ? "模型配置已加载" : "模型服务地址已加载")
      }
      await Promise.all([restoreSession(), loadSkills()])
    } catch {
      setNotice("Headless API 尚未连接")
    }
  })

  onCleanup(() => streamController?.abort())

  /**
   * 校验模型配置表单，并返回字段级错误。
   * @returns 模型配置错误集合
   * @author lvdaxianer@yeah.net
   */
  function validateModelInputs(): ModelFieldErrors {
    const errors: ModelFieldErrors = {}
    const candidate = baseUrl().trim()
    try {
      const url = new URL(candidate)
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error()
      if (url.username || url.password || url.search || url.hash) throw new Error()
    } catch {
      errors.baseUrl = candidate ? "请输入有效的 HTTP 或 HTTPS 服务地址" : "请输入模型服务地址"
    }
    if (!model().trim()) errors.model = "请输入模型名称"
    const hasCredential = credential().trim() || credentialRef().trim()
    if (!hasCredential) errors.credential = "请填写凭据引用或凭据值"
    else if (credential().trim() && credentialRef().trim()) errors.credential = "凭据引用和凭据值只能填写一个"
    return errors
  }

  /**
   * 校验工作目录的本地格式。
   * @param value - 用户输入的工作目录
   * @returns 可直接展示的错误消息，空字符串表示通过
   * @author lvdaxianer@yeah.net
   */
  function validateDirectoryInput(value: string): string {
    const candidate = value.trim()
    if (!candidate) return "请输入工作目录"
    if (!candidate.startsWith("/")) return "请输入服务器上的绝对路径，例如 /workspace/project"
    return ""
  }

  /**
   * 清理用户正在修正的模型字段错误。
   * @param field - 待清理的字段
   * @author lvdaxianer@yeah.net
   */
  function clearModelError(field: ModelField) {
    if (!modelErrors()[field]) return
    const next = { ...modelErrors() }
    delete next[field]
    setModelErrors(next)
  }

  /**
   * 标记模型配置已被编辑，避免继续显示旧的成功状态。
   * @param field - 正在编辑的模型字段
   * @author lvdaxianer@yeah.net
   */
  function markModelEdited(field: ModelField) {
    setModelConfigured(false)
    setModelSaveState("idle")
    setModelSaveMessage("")
    setProbeResult(undefined)
    clearModelError(field)
  }

  /**
   * 将焦点移动到首个需要修正的输入框。
   * @param id - 输入框 DOM id
   * @author lvdaxianer@yeah.net
   */
  function focusField(id: string) {
    queueMicrotask(() => document.getElementById(id)?.focus())
  }

  /**
   * 将 Core 返回的模型配置错误映射到对应字段。
   * @param message - Core 返回的安全错误消息
   * @author lvdaxianer@yeah.net
   */
  function applyModelError(message: string) {
    const next: ModelFieldErrors = {}
    if (message.includes("Base URL") || message.includes("服务地址")) next.baseUrl = message
    else if (message.includes("模型名称")) next.model = message
    else if (message.includes("credential") || message.includes("凭据")) next.credential = message
    setModelErrors(next)
  }

  /**
   * 校验模型配置并在失败时聚焦首个错误字段。
   * @returns 配置是否可以提交
   * @author lvdaxianer@yeah.net
   */
  function canSubmitModel(): boolean {
    const errors = validateModelInputs()
    setModelErrors(errors)
    if (Object.keys(errors).length > 0) {
      setModelSaveState("error")
      setModelSaveMessage("请先修正标记的配置项")
      setNotice("模型配置未提交，请先修正输入")
      focusField(errors.baseUrl ? "model-base-url" : errors.model ? "model-name" : "model-credential")
      return false
    }
    return true
  }

  /**
   * 保存当前模型配置到 Headless Core。
   * @author lvdaxianer@yeah.net
   */
  async function saveModel() {
    if (modelSaveBusy() || !canSubmitModel()) return
    setModelSaveBusy(true)
    setModelSaveState("pending")
    setModelSaveMessage("正在保存模型配置…")
    try {
      await persistModelConfiguration()
    } catch (error) {
      handleModelSaveFailure(error)
    } finally {
      setModelSaveBusy(false)
    }
  }

  /**
   * 调用 Core 保存模型配置并更新成功状态。
   * @author lvdaxianer@yeah.net
   */
  async function persistModelConfiguration() {
    const saved = await client.experimental.headless.model.update({
      baseUrl: baseUrl().trim(),
      model: model().trim(),
      credential: credential().trim() || undefined,
      credentialRef: credentialRef().trim() || undefined,
    })
    setCredential("")
    setModelConfigured(true)
    setProbeResult(undefined)
    setModelSaveState("success")
    setModelSaveMessage("模型配置已保存，可以继续探测能力")
    setNotice(`模型 ${saved.data.model} 已就绪：${saved.data.baseUrl}`)
  }

  /**
   * 展示模型配置保存失败，并保留用户输入用于重试。
   * @param error - 保存失败原因
   * @author lvdaxianer@yeah.net
   */
  function handleModelSaveFailure(error: unknown) {
    const message = messageFrom(error, "模型配置未通过，请检查地址和凭据")
    applyModelError(message)
    setModelSaveState("error")
    setModelSaveMessage(message)
    setNotice(message)
  }

  async function probeModel() {
    if (probeBusy()) return
    const errors = validateModelInputs()
    setModelErrors(errors)
    if (Object.keys(errors).length > 0) {
      setNotice("模型能力探测未开始，请先修正输入")
      focusField(errors.baseUrl ? "model-base-url" : errors.model ? "model-name" : "model-credential")
      return
    }
    setProbeBusy(true)
    try {
      const result = await client.experimental.headless.model.probe({ mode: "both" })
      setProbeResult(result.data)
      setNotice("模型能力探测完成")
    } catch (error) {
      setProbeResult(undefined)
      setNotice(messageFrom(error, "模型能力探测失败，请稍后重试"))
    } finally {
      setProbeBusy(false)
    }
  }

  async function restoreSession() {
    const savedID = sessionStorage.getItem("headless.sessionID")
    const available = (await client.experimental.headless.session.list()).data
    setSessions(available)
    const saved = savedID ? available.find((item) => item.id === savedID) : undefined
    const initial = saved ?? available[0]
    if (!initial) {
      if (savedID) sessionStorage.removeItem("headless.sessionID")
      return
    }
    await selectSession(initial, false)
    setNotice(saved ? `已恢复 Session：${saved.name}` : `已选择最近的 Session：${initial.name}`)
  }

  async function refreshRuntime() {
    if (refreshBusy()) return
    setRefreshBusy(true)
    try {
      const available = (await client.experimental.headless.session.list()).data
      setSessions(available)
      const current = available.find((item) => item.id === sessionID())
      if (current) {
        const snapshot = await client.experimental.headless.session.state({ sessionID: current.id })
        setSessionStatus(snapshot.data.session.status)
        setPermissions(snapshot.data.pendingPermissions)
        setQuestions(snapshot.data.pendingQuestions)
      }
      await loadSkills()
      setNotice("运行状态已刷新")
    } catch (error) {
      setNotice(messageFrom(error, "运行状态刷新失败，请稍后重试"))
    } finally {
      setRefreshBusy(false)
    }
  }

  /**
   * 读取当前受控 Skill root 的安全摘要。
   * @author lvdaxianer@yeah.net
   * @date 2026-11-20
   */
  async function loadSkills() {
    try {
      setSkills((await client.experimental.headless.skill.list()).data)
    } catch (error) {
      setNotice(messageFrom(error, "Skill 目录暂时不可用"))
    }
  }

  /**
   * 重新扫描 Skill root 并清理旧校验状态。
   * @author lvdaxianer@yeah.net
   * @date 2026-11-20
   */
  async function refreshSkills() {
    if (skillBusy()) return
    setSkillBusy(true)
    try {
      setSkills((await client.experimental.headless.skill.refresh()).data)
      setSkillValidation({})
      setNotice("Skill 目录已刷新")
    } catch (error) {
      setNotice(messageFrom(error, "Skill 刷新失败，请稍后重试"))
    } finally {
      setSkillBusy(false)
    }
  }

  /**
   * 请求 Core 校验单个 Skill，并把结果绑定到对应卡片。
   * @param skillID - 目标 Skill ID
   * @author lvdaxianer@yeah.net
   * @date 2026-11-20
   */
  async function validateSkill(skillID: string) {
    if (skillBusy()) return
    setSkillBusy(true)
    try {
      const result = await client.experimental.headless.skill.validate({ id: skillID })
      const skill = result.data.data.find((item) => item.id === skillID)
      setSkillValidation({
        ...skillValidation(),
        [skillID]: skill?.status === "ready" ? "validated / ready" : "needs attention",
      })
    } catch (error) {
      setSkillValidation({ ...skillValidation(), [skillID]: messageFrom(error, "validation failed") })
    } finally {
      setSkillBusy(false)
    }
  }

  async function selectSession(session: SessionSummary, announce = true) {
    const sequence = ++sessionSelectSequence
    streamController?.abort()
    const snapshot = await client.experimental.headless.session.state({ sessionID: session.id })
    if (sequence !== sessionSelectSequence) return
    setSessionID(session.id)
    setSessionName(snapshot.data.session.name)
    setSessionStatus(snapshot.data.session.status)
    setDirectory(snapshot.data.session.directory)
    setEvents([])
    setChatItems([])
    setPermissions(snapshot.data.pendingPermissions)
    setQuestions(snapshot.data.pendingQuestions)
    setQuestionAnswers({})
    setCompactionStatus("idle")
    setContextSources([])
    seenEventKeys.clear()
    sessionStorage.setItem("headless.sessionID", session.id)
    connectEvents(session.id)
    if (announce) setNotice(`已选择 Session：${snapshot.data.session.name}`)
  }

  /**
   * 校验工作目录并在失败时保留输入。
   * @returns 目录是否可以提交
   * @author lvdaxianer@yeah.net
   */
  function canCreateSession(): boolean {
    const error = validateDirectoryInput(directory())
    setDirectoryError(error)
    if (error) {
      setNotice("Session 未创建，请先修正工作目录")
      focusField("session-directory")
      return false
    }
    setSessionNameError("")
    return true
  }

  /**
   * 校验目录并请求 Core 创建 Session。
   * @author lvdaxianer@yeah.net
   */
  async function createSession() {
    if (sessionBusy() || !canCreateSession()) return
    setSessionBusy(true)
    setSessionCreateState("pending")
    setSessionCreateMessage("正在检查目录并创建 Session…")
    try {
      const created = await client.experimental.headless.session.create({
        directory: directory().trim(),
        ...(sessionCreateName().trim() ? { name: sessionCreateName().trim() } : {}),
      })
      applyCreatedSession(created.data)
    } catch (error) {
      handleSessionCreateFailure(error)
    } finally {
      setSessionBusy(false)
    }
  }

  /**
   * 将新建 Session 的数据同步到页面状态。
   * @param created - Core 返回的 Session 摘要
   * @author lvdaxianer@yeah.net
   */
  function applyCreatedSession(created: SessionSummary) {
    setSessionID(created.id)
    setSessionName(created.name)
    setSessionStatus(created.status)
    setDirectory(created.directory)
    sessionStorage.setItem("headless.sessionID", created.id)
    setSessions((current) => [...current.filter((item) => item.id !== created.id), created])
    setEvents([])
    setChatItems([])
    setPermissions([])
    setQuestions([])
    setQuestionAnswers({})
    setCompactionStatus("idle")
    setContextSources([])
    seenEventKeys.clear()
    connectEvents(created.id)
    setSessionDrawerOpen(false)
    setSessionNameError("")
    setSessionCreateState("success")
    setSessionCreateMessage("目录已校验，Session 创建成功")
    setNotice(`Session「${created.name}」已创建，等待 Prompt`)
  }

  /**
   * 展示 Session 创建失败，并保留目录用于重试。
   * @param error - 创建失败原因
   * @author lvdaxianer@yeah.net
   */
  function handleSessionCreateFailure(error: unknown) {
    const message = messageFrom(error, "Session 创建失败，请检查工作目录")
    if (message.includes("名称")) setSessionNameError(message)
    else setDirectoryError(message)
    setSessionCreateState("error")
    setSessionCreateMessage(message)
    setNotice(message)
  }

  function openRenameSession() {
    const current = sessions().find((session) => session.id === sessionID())
    if (!current) return
    setSessionEditName(current.name)
    setSessionEditDrawerOpen(true)
  }

  function openCreateSession() {
    setSessionCreateName("")
    setDirectory("")
    setDirectoryError("")
    setSessionNameError("")
    setSessionCreateState("idle")
    setSessionCreateMessage("")
    setSessionDrawerOpen(true)
  }

  async function renameSession() {
    const name = sessionEditName().trim()
    if (renameBusy() || !sessionID() || !name) {
      setSessionNameError("请输入 Session 名称")
      return
    }
    setRenameBusy(true)
    try {
      const updated = await client.experimental.headless.session.update({ sessionID: sessionID(), name })
      setSessions((current) => current.map((session) => (session.id === updated.data.id ? updated.data : session)))
      setSessionName(updated.data.name)
      setSessionEditDrawerOpen(false)
      setSessionNameError("")
      setNotice(`Session 已重命名为「${updated.data.name}」`)
    } catch (error) {
      setSessionNameError(messageFrom(error, "Session 名称更新失败，请重试"))
    } finally {
      setRenameBusy(false)
    }
  }

  async function connectEvents(id: string) {
    streamController?.abort()
    const controller = new AbortController()
    streamController = controller
    setConnected(true)
    try {
      const lastEventID = eventCursors.get(id)
      for await (const event of client.experimental.headless.session.events(
        { sessionID: id },
        {
          signal: controller.signal,
          headers: lastEventID ? { "Last-Event-ID": lastEventID } : undefined,
        },
      )) {
        const eventKey = event.eventID
        if (seenEventKeys.has(eventKey)) continue
        seenEventKeys.add(eventKey)
        eventCursors.set(id, event.eventID)
        setEvents((current) => [
          ...[
            ...current,
            { ...event, localTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
          ].slice(-200),
        ])
        setChatItems((current) => projectChatEvent(current, event))
        if (event.type === "session.completed") setSessionStatus("completed")
        if (event.type === "session.failed") setSessionStatus("failed")
        if (event.type === "session.cancelled") setSessionStatus("cancelled")
        if (event.type === "tool.request" || event.type === "permission.requested")
          setSessionStatus("awaiting permission")
        if (event.type === "question.request") {
          setSessionStatus("awaiting question")
          void refreshQuestions(id)
        }
        if (event.type === "question.result" || event.type === "question.cancelled") void refreshQuestions(id)
        if (event.type === "tool.result" || event.type === "assistant.text") setSessionStatus("running")
        if (event.type === "context.compaction.started") setCompactionStatus("compressing")
        if (event.type === "context.compaction.completed") setCompactionStatus("completed")
        if (event.type === "context.compaction.failed") setCompactionStatus("failed")
        if (event.type === "context.project.loaded") setContextSources(sourcesFromEvent(event.data))
        if (event.type === "skill.activated") {
          const id = skillIDFromEvent(event.data)
          if (id) setActiveSkillIDs((current) => (current.includes(id) ? current : [...current, id]))
        }
        if (event.type === "skill.failed") setNotice("Skill 激活失败，请检查状态和权限")
        void refreshPermissions(id)
      }
    } catch (error) {
      if (!controller.signal.aborted) setNotice(messageFrom(error, "事件流已断开，请重新连接"))
    } finally {
      if (!controller.signal.aborted) setConnected(false)
    }
  }

  async function refreshPermissions(id = sessionID()) {
    if (!id) return
    try {
      setPermissions((await client.experimental.headless.session.permission.list({ sessionID: id })).data)
    } catch {
      // A missing permission endpoint should not break the event timeline.
    }
  }

  async function refreshQuestions(id = sessionID()) {
    if (!id) return
    try {
      setQuestions((await client.experimental.headless.session.question.list({ sessionID: id })).data)
    } catch {
      // A missing Question endpoint should not break the event timeline.
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
    setQuestionAnswers({
      ...questionAnswers(),
      [request.id]: answers.map((value, index) => (index === questionIndex ? next : value)),
    })
  }

  function answerSelected(requestID: string, questionIndex: number, label: string) {
    return questionAnswers()[requestID]?.[questionIndex]?.includes(label) ?? false
  }

  /**
   * 根据输入末尾的 @token 计算可选 Skill。
   * @returns 当前输入匹配的 ready Skill
   * @author lvdaxianer@yeah.net
   * @date 2026-11-20
   */
  function skillSuggestions(): SkillSummary[] {
    const match = prompt().match(/(?:^|\s)@([a-z0-9-]*)$/i)
    if (!match) return []
    const query = match[1]?.toLowerCase() ?? ""
    return skills()
      .filter((skill) => skill.status === "ready" && skill.id.toLowerCase().includes(query))
      .slice(0, 5)
  }

  /**
   * 将下拉选择替换回输入框中的 mention token。
   * @param skill - 用户选中的 Skill 摘要
   * @author lvdaxianer@yeah.net
   * @date 2026-11-20
   */
  function selectSkill(skill: SkillSummary) {
    const value = prompt()
    const match = value.match(/(?:^|\s)@([a-z0-9-]*)$/i)
    if (!match || match.index === undefined) return
    const tokenStart = match.index + (match[0].startsWith(" ") ? 1 : 0)
    setPrompt(`${value.slice(0, tokenStart)}@${skill.id} `)
    setActiveSkillIDs((current) => (current.includes(skill.id) ? current : [...current, skill.id]))
  }

  async function replyQuestion(request: QuestionRequest) {
    if (!sessionID()) return
    setBusy(true)
    try {
      const answers = questionAnswers()[request.id] ?? request.questions.map(() => [])
      await client.experimental.headless.session.question.reply({
        sessionID: sessionID(),
        requestID: request.id,
        answers,
      })
      setChatItems((current) =>
        updateChatItem(current, `question:${request.id}`, { status: "completed", content: "补充信息已提交" }),
      )
      await refreshQuestions()
      setNotice("补充信息已提交，运行继续")
    } catch (error) {
      setNotice(messageFrom(error, "补充信息提交失败，请重试"))
    } finally {
      setBusy(false)
    }
  }

  async function cancelQuestion(requestID: string) {
    if (!sessionID() || pendingQuestionID()) return
    setPendingQuestionID(requestID)
    try {
      await client.experimental.headless.session.question.cancel({ sessionID: sessionID(), requestID })
      setChatItems((current) =>
        updateChatItem(current, `question:${requestID}`, { status: "cancelled", content: "补充信息已取消" }),
      )
      await refreshQuestions()
      setNotice("已取消补充信息，Core 不会伪造答案")
    } catch (error) {
      setNotice(messageFrom(error, "取消补充信息失败，请重试"))
    } finally {
      setPendingQuestionID("")
    }
  }

  async function sendPrompt() {
    if (!sessionID() || !prompt().trim()) return
    setBusy(true)
    seenEventKeys.clear()
    const text = prompt().trim()
    setChatItems((current) =>
      appendChatItem(current, {
        id: `user:${Date.now()}:${promptSequence++}`,
        kind: "user",
        title: "你",
        content: text,
        status: "completed",
        localTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }),
    )
    try {
      setActiveSkillIDs(skillIDsFromText(text))
      await client.experimental.headless.session.prompt({ sessionID: sessionID(), text })
      await refreshPermissions()
      setPrompt("")
      setSessionStatus("running")
      setNotice("Prompt 已提交，等待下一条运行事件")
    } catch (error) {
      setChatItems((current) =>
        appendChatItem(current, {
          id: `status:prompt:${Date.now()}`,
          kind: "status",
          title: "Prompt 提交失败",
          content: messageFrom(error, "请检查连接后重试"),
          status: "failed",
          localTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }),
      )
      setNotice(messageFrom(error, "Prompt 未提交成功，请重试"))
    } finally {
      setBusy(false)
    }
  }

  /**
   * 打开取消确认对话框；取消运行不可恢复，必须先让用户看到后果再提交。
   * @author lvdaxianer@yeah.net
   * @date 2026-11-20
   */
  function requestCancel() {
    if (!sessionID() || cancelBusy()) return
    setCancelConfirmOpen(true)
  }

  /**
   * 确认后请求 Core 取消当前运行；请求结束前确认按钮保持 busy，结果通过 notice 可发现。
   * @author lvdaxianer@yeah.net
   * @date 2026-11-20
   */
  async function confirmCancelSession() {
    if (!sessionID() || cancelBusy()) return
    setCancelBusy(true)
    try {
      await client.experimental.headless.session.cancel({ sessionID: sessionID() })
      setSessionStatus("cancelled")
      setNotice("已请求取消运行")
    } catch (error) {
      setNotice(messageFrom(error, "取消运行失败，请重试"))
    } finally {
      setCancelBusy(false)
      setCancelConfirmOpen(false)
    }
  }

  async function reconnectEvents() {
    if (!sessionID()) return
    connectEvents(sessionID())
    setNotice("事件流正在重新连接")
  }

  async function decide(requestID: string, decision: "allow_once" | "allow_always" | "deny") {
    if (pendingDecisionID()) return
    setPendingDecisionID(requestID)
    try {
      await client.experimental.headless.session.permission.reply({ sessionID: sessionID(), requestID, decision })
      setChatItems((current) =>
        updateChatItem(current, `permission:${requestID}`, {
          status: decision === "deny" ? "failed" : "completed",
          content: decision === "deny" ? "权限已拒绝" : "权限已通过",
        }),
      )
      await refreshPermissions()
      setNotice(decision === "deny" ? "权限已拒绝" : "权限已通过")
    } catch (error) {
      setNotice(messageFrom(error, "权限处理失败，请重试"))
    } finally {
      setPendingDecisionID("")
    }
  }

  return (
    <main class="app-shell">
      <aside class="app-sidebar">
        <div class="sidebar-brand">
          <span class="brand-mark">H</span>
          <div>
            <p class="eyebrow">OPENCODE / HEADLESS</p>
            <strong>内部演示工作台</strong>
          </div>
        </div>

        <nav class="side-nav" aria-label="主导航">
          <a class="nav-item is-active" href="#workspace">
            <span>⌂</span>工作台
          </a>
          <a class="nav-item" href="#session">
            <span>◌</span>Session
          </a>
          <Drawer
            title="新建 Session"
            description="为一个独立的工作目录创建可恢复的 Session。模型配置是全局的，不需要在这里重复填写。"
            open={sessionDrawerOpen()}
            onOpenChange={(open) => (open ? openCreateSession() : setSessionDrawerOpen(false))}
            triggerClass="nav-item"
            trigger={
              <>
                <span>＋</span>新建 Session
              </>
            }
          >
            <label class={`form-field ${sessionNameError() ? "field-invalid" : ""}`}>
              <span>Session 名称 <span class="label-note">可选</span></span>
              <input
                id="session-create-name"
                aria-label="Session 名称"
                aria-invalid={Boolean(sessionNameError())}
                value={sessionCreateName()}
                onInput={(event) => {
                  setSessionCreateName(event.currentTarget.value)
                  setSessionNameError("")
                }}
                placeholder="默认使用目录名称"
              />
              <span class="field-help">名称只用于识别 Session，不会改变工作目录。</span>
              <Show when={sessionNameError()}>
                <span class="field-error" role="alert">{sessionNameError()}</span>
              </Show>
            </label>
            <label class={`form-field ${directoryError() ? "field-invalid" : ""}`}>
              <span>工作目录 <span class="required-mark">必填</span></span>
              <input
                id="session-directory"
                aria-label="工作目录"
                aria-invalid={Boolean(directoryError())}
                aria-describedby={directoryError() ? "session-directory-error" : "session-directory-help"}
                value={directory()}
                onInput={(event) => {
                  setDirectory(event.currentTarget.value)
                  setDirectoryError("")
                  setSessionCreateState("idle")
                  setSessionCreateMessage("")
                }}
                placeholder="/workspace/project"
              />
              <span id="session-directory-help" class="field-help">
                填写运行服务器上的绝对路径，目录必须已存在且可读写。
              </span>
              <Show when={directoryError()}>
                <span id="session-directory-error" class="field-error" role="alert">
                  {directoryError()}
                </span>
              </Show>
            </label>
            <button class="button button-primary" disabled={sessionBusy()} onClick={createSession}>
              {sessionBusy() ? "创建中…" : "保存并创建 Session"} <span>→</span>
            </button>
            <Show when={sessionCreateMessage()}>
              <p class={`form-feedback form-feedback-${sessionCreateState()}`} role="status" aria-live="polite">
                {sessionCreateMessage()}
              </p>
            </Show>
          </Drawer>
          <Drawer
            title="Skills"
            description="Skill 先注册、校验，再进入模型上下文。"
            open={skillsDrawerOpen()}
            onOpenChange={setSkillsDrawerOpen}
            triggerClass="nav-item"
            trigger={
              <>
                <span>✦</span>Skills
                <Show when={skills().length > 0}>
                  <span class="nav-badge">{skills().length}</span>
                </Show>
              </>
            }
          >
            <div class="drawer-toolbar">
              <p class="helper-text">在 Prompt 中输入 @ 可以引用 ready 状态的 Skill。</p>
              <button class="text-button" disabled={skillBusy()} onClick={refreshSkills}>
                {skillBusy() ? "刷新中…" : "刷新"}
              </button>
            </div>
            <div class="skill-list" aria-live="polite">
              <Show when={skills().length > 0} fallback={<p class="empty-copy">暂无已发现的项目 Skill</p>}>
                <For each={skills()}>
                  {(skill) => (
                    <article class={`skill-row skill-row-${skill.status}`}>
                      <div class="skill-row-copy">
                        <div class="skill-row-title">
                          <strong>{skill.id}</strong>
                          <span class="skill-status">{skill.status}</span>
                        </div>
                        <p>{skill.description || "暂无描述"}</p>
                        <small>
                          {skill.fileCount} 个文件 · {skill.digest.slice(0, 10)}
                        </small>
                      </div>
                      <button class="skill-validate" onClick={() => validateSkill(skill.id)} disabled={skillBusy()}>
                        校验
                      </button>
                      <Show when={skillValidation()[skill.id]}>
                        <span class="skill-validation">{skillValidation()[skill.id]}</span>
                      </Show>
                    </article>
                  )}
                </For>
              </Show>
            </div>
          </Drawer>
          <Drawer
            title="模型服务"
            description="保存模型服务配置后，Core 才能发起模型调用。"
            open={modelDrawerOpen()}
            onOpenChange={setModelDrawerOpen}
            triggerClass="nav-item"
            trigger={
              <>
                <span>◈</span>模型配置
                <span class={`nav-badge ${modelConfigured() ? "is-ready" : ""}`}>
                  {modelConfigured() ? "已配置" : "待配置"}
                </span>
              </>
            }
          >
            <label class={`form-field ${modelErrors().baseUrl ? "field-invalid" : ""}`}>
              <span>
                服务地址 <span class="required-mark">必填</span>
              </span>
              <input
                id="model-base-url"
                aria-label="服务地址"
                aria-invalid={Boolean(modelErrors().baseUrl)}
                aria-describedby={modelErrors().baseUrl ? "model-base-url-error" : undefined}
                value={baseUrl()}
                onInput={(event) => {
                  setBaseUrl(event.currentTarget.value)
                  markModelEdited("baseUrl")
                }}
                placeholder="https://…/v1"
              />
              <Show when={modelErrors().baseUrl}>
                <span id="model-base-url-error" class="field-error" role="alert">
                  {modelErrors().baseUrl}
                </span>
              </Show>
            </label>
            <label class={`form-field ${modelErrors().model ? "field-invalid" : ""}`}>
              <span>
                模型名称 <span class="required-mark">必填</span>
              </span>
              <input
                id="model-name"
                aria-label="模型名称"
                aria-invalid={Boolean(modelErrors().model)}
                aria-describedby={modelErrors().model ? "model-name-error" : undefined}
                value={model()}
                onInput={(event) => {
                  setModel(event.currentTarget.value)
                  markModelEdited("model")
                }}
                placeholder="coding-model"
              />
              <Show when={modelErrors().model}>
                <span id="model-name-error" class="field-error" role="alert">
                  {modelErrors().model}
                </span>
              </Show>
            </label>
            <label class={`form-field ${modelErrors().credential ? "field-invalid" : ""}`}>
              凭据引用 <span class="required-mark">二选一必填</span>
              <input
                aria-label="凭据引用"
                value={credentialRef()}
                aria-invalid={Boolean(modelErrors().credential)}
                aria-describedby={modelErrors().credential ? "model-credential-error" : undefined}
                onInput={(event) => {
                  setCredentialRef(event.currentTarget.value)
                  markModelEdited("credential")
                }}
                placeholder="MODEL_API_KEY"
              />
            </label>
            <label class={`form-field ${modelErrors().credential ? "field-invalid" : ""}`}>
              凭据值 <span class="label-note">仅写入运行时</span>
              <input
                id="model-credential"
                aria-label="凭据值"
                type="password"
                value={credential()}
                aria-invalid={Boolean(modelErrors().credential)}
                aria-describedby={modelErrors().credential ? "model-credential-error" : undefined}
                onInput={(event) => {
                  setCredential(event.currentTarget.value)
                  markModelEdited("credential")
                }}
                placeholder="输入后不会回显"
              />
              <span class="field-help">凭据引用与凭据值二选一，至少填写一项。</span>
              <Show when={modelErrors().credential}>
                <span id="model-credential-error" class="field-error" role="alert">
                  {modelErrors().credential}
                </span>
              </Show>
            </label>
            <div class="button-stack">
              <button class="button button-primary" disabled={modelSaveBusy()} onClick={saveModel}>
                {modelSaveBusy() ? "保存中…" : "保存模型配置"}
              </button>
              <button class="button button-secondary" disabled={probeBusy()} onClick={probeModel}>
                {probeBusy() ? "探测中…" : "探测模型能力"}
                <span>↗</span>
              </button>
            </div>
            <Show when={probeResult()}>
              {(result) => (
                <div class="probe-result" aria-live="polite">
                  <span>文本响应：{result().text}</span>
                  <span>Function Calling：{result().functionCalling}</span>
                </div>
              )}
            </Show>
            <Show when={modelSaveMessage()}>
              <p class={`form-feedback form-feedback-${modelSaveState()}`} role="status" aria-live="polite">
                {modelSaveMessage()}
              </p>
            </Show>
          </Drawer>
        </nav>

        <section class="sidebar-card" id="session">
          <div class="card-heading">
            <div>
              <span class="section-kicker">可恢复工作区</span>
              <h2>Session</h2>
            </div>
            <span class="status-badge">{sessions().length} 个</span>
          </div>
          <Show when={sessions().length > 0} fallback={<p class="empty-copy session-empty">还没有 Session，点击上方“新建 Session”开始。</p>}>
            <div class="session-list" aria-label="可用 Session">
              <For each={sessions()}>
                {(session) => (
                  <button
                    class={`session-item ${session.id === sessionID() ? "is-active" : ""}`}
                    aria-pressed={session.id === sessionID()}
                    title={session.directory}
                    onClick={() => void selectSession(session)}
                  >
                    <span class="session-item-copy">
                      <strong class="session-item-name">{session.name}</strong>
                      <small class="session-item-directory">{session.directory}</small>
                    </span>
                    <small class={`session-item-status session-item-status-${session.status}`}>{session.status}</small>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </section>

        <div class="notice" aria-live="polite">
          <span class={`notice-light ${connected() ? "is-live" : ""}`} />
          {notice()}
        </div>
      </aside>

      <section class="app-main" id="workspace">
        <header class="topbar">
          <div>
            <p class="breadcrumb">内部演示 / Headless Core</p>
            <h1>Agent 工作台</h1>
          </div>
          <div class="topbar-meta">
            <span class={`connection-chip ${connected() ? "is-live" : ""}`}>
              <span class="status-dot" />
              {connected() ? "事件流已连接" : "等待连接"}
            </span>
            <span class="model-chip">{model() ? `全局模型 · ${model()}` : "未配置全局模型"}</span>
          </div>
        </header>

        <div class="session-toolbar">
          <div class="session-summary">
            <span class="section-kicker">当前 Session</span>
            <strong class="session-current-name">{sessionName() || "尚未选择 Session"}</strong>
            <span class={`pill pill-${sessionStatus()}`}>{sessionStatus()}</span>
            <Show when={sessionID()}>
              <span class="session-id">{sessionID()}</span>
              <span class="current-session-directory" title={directory()}>{directory()}</span>
            </Show>
          </div>
          <div class="toolbar-actions">
            <Drawer
              title="编辑 Session 名称"
              description="名称只用于识别当前 Session，工作目录和 Session ID 不会改变。"
              open={sessionEditDrawerOpen()}
              onOpenChange={(open) => (open ? openRenameSession() : setSessionEditDrawerOpen(false))}
              triggerClass="toolbar-button"
              trigger="编辑名称"
            >
              <label class={`form-field ${sessionNameError() ? "field-invalid" : ""}`}>
                <span>Session 名称 <span class="required-mark">必填</span></span>
                <input
                  id="session-edit-name"
                  aria-label="Session 名称"
                  aria-invalid={Boolean(sessionNameError())}
                  value={sessionEditName()}
                  onInput={(event) => {
                    setSessionEditName(event.currentTarget.value)
                    setSessionNameError("")
                  }}
                />
                <Show when={sessionNameError()}>
                  <span class="field-error" role="alert">{sessionNameError()}</span>
                </Show>
              </label>
              <button class="button button-primary" disabled={!sessionID() || renameBusy()} onClick={() => void renameSession()}>
                {renameBusy() ? "保存中…" : "保存名称"}
              </button>
            </Drawer>
            <button class="toolbar-button" disabled={!sessionID()} onClick={reconnectEvents}>
              重新连接
            </button>
            <button class="toolbar-button" disabled={!sessionID() || refreshBusy()} onClick={refreshRuntime}>
              {refreshBusy() ? "刷新中…" : "刷新状态"}
            </button>
            <button
              class="toolbar-button toolbar-danger"
              disabled={!sessionID() || cancelBusy()}
              onClick={requestCancel}
            >
              取消运行
            </button>
          </div>
        </div>

        <section class="capability-grid" aria-label="核心能力">
          <article class="capability-card">
            <span class="capability-icon">↯</span>
            <div>
              <span>Function Calling</span>
              <strong class={capabilityStateClass(probeResult()?.functionCalling ?? "待探测")}>
                {probeResult()?.functionCalling ?? "待探测"}
              </strong>
            </div>
          </article>
          <article class="capability-card">
            <span class="capability-icon">✓</span>
            <div>
              <span>权限门禁</span>
              <strong class={capabilityStateClass(permissions().length > 0 ? "待处理" : "安全")}>
                {permissions().length > 0 ? `${permissions().length} 个待处理` : "安全"}
              </strong>
            </div>
          </article>
          <article class="capability-card">
            <span class="capability-icon">?</span>
            <div>
              <span>补充信息</span>
              <strong class={capabilityStateClass(questions().length > 0 ? "个问题" : "空闲")}>
                {questions().length > 0 ? `${questions().length} 个问题` : "空闲"}
              </strong>
            </div>
          </article>
          <article class="capability-card">
            <span class="capability-icon">≈</span>
            <div>
              <span>上下文压缩</span>
              <strong class={`context-value ${capabilityStateClass(compactionStatus())}`}>{compactionStatus()}</strong>
            </div>
          </article>
          <article class="capability-card">
            <span class="capability-icon">✦</span>
            <div>
              <span>Skill</span>
              <strong class={capabilityStateClass(activeSkillIDs().length > 0 ? "已激活" : "未激活")}>
                {activeSkillIDs().length > 0 ? `${activeSkillIDs().length} 个已激活` : "未激活"}
              </strong>
            </div>
          </article>
        </section>

        <section class="main-grid">
          <section class="conversation-panel panel-surface">
            <div class="panel-header">
              <div>
                <span class="section-kicker">实时执行</span>
                <h2>Coding Loop</h2>
              </div>
              <span class="event-count">{events().length.toString().padStart(2, "0")} 条事件</span>
            </div>
            <div class="conversation-body">
              <div class="chat-stream" role="log" aria-live="polite">
                <Show
                  when={chatItems().length > 0}
                  fallback={
                    <Show
                      when={sessionID()}
                      fallback={
                        <div class="empty-state">
                          <span>◌</span>
                          <strong>等待一次 Prompt</strong>
                          <p>按下面的顺序准备好运行环境，Agent 的执行过程会实时出现在这里。</p>
                          <div class="empty-steps">
                            <div class={`empty-step ${modelConfigured() ? "is-done" : ""}`}>
                              <span class="step-mark">{modelConfigured() ? "✓" : "1"}</span>
                              打开「模型配置」抽屉保存模型服务配置
                              <small>{modelConfigured() ? "已配置" : "待完成"}</small>
                            </div>
                            <div class="empty-step">
                              <span class="step-mark">2</span>
                              创建或选择一个 Session
                              <small>待完成</small>
                            </div>
                            <div class="empty-step">
                              <span class="step-mark">3</span>
                              在下方输入第一个 Coding 任务
                              <small>待开始</small>
                            </div>
                          </div>
                        </div>
                      }
                    >
                      <div class="empty-state">
                        <span>◌</span>
                        <strong>Session 已就绪</strong>
                        <p>在下方输入你的第一个 Coding 任务，Agent 的流式输出、工具调用和权限请求都会出现在这里。</p>
                      </div>
                    </Show>
                  }
                >
                  <For each={chatItems()}>
                    {(item) => (
                      <article class={`chat-message ${item.kind} chat-status-${item.status}`}>
                        <span class="chat-avatar">
                          {item.kind === "user" ? "你" : item.kind === "assistant" ? "A" : "C"}
                        </span>
                        <div class="chat-message-body">
                          <div class="chat-message-head">
                            <strong>{item.title}</strong>
                            <span>
                              {item.localTime} · {chatStatusLabel(item.status)}
                            </span>
                          </div>
                          <Switch>
                            <Match when={item.kind === "user" || item.kind === "assistant"}>
                              <p class="chat-copy">{item.content || "Agent 正在输出…"}</p>
                            </Match>
                            <Match when={item.kind === "execution"}>
                              <div class="execution-card">
                                <div class="execution-card-head">
                                  <strong>{item.title}</strong>
                                  <span>{chatStatusLabel(item.status)}</span>
                                </div>
                                <p>{item.content}</p>
                                <Show when={item.detail}>
                                  <details>
                                    <summary>查看结构化详情</summary>
                                    <pre>{item.detail}</pre>
                                  </details>
                                </Show>
                              </div>
                            </Match>
                            <Match when={item.kind === "status"}>
                              <div class="status-card">
                                <strong>{item.content}</strong>
                              </div>
                            </Match>
                          </Switch>
                        </div>
                      </article>
                    )}
                  </For>
                </Show>
              </div>
              <details class="event-trace" open>
                <summary>事件明细 · {events().length.toString().padStart(2, "0")} 条</summary>
                <div class="timeline">
                  <For each={events()}>
                    {(event) => (
                      <article class="event-row">
                        <span class="event-seq">{String(event.sequence).padStart(2, "0")}</span>
                        <div class="event-body">
                          <strong>{event.type}</strong>
                          <small>
                            {event.localTime} · {event.sessionID.slice(0, 8)}
                          </small>
                          <Show when={event.data}>
                            <pre>{JSON.stringify(event.data, null, 2)}</pre>
                          </Show>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </details>
            </div>
            <div class="prompt-box">
              <div class="prompt-composer">
                <textarea
                  aria-label="Coding Prompt"
                  value={prompt()}
                  onInput={(event) => setPrompt(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void sendPrompt()
                  }}
                  placeholder="描述下一步 Coding 任务…"
                  disabled={!sessionID()}
                />
                <Show when={skillSuggestions().length > 0}>
                  <div class="skill-suggestions" role="listbox" aria-label="Skill 建议">
                    <For each={skillSuggestions()}>
                      {(skill) => (
                        <button
                          class="skill-suggestion"
                          role="option"
                          aria-label={`@${skill.id}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectSkill(skill)}
                        >
                          <span>@{skill.id}</span>
                          <small>{skill.description}</small>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={activeSkillIDs().length > 0}>
                  <div class="active-skill-row" aria-label="已附加 Skill">
                    <span class="section-kicker">已附加</span>
                    <For each={activeSkillIDs()}>{(id) => <span class="skill-chip">@{id}</span>}</For>
                  </div>
                </Show>
              </div>
              <button class="send-button" disabled={!sessionID() || !prompt().trim() || busy()} onClick={sendPrompt}>
                {busy() ? "发送中…" : "发送 Prompt"}
                <span>⌘ ↵</span>
              </button>
            </div>
          </section>

          <aside class="status-rail">
            <section class="rail-panel panel-surface">
              <div class="panel-header">
                <div>
                  <span class="section-kicker">运行监控</span>
                  <h2>运行状态</h2>
                </div>
                <span class={`status-badge ${connected() ? "success" : "muted"}`}>{connected() ? "在线" : "离线"}</span>
              </div>
              <div class="status-list">
                <div>
                  <span>Session</span>
                  <strong>{sessionStatus()}</strong>
                </div>
                <div>
                  <span>事件流</span>
                  <strong>{connected() ? "实时" : "未连接"}</strong>
                </div>
                <div>
                  <span>上下文</span>
                  <strong>{compactionStatus()}</strong>
                </div>
              </div>
            </section>

            <section class="rail-panel panel-surface queue-panel">
              <div class="panel-header">
                <div>
                  <span class="section-kicker">需要你处理</span>
                  <h2>权限队列</h2>
                </div>
                <span class="queue-count">{permissions().length + questions().length}</span>
              </div>
              <Show when={permissions().length > 0} fallback={<p class="empty-copy">当前没有待处理权限请求</p>}>
                <div class="permission-list">
                  <For each={permissions()}>
                    {(request) => (
                      <div class="permission-card">
                        <div>
                          <span class="permission-action">{request.action}</span>
                          <strong>{request.resource}</strong>
                          <small>{request.reason}</small>
                        </div>
                        <div class="permission-actions">
                          <button
                            disabled={Boolean(pendingDecisionID())}
                            onClick={() => decide(request.id, "allow_once")}
                          >
                            {pendingDecisionID() === request.id ? "处理中…" : "允许一次"}
                          </button>
                          <button
                            disabled={Boolean(pendingDecisionID())}
                            onClick={() => decide(request.id, "allow_always")}
                          >
                            始终允许
                          </button>
                          <button
                            class="deny"
                            disabled={Boolean(pendingDecisionID())}
                            onClick={() => decide(request.id, "deny")}
                          >
                            拒绝
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section class="rail-panel panel-surface question-panel">
              <div class="panel-header">
                <div>
                  <span class="section-kicker">需要你补充</span>
                  <h2>补充信息</h2>
                </div>
                <span class="queue-count">{questions().length}</span>
              </div>
              <Show when={questions().length > 0} fallback={<p class="empty-copy">当前没有待回答问题</p>}>
                <div class="question-list">
                  <For each={questions()}>
                    {(request) => (
                      <article class="question-card">
                        <div class="question-card-head">
                          <span class="permission-action">{request.id}</span>
                          <button
                            class="text-button"
                            disabled={Boolean(pendingQuestionID())}
                            onClick={() => cancelQuestion(request.id)}
                          >
                            {pendingQuestionID() === request.id ? "取消中…" : "取消"}
                          </button>
                        </div>
                        <For each={request.questions}>
                          {(question, questionIndex) => (
                            <div class="question-block">
                              <strong>{question.question}</strong>
                              <div class="answer-options">
                                <For each={question.options}>
                                  {(option) => (
                                    <button
                                      class={`answer-option ${answerSelected(request.id, questionIndex(), option.label) ? "is-selected" : ""}`}
                                      aria-pressed={answerSelected(request.id, questionIndex(), option.label)}
                                      onClick={() => chooseAnswer(request, questionIndex(), option.label)}
                                    >
                                      <span>{option.label}</span>
                                      <small>{option.description}</small>
                                    </button>
                                  )}
                                </For>
                              </div>
                            </div>
                          )}
                        </For>
                        <button
                          class="button button-primary"
                          disabled={busy() || Boolean(pendingQuestionID())}
                          onClick={() => replyQuestion(request)}
                        >
                          {busy() ? "提交中…" : "提交回答"}
                        </button>
                      </article>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section class="rail-panel panel-surface context-panel">
              <div class="panel-header">
                <div>
                  <span class="section-kicker">项目理解</span>
                  <h2>上下文来源</h2>
                </div>
                <span class="queue-count">{contextSources().length}</span>
              </div>
              <Show when={contextSources().length > 0} fallback={<p class="empty-copy">等待 Core 加载项目指令</p>}>
                <div class="source-list">
                  <For each={contextSources()}>
                    {(source) => (
                      <div class="source-row">
                        <span>{source.kind}</span>
                        <code>{source.path}</code>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>
          </aside>
        </section>

        <footer>
          <span>HEADLESS CORE / INTERNAL DEMO</span>
          <span>UI 是控制面，Runtime 在 Core</span>
        </footer>

        <ConfirmDialog
          title="取消当前运行？"
          description="取消后正在执行的 Agent 任务会立即停止，本轮进度不可恢复。确认要继续吗？"
          confirmLabel="确认取消运行"
          open={cancelConfirmOpen()}
          onOpenChange={setCancelConfirmOpen}
          busy={cancelBusy()}
          onConfirm={confirmCancelSession}
        />
      </section>
    </main>
  )
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function sourcesFromEvent(data: unknown): ContextSource[] {
  if (!data || typeof data !== "object" || !Array.isArray((data as { sources?: unknown }).sources)) return []
  return (data as { sources: unknown[] }).sources.filter(isContextSource)
}

function isContextSource(value: unknown): value is ContextSource {
  if (!value || typeof value !== "object") return false
  const source = value as Record<string, unknown>
  return typeof source.sourceID === "string" && typeof source.kind === "string" && typeof source.path === "string"
}

/**
 * 将一条聊天条目追加到有界的前端运行记录中。
 * @param items 当前聊天条目
 * @param item 待追加条目
 * @returns 保留最近窗口后的聊天条目
 */
function appendChatItem(items: ChatItem[], item: ChatItem): ChatItem[] {
  return [...items, item].slice(-maxChatItems)
}

/**
 * 按稳定条目 ID 更新聊天卡片，避免重连时重建整条消息流。
 * @param items 当前聊天条目
 * @param id 卡片 ID
 * @param patch 要更新的字段
 * @returns 更新后的聊天条目
 */
function updateChatItem(items: ChatItem[], id: string, patch: Partial<ChatItem>): ChatItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

/**
 * 将 Headless SSE 事件投影为用户可读的聊天消息或执行卡片。
 * @param items 当前聊天条目
 * @param event 已去重的 Headless 事件
 * @returns 更新后的聊天条目
 */
function projectChatEvent(items: ChatItem[], event: ExperimentalHeadlessSessionEventsOutput): ChatItem[] {
  const data = event.data ?? {}
  const localTime = new Date(event.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const detail = JSON.stringify(data, null, 2)
  const value = (key: string) => (typeof data[key] === "string" ? data[key] : "")
  const upsert = (item: ChatItem) => {
    const existing = items.find((current) => current.id === item.id)
    return existing ? updateChatItem(items, item.id, item) : appendChatItem(items, item)
  }

  switch (event.type) {
    case "assistant.text": {
      const idPrefix = `assistant:${event.runID}:`
      const last = items.at(-1)
      if (last?.kind === "assistant" && last.id.startsWith(idPrefix)) {
        return updateChatItem(items, last.id, {
          content: `${last.content ?? ""}${value("content")}`,
          status: "streaming",
          localTime,
          eventType: event.type,
        })
      }
      return appendChatItem(items, {
        id: `${idPrefix}${event.sequence}`,
        kind: "assistant",
        title: "Agent",
        content: value("content"),
        status: "streaming",
        localTime,
        eventType: event.type,
      })
    }
    case "tool.request":
      return upsert({
        id: `tool:${value("toolCallID")}`,
        kind: "execution",
        title: `工具调用 · ${value("toolName") || value("action") || "unknown"}`,
        content: "Core 正在执行工具",
        detail,
        status: "running",
        localTime,
        eventType: event.type,
      })
    case "tool.result":
      return upsert({
        id: `tool:${value("toolCallID")}`,
        kind: "execution",
        title: `工具结果 · ${value("toolCallID") || "unknown"}`,
        content: value("output") || (data.ok === false ? "工具执行失败" : "工具执行完成"),
        detail,
        status: data.ok === false ? "failed" : "completed",
        localTime,
        eventType: event.type,
      })
    case "permission.requested":
      return upsert({
        id: `permission:${value("requestID")}`,
        kind: "execution",
        title: `权限请求 · ${value("action") || "操作"}`,
        content: value("reason") || "等待权限处理",
        detail,
        status: "waiting",
        localTime,
        eventType: event.type,
      })
    case "question.request":
      return upsert({
        id: `question:${value("requestID")}`,
        kind: "execution",
        title: "补充信息 · 等待回答",
        content: "Core 正在等待你的补充信息",
        detail,
        status: "waiting",
        localTime,
        eventType: event.type,
      })
    case "question.result":
      return updateChatItem(items, `question:${value("requestID")}`, {
        title: "补充信息 · 已提交",
        content: "补充信息已提交，运行继续",
        status: "completed",
        localTime,
      })
    case "question.cancelled":
      return updateChatItem(items, `question:${value("requestID")}`, {
        title: "补充信息 · 已取消",
        content: "补充信息已取消",
        status: "cancelled",
        localTime,
      })
    case "context.compaction.started":
    case "context.compaction.completed":
    case "context.compaction.failed":
      return upsert({
        id: `context:${event.runID}`,
        kind: "execution",
        title: "上下文压缩",
        content:
          value("message") ||
          `上下文压缩${event.type.endsWith("started") ? "进行中" : event.type.endsWith("failed") ? "失败" : "完成"}`,
        detail,
        status: event.type.endsWith("started") ? "running" : event.type.endsWith("failed") ? "failed" : "completed",
        localTime,
        eventType: event.type,
      })
    case "context.project.loaded":
      return appendChatItem(items, {
        id: `context-source:${event.sequence}`,
        kind: "execution",
        title: "项目上下文 · 已加载",
        content: "Core 已加载项目指令和上下文来源",
        detail,
        status: "completed",
        localTime,
        eventType: event.type,
      })
    case "skill.activated":
      return upsert({
        id: `skill:${value("skillID")}`,
        kind: "execution",
        title: `Skill · ${value("name") || value("skillID") || "已激活"}`,
        content: "Skill 已进入模型上下文",
        detail,
        status: "completed",
        localTime,
        eventType: event.type,
      })
    case "skill.failed":
      return upsert({
        id: `skill:${value("skillID")}`,
        kind: "execution",
        title: `Skill · ${value("skillID") || "激活失败"}`,
        content: value("code") || "Skill 激活失败",
        detail,
        status: "failed",
        localTime,
        eventType: event.type,
      })
    case "session.completed":
      return appendChatItem(
        items.map((item) =>
          item.id.startsWith(`assistant:${event.runID}:`) ? { ...item, status: "completed" } : item,
        ),
        {
          id: `session:${event.runID}:completed`,
          kind: "status",
          title: "运行完成",
          content: "本轮 Coding 任务已完成",
          status: "completed",
          localTime,
          eventType: event.type,
        },
      )
    case "session.failed":
      return appendChatItem(items, {
        id: `session:${event.runID}:failed`,
        kind: "status",
        title: "运行失败",
        content: value("message") || "Core 返回运行失败",
        status: "failed",
        localTime,
        eventType: event.type,
      })
    case "session.cancelled":
      return appendChatItem(items, {
        id: `session:${event.runID}:cancelled`,
        kind: "status",
        title: "运行已取消",
        content: "本轮运行已停止，可以继续输入新的 Prompt",
        status: "cancelled",
        localTime,
        eventType: event.type,
      })
    default:
      return items
  }
}

/**
 * 根据能力卡片当前值计算状态色，让一眼可扫的正异常状态有区分。
 * @param value 卡片显示值
 * @returns 状态修饰类名
 */
function capabilityStateClass(value: string): string {
  if (value.includes("待处理") || value.includes("个问题") || value === "compressing") return "is-attention"
  if (value === "fail" || value === "failed") return "is-danger"
  if (value === "待探测" || value === "idle" || value === "空闲" || value === "未激活") return "is-idle"
  return "is-good"
}

/**
 * 将聊天状态转换为中文状态标签。
 * @param status 内部聊天状态
 * @returns 页面显示文案
 */
function chatStatusLabel(status: ChatStatus): string {
  return {
    streaming: "流式输出",
    running: "执行中",
    waiting: "等待处理",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  }[status]
}

/**
 * 从 Prompt 中提取去重后的 Skill ID。
 * @param text - Prompt 文本
 * @returns mention 中的 Skill ID
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function skillIDsFromText(text: string): string[] {
  return [...text.matchAll(/@([a-z0-9]+(?:-[a-z0-9]+)*)/gi)].map((match) => match[1]!).filter(uniqueValue)
}

/**
 * 从 Skill 事件安全提取 Skill ID。
 * @param data - 事件数据
 * @returns Skill ID 或 undefined
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function skillIDFromEvent(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined
  const value = (data as { skillID?: unknown }).skillID
  return typeof value === "string" ? value : undefined
}

/**
 * 判断字符串是否为数组中的首次出现。
 * @param value - 当前值
 * @param index - 当前下标
 * @param values - 全部值
 * @returns 是否保留当前值
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function uniqueValue(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index
}

export default App

const root = document.getElementById("root")
if (!root) throw new Error("Headless UI root element is missing")
render(() => <App />, root)
