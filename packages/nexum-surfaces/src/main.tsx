import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { Nexum } from "@nexum/client"
import { ChatSurface } from "@nexum/chat-surface"
import { Drawer } from "./drawer"
import { ConfirmDialog } from "./confirm-dialog"
import { Popover } from "@kobalte/core/popover"
import { mergeSessionSnapshot, mergeSessionStatus } from "./session-state"
import { mergeMcpServers, mcpStatusLabel } from "./mcp-state"
import type {
  NexumMcpServer,
  NexumAgentMode,
  NexumModelProbe,
  NexumRolePrompt,
  NexumSession,
  NexumSkill,
} from "@nexum/client"

type SessionSummary = NexumSession
type ModelProbeResult = NexumModelProbe
type SkillSummary = NexumSkill
type PermissionPolicyEffect = "allow" | "ask" | "deny"
type PermissionPolicyScope = "global" | "session"
type PermissionPolicyRule = {
  id: string
  action: string
  resource: string
  effect: PermissionPolicyEffect
  scope: PermissionPolicyScope
  sessionID?: string
  createdAt: string
  updatedAt: string
}
type PermissionMode = "ask" | "balanced" | "full"
/** 智能审批模式下仍要逐次询问的风险命令模式。 */
const dangerousAskResources: readonly string[] = ["rm *", "sudo *", "mv *", "dd *", "chmod *", "chown *"]
const permissionModeOptions: ReadonlyArray<{
  value: PermissionMode
  icon: string
  label: string
  description: string
}> = [
  { value: "ask", icon: "✋", label: "每次询问", description: "所有工具调用都逐次请求批准" },
  { value: "balanced", icon: "🛡", label: "智能审批", description: "常规操作直接执行，仅风险操作请求批准" },
  { value: "full", icon: "⚡", label: "完全访问", description: "不再弹审批，危险操作仍由 Core 拦截询问" },
]
type ModelField = "baseUrl" | "model" | "credential"
type ModelFieldErrors = Partial<Record<ModelField, string>>
type ActionState = "idle" | "pending" | "success" | "error"

/** 策略不再有 Action 维度：新建规则以 `*` 表示按资源匹配所有工具调用。 */
const anyToolAction = "*"

export type NexumSurfacesProps = {
  /** 宿主注入的 Nexum Server API 基地址；未提供时使用构建配置或当前页面默认地址。 */
  readonly apiBaseUrl?: string
}

export function NexumSurfaces(props: NexumSurfacesProps = {}) {
  const apiBaseUrl = props.apiBaseUrl ?? defaultApiBaseUrl()
  const client = Nexum.make({ baseUrl: apiBaseUrl })
  const [baseUrl, setBaseUrl] = createSignal("")
  const [model, setModel] = createSignal("")
  const [credentialRef, setCredentialRef] = createSignal("")
  const [credential, setCredential] = createSignal("")
  const [sessionCreateName, setSessionCreateName] = createSignal("")
  const [sessionCreateMode, setSessionCreateMode] = createSignal<NexumAgentMode>("build")
  const [directory, setDirectory] = createSignal("")
  const [sessionID, setSessionID] = createSignal("")
  const [sessions, setSessions] = createSignal<SessionSummary[]>([])
  const [modelSaveBusy, setModelSaveBusy] = createSignal(false)
  const [sessionBusy, setSessionBusy] = createSignal(false)
  const [agentModeBusy, setAgentModeBusy] = createSignal(false)
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
  const [rolePromptDrawerOpen, setRolePromptDrawerOpen] = createSignal(false)
  const [sessionEditName, setSessionEditName] = createSignal("")
  const [skillsDrawerOpen, setSkillsDrawerOpen] = createSignal(false)
  const [skills, setSkills] = createSignal<SkillSummary[]>([])
  const [skillLoading, setSkillLoading] = createSignal(false)
  const [skillError, setSkillError] = createSignal("")
  const [skillBusy, setSkillBusy] = createSignal(false)
  const [skillAddress, setSkillAddress] = createSignal("")
  const [skillRegisterState, setSkillRegisterState] = createSignal<ActionState>("idle")
  const [skillRegisterMessage, setSkillRegisterMessage] = createSignal("")
  const [skillValidation, setSkillValidation] = createSignal<Record<string, string>>({})
  const [skillDetailID, setSkillDetailID] = createSignal("")
  const [skillDetail, setSkillDetail] = createSignal<SkillSummary | undefined>()
  const [skillDetailBusy, setSkillDetailBusy] = createSignal(false)
  const [skillDetailError, setSkillDetailError] = createSignal("")
  const [skillUnregisterID, setSkillUnregisterID] = createSignal("")
  const [skillUnregisterBusy, setSkillUnregisterBusy] = createSignal(false)
  const [skillUnregisterConfirmOpen, setSkillUnregisterConfirmOpen] = createSignal(false)
  const [skillRemoveID, setSkillRemoveID] = createSignal("")
  const [skillRemoveBusy, setSkillRemoveBusy] = createSignal(false)
  const [skillRemoveConfirmOpen, setSkillRemoveConfirmOpen] = createSignal(false)
  const [mcpServers, setMcpServers] = createSignal<NexumMcpServer[]>([])
  const [mcpLoading, setMcpLoading] = createSignal(false)
  const [mcpError, setMcpError] = createSignal("")
  const [mcpActionID, setMcpActionID] = createSignal("")
  const [rolePrompt, setRolePrompt] = createSignal<NexumRolePrompt | undefined>()
  const [rolePromptDraft, setRolePromptDraft] = createSignal("")
  const [rolePromptDirty, setRolePromptDirty] = createSignal(false)
  const [rolePromptBusy, setRolePromptBusy] = createSignal(false)
  const [rolePromptState, setRolePromptState] = createSignal<ActionState>("idle")
  const [rolePromptMessage, setRolePromptMessage] = createSignal("")
  const [policyPopoverOpen, setPolicyPopoverOpen] = createSignal(false)
  const [policyAnchorEl, setPolicyAnchorEl] = createSignal<HTMLElement>()
  const [policyRules, setPolicyRules] = createSignal<PermissionPolicyRule[]>([])
  const [policyBusy, setPolicyBusy] = createSignal(false)
  const [policyError, setPolicyError] = createSignal("")
  const [notice, setNotice] = createSignal("准备开始一次 Nexum 运行")
  const [darkMode, setDarkMode] = createSignal(window.matchMedia("(prefers-color-scheme: dark)").matches)
  const [modelConfigured, setModelConfigured] = createSignal(false)
  // Core 已保存的模型名：与表单草稿解耦，编辑抽屉里的草稿不影响输入栏的禁用与模型展示。
  const [savedModel, setSavedModel] = createSignal("")
  const [renameBusy, setRenameBusy] = createSignal(false)
  const [deleteBusy, setDeleteBusy] = createSignal(false)
  const [deleteState, setDeleteState] = createSignal<ActionState>("idle")
  const [deleteMessage, setDeleteMessage] = createSignal("")
  const [deleteConfirmOpen, setDeleteConfirmOpen] = createSignal(false)
  let sessionSelectSequence = 0
  let skillLoadSequence = 0
  let skillReloadQueued = false
  let mcpPollingActive = false
  let mcpRefreshTimer: ReturnType<typeof setTimeout> | undefined

  // 主题跟随系统：写入 html[data-theme] 供宿主暗色覆盖层使用，并同步给 ChatSurface。
  createEffect(() => {
    document.documentElement.dataset.theme = darkMode() ? "dark" : "light"
  })

  onMount(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleThemeChange = (event: MediaQueryListEvent) => setDarkMode(event.matches)
    media.addEventListener("change", handleThemeChange)
    onCleanup(() => media.removeEventListener("change", handleThemeChange))
  })

  onMount(async () => {
    const active = await client.experimental.nexum.model.get().catch(() => undefined)
    if (active?.data) {
      setBaseUrl(active.data.baseUrl)
      setModel(active.data.model)
      setCredentialRef(active.data.credentialRef ?? "")
      setModelConfigured(true)
      setSavedModel(active.data.model)
      setNotice(active.data.credentialConfigured ? "模型配置已加载" : "模型服务地址已加载")
    }
    await Promise.all([restoreSession().catch(() => undefined), loadSkills(), loadRolePrompt()])
    if (!active) setNotice("Nexum API 尚未连接")
  })

  onMount(() => {
    mcpPollingActive = true
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (mcpRefreshTimer) clearTimeout(mcpRefreshTimer)
        mcpRefreshTimer = undefined
        return
      }
      void refreshMcpServers()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    void refreshMcpServers()
    onCleanup(() => {
      mcpPollingActive = false
      if (mcpRefreshTimer) clearTimeout(mcpRefreshTimer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    })
  })


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
   * 保存当前模型配置到 Nexum Core。
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
    const saved = await client.experimental.nexum.model.update({
      baseUrl: baseUrl().trim(),
      model: model().trim(),
      credential: credential().trim() || undefined,
      credentialRef: credentialRef().trim() || undefined,
    })
    setCredential("")
    setModelConfigured(true)
    setSavedModel(saved.data.model)
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
      const result = await client.experimental.nexum.model.probe({ mode: "both" })
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
    const savedID = sessionStorage.getItem("nexum.sessionID")
    const available = (await client.experimental.nexum.session.list()).data
      setSessions([...available])
    const saved = savedID ? available.find((item) => item.id === savedID) : undefined
    const initial = saved ?? available[0]
    if (!initial) {
      if (savedID) sessionStorage.removeItem("nexum.sessionID")
      return
    }
    await selectSession(initial, false)
    setNotice(saved ? `已恢复 Session：${saved.name}` : `已选择最近的 Session：${initial.name}`)
  }

  async function refreshRuntime() {
    if (refreshBusy()) return
    setRefreshBusy(true)
    try {
      const available = (await client.experimental.nexum.session.list()).data
      setSessions([...available])
      const current = available.find((item) => item.id === sessionID())
      if (current) {
        const snapshot = await client.experimental.nexum.session.state({ sessionID: current.id })
        setSessions((items) => mergeSessionSnapshot(items, snapshot.data.session))
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
    const loadSequence = ++skillLoadSequence
    setSkillLoading(true)
    setSkillError("")
    try {
      const nextSkills = [...(await client.experimental.nexum.skill.list()).data]
      if (loadSequence === skillLoadSequence) setSkills(nextSkills)
    } catch (error) {
      if (loadSequence === skillLoadSequence) {
        const message = messageFrom(error, "Skill 目录暂时不可用")
        setSkillError(message)
        setNotice(message)
      }
    } finally {
      if (loadSequence === skillLoadSequence) setSkillLoading(false)
    }
  }

  /**
   * 合并 Skill registry 事件触发的刷新，避免同一批事件重复发起请求。
   */
  function scheduleSkillReload() {
    if (skillReloadQueued) return
    skillReloadQueued = true
    queueMicrotask(() => {
      skillReloadQueued = false
      void loadSkills()
    })
  }

  async function loadMcpServers() {
    if (mcpLoading()) return
    setMcpLoading(true)
    try {
      const result = await client.experimental.nexum.mcp.list()
      setMcpServers((current) => mergeMcpServers(current, result.data))
      setMcpError("")
    } catch (error) {
      setMcpError(messageFrom(error, "MCP 状态暂时不可用"))
    } finally {
      setMcpLoading(false)
    }
  }

  async function refreshMcpServers() {
    await loadMcpServers()
    if (mcpPollingActive && mcpServers().some((server) => server.status === "pending" || server.status === "retrying")) {
      scheduleMcpRefresh()
    }
  }

  function scheduleMcpRefresh() {
    if (!mcpPollingActive || document.visibilityState === "hidden") return
    if (mcpRefreshTimer) clearTimeout(mcpRefreshTimer)
    mcpRefreshTimer = setTimeout(() => void refreshMcpServers(), 1000)
  }

  async function retryMcp(serverID: string) {
    if (mcpActionID()) return
    setMcpActionID(serverID)
    try {
      const result = await client.experimental.nexum.mcp.connect({ id: serverID })
      setMcpServers((current) => mergeMcpServers(current, [result.data]))
      setMcpError("")
      setNotice(`MCP ${serverID} 已重新发起连接`)
      if (result.data.status === "pending" || result.data.status === "retrying") scheduleMcpRefresh()
    } catch (error) {
      const message = messageFrom(error, "MCP 重试失败，请稍后再试")
      setMcpError(message)
      setNotice(message)
    } finally {
      setMcpActionID("")
    }
  }

  async function authorizeMcp(serverID: string) {
    if (mcpActionID()) return
    setMcpActionID(serverID)
    try {
      const attempt = await client.experimental.nexum.mcp.authorize({ id: serverID })
      if (attempt.data.authorizationUrl) window.open(attempt.data.authorizationUrl, "_blank", "noopener,noreferrer")
      setNotice(`MCP ${serverID} 等待 OAuth 授权`)
      await loadMcpServers()
    } catch (error) {
      const message = messageFrom(error, "MCP 授权失败，请稍后再试")
      setMcpError(message)
      setNotice(message)
    } finally {
      setMcpActionID("")
    }
  }

  async function loadRolePrompt() {
    try {
      const current = await client.experimental.nexum.rolePrompt.get()
      setRolePrompt(current.data)
      if (!rolePromptDirty()) setRolePromptDraft(current.data.prompt)
    } catch (error) {
      setRolePromptMessage(messageFrom(error, "默认角色提示词暂时不可用"))
      setRolePromptState("error")
    }
  }

  async function registerSkill() {
    if (skillBusy() || !skillAddress().trim()) {
      if (!skillAddress().trim()) {
        setSkillRegisterState("error")
        setSkillRegisterMessage("请输入 Skill 目录地址")
      }
      return
    }
    setSkillBusy(true)
    setSkillRegisterState("pending")
    setSkillRegisterMessage("正在注册 Skill…")
    try {
      const registered = await client.experimental.nexum.skill.register({ address: skillAddress().trim() })
      setSkills((current) => {
        const withoutSameID = current.filter((skill) => skill.id !== registered.data.id)
        return [...withoutSameID, registered.data]
      })
      setSkillAddress("")
      setSkillError("")
      setSkillRegisterState("success")
      setSkillRegisterMessage(`已注册 ${registered.data.id}，状态：${registered.data.status}`)
      setNotice(`Skill ${registered.data.id} 已注册`)
    } catch (error) {
      const message = messageFrom(error, "Skill 注册失败，请检查目录地址")
      setSkillRegisterState("error")
      setSkillRegisterMessage(message)
      setNotice(message)
    } finally {
      setSkillBusy(false)
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
      setSkills([...(await client.experimental.nexum.skill.refresh()).data])
      setSkillValidation({})
      setSkillError("")
      setNotice("Skill 目录已刷新")
    } catch (error) {
      const message = messageFrom(error, "Skill 刷新失败，请稍后重试")
      setSkillError(message)
      setNotice(message)
    } finally {
      setSkillBusy(false)
    }
  }

  async function showSkillDetail(skillID: string) {
    if (skillDetailID() === skillID) {
      setSkillDetailID("")
      setSkillDetail(undefined)
      setSkillDetailError("")
      return
    }
    setSkillDetailID(skillID)
    setSkillDetail(undefined)
    setSkillDetailError("")
    setSkillDetailBusy(true)
    try {
      setSkillDetail((await client.experimental.nexum.skill.detail({ id: skillID })).data)
    } catch (error) {
      setSkillDetailError(messageFrom(error, "Skill 详情暂时不可用"))
    } finally {
      setSkillDetailBusy(false)
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
      const result = await client.experimental.nexum.skill.validate({ id: skillID })
      const skill = result.data.data.find((item) => item.id === skillID)
      if (skill) setSkills((current) => current.map((item) => (item.id === skillID ? skill : item)))
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

  function requestUnregisterSkill(skillID: string) {
    if (skillBusy() || skillUnregisterBusy()) return
    setSkillUnregisterID(skillID)
    setSkillUnregisterConfirmOpen(true)
  }

  /**
   * 打开内置 Skill 源目录删除确认框。
   *
   * @param skillID - Skill ID
   * @author lvdaxianer@yeah.net
   * @date 2026-11-28
   */
  function requestRemoveSkill(skillID: string) {
    if (skillBusy() || skillUnregisterBusy() || skillRemoveBusy()) return
    setSkillRemoveID(skillID)
    setSkillRemoveConfirmOpen(true)
  }

  async function confirmUnregisterSkill() {
    const skillID = skillUnregisterID()
    if (!skillID || skillUnregisterBusy()) return
    setSkillUnregisterBusy(true)
    try {
      await client.experimental.nexum.skill.unregister({ id: skillID })
      setSkills((current) => current.filter((skill) => skill.id !== skillID))
      setSkillValidation((current) => {
        const next = { ...current }
        delete next[skillID]
        return next
      })
      setSkillUnregisterConfirmOpen(false)
      setNotice(`Skill ${skillID} 已取消注册，源目录未删除`)
    } catch (error) {
      const message = messageFrom(error, "Skill 取消注册失败，请重试")
      setNotice(message)
    } finally {
      setSkillUnregisterBusy(false)
    }
  }

  /**
   * 执行内置 Skill 源目录删除并在成功后更新列表。
   *
   * @author lvdaxianer@yeah.net
   * @date 2026-11-28
   */
  async function confirmRemoveSkill() {
    const skillID = skillRemoveID()
    if (!skillID || skillRemoveBusy()) return
    setSkillRemoveBusy(true)
    try {
      await client.experimental.nexum.skill.remove({ id: skillID })
      setSkills((current) => current.filter((skill) => skill.id !== skillID))
      setSkillValidation((current) => {
        const next = { ...current }
        delete next[skillID]
        return next
      })
      setSkillRemoveConfirmOpen(false)
      setNotice(`内置 Skill ${skillID} 已删除，源目录已移除`)
    } catch (error) {
      setNotice(messageFrom(error, "内置 Skill 删除失败，请重试"))
    } finally {
      setSkillRemoveBusy(false)
    }
  }

  async function saveRolePrompt() {
    if (rolePromptBusy()) return
    if (!rolePromptDraft().trim()) {
      setRolePromptState("error")
      setRolePromptMessage("默认角色提示词不能为空")
      return
    }
    setRolePromptBusy(true)
    setRolePromptState("pending")
    setRolePromptMessage("正在保存默认角色提示词…")
    try {
      const saved = await client.experimental.nexum.rolePrompt.update({ prompt: rolePromptDraft() })
      setRolePrompt(saved.data)
      setRolePromptDraft(saved.data.prompt)
      setRolePromptDirty(false)
      setRolePromptState("success")
      setRolePromptMessage("默认角色提示词已保存；下一次模型调用会使用最新内容")
      setNotice("默认角色提示词已保存")
    } catch (error) {
      const message = messageFrom(error, "默认角色提示词保存失败，请重试")
      setRolePromptState("error")
      setRolePromptMessage(message)
      setNotice(message)
    } finally {
      setRolePromptBusy(false)
    }
  }

  async function resetRolePrompt() {
    if (rolePromptBusy()) return
    setRolePromptBusy(true)
    setRolePromptState("pending")
    setRolePromptMessage("正在恢复内置默认…")
    try {
      const reset = await client.experimental.nexum.rolePrompt.reset()
      setRolePrompt(reset.data)
      setRolePromptDraft(reset.data.prompt)
      setRolePromptDirty(false)
      setRolePromptState("success")
      setRolePromptMessage("已恢复内置默认角色提示词")
      setNotice("默认角色提示词已恢复")
    } catch (error) {
      const message = messageFrom(error, "默认角色提示词恢复失败，请重试")
      setRolePromptState("error")
      setRolePromptMessage(message)
      setNotice(message)
    } finally {
      setRolePromptBusy(false)
    }
  }

  /**
   * 打开权限模式浮层，并刷新当前策略规则。
   */
  function openPolicyPopover() {
    setPolicyPopoverOpen(true)
    setPolicyError("")
    void loadPermissionPolicy()
  }

  /**
   * 读取全局策略与当前 Session 的覆盖策略。
   * @author lvdaxianer@yeah.net
   * @date 2026-11-22
   */
  async function loadPermissionPolicy() {
    const query = sessionID() ? `?sessionID=${encodeURIComponent(sessionID())}` : ""
    try {
      const data = await requestPermissionPolicy<{ rules: PermissionPolicyRule[] }>(
        apiBaseUrl,
        `/api/nexum/permission/policy${query}`,
      )
      setPolicyRules(data.rules)
      setPolicyError("")
    } catch (error) {
      setPolicyRules([])
      setPolicyError(messageFrom(error, "权限策略加载失败，请检查 Nexum Service"))
    }
  }

  /** 从全局规则推导当前权限模式：allow `*` 之外带 ask 规则为智能，仅 allow `*` 为完全访问，其余回落到每次询问。 */
  function currentPermissionMode(): PermissionMode {
    const global = policyRules().filter((rule) => rule.scope === "global")
    if (!global.some((rule) => rule.resource === anyToolAction && rule.effect === "allow")) return "ask"
    return global.some((rule) => rule.effect === "ask") ? "balanced" : "full"
  }

  /** 不属于当前模式形状的全局放行规则数量，来自逐次审批的「始终允许」。 */
  function extraPermissionGrantCount(): number {
    const mode = currentPermissionMode()
    return policyRules().filter((rule) => {
      if (rule.scope !== "global") return false
      if (rule.resource === anyToolAction && rule.effect === "allow") return false
      return !(mode === "balanced" && rule.effect === "ask" && dangerousAskResources.includes(rule.resource))
    }).length
  }

  /** 当前权限模式对应的展示选项（图标 + 标签），供聊天输入栏的权限入口使用。 */
  function permissionModeOption() {
    return permissionModeOptions.find((option) => option.value === currentPermissionMode())
  }

  /** 切换权限模式：重置全局规则后按模式写入对应规则。 */
  async function applyPermissionMode(mode: PermissionMode) {
    if (policyBusy() || mode === currentPermissionMode()) return
    setPolicyBusy(true)
    setPolicyError("")
    try {
      const global = policyRules().filter((rule) => rule.scope === "global")
      await Promise.all(global.map((rule) => requestPermissionPolicy<{ id: string; deleted: boolean }>(
        apiBaseUrl,
        `/api/nexum/permission/policy/${encodeURIComponent(rule.id)}`,
        { method: "DELETE" },
      )))
      if (mode !== "ask") await createPermissionPolicyRule(anyToolAction, "allow")
      if (mode === "balanced") await Promise.all(dangerousAskResources.map((resource) => createPermissionPolicyRule(resource, "ask")))
      await loadPermissionPolicy()
      setNotice(`权限模式已切换：${permissionModeOptions.find((option) => option.value === mode)?.label ?? mode}`)
      setPolicyPopoverOpen(false)
    } catch (error) {
      setPolicyError(messageFrom(error, "权限模式保存失败"))
      await loadPermissionPolicy().catch(() => undefined)
    } finally {
      setPolicyBusy(false)
    }
  }

  /** 新建一条全局权限规则。 */
  async function createPermissionPolicyRule(resource: string, effect: PermissionPolicyEffect) {
    await requestPermissionPolicy<PermissionPolicyRule>(apiBaseUrl, "/api/nexum/permission/policy", {
      method: "POST",
      body: JSON.stringify({ action: anyToolAction, resource, effect, scope: "global" }),
    })
  }

  async function selectSession(session: SessionSummary, announce = true) {
    const sequence = ++sessionSelectSequence
    const snapshot = await client.experimental.nexum.session.state({ sessionID: session.id })
    if (sequence !== sessionSelectSequence) return
    setDeleteState("idle")
    setDeleteMessage("")
    setSessions((current) => mergeSessionSnapshot(current, snapshot.data.session))
    setSessionID(session.id)
    setDirectory(snapshot.data.session.directory)
    sessionStorage.setItem("nexum.sessionID", session.id)
    if (announce) setNotice(`已选择 Session：${snapshot.data.session.name}`)
    if (policyPopoverOpen()) void loadPermissionPolicy()
  }

  function currentSession(): SessionSummary | undefined {
    return sessions().find((session) => session.id === sessionID())
  }

  function currentAgentMode(): NexumAgentMode {
    return currentSession()?.mode ?? "build"
  }

  /**
   * 将 Agent 模式转换为页面可扫描的标签。
   *
   * @param mode - 当前 Agent 模式
   * @returns 页面展示标签
   * @author lvdaxianer@yeah.net
   * @date 2026-11-27
   */
  function agentModeLabel(mode: NexumAgentMode): string {
    return mode === "plan" ? "PLAN" : "BUILD"
  }

  /**
   * 组合 ChatSurface 标题和当前 Agent 模式。
   *
   * @returns 当前 Session 标题；没有选中 Session 时返回空字符串
   * @author lvdaxianer@yeah.net
   * @date 2026-11-27
   */
  function currentSessionTitle(): string {
    const current = currentSession()
    return current ? `${current.name} · ${agentModeLabel(current.mode)}` : ""
  }

  async function setAgentMode(mode: NexumAgentMode) {
    const current = currentSession()
    if (!current || agentModeBusy() || current.status === "running" || currentAgentMode() === mode) return
    setAgentModeBusy(true)
    try {
      const updated = await client.experimental.nexum.session.setMode({ sessionID: current.id, mode })
      setSessions((items) => mergeSessionSnapshot(items, updated.data))
      setNotice(`Agent 模式已切换为 ${mode === "plan" ? "Plan" : "Build"}`)
    } catch (error) {
      setNotice(messageFrom(error, "Agent 模式切换失败，请稍后重试"))
    } finally {
      setAgentModeBusy(false)
    }
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
      const created = await client.experimental.nexum.session.create({
        directory: directory().trim(),
        mode: sessionCreateMode(),
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
    ++sessionSelectSequence
    setSessionID(created.id)
    setDirectory(created.directory)
    sessionStorage.setItem("nexum.sessionID", created.id)
    setSessions((current) => [...current.filter((item) => item.id !== created.id), created])
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
    setSessionCreateMode("build")
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
      const updated = await client.experimental.nexum.session.update({ sessionID: sessionID(), name })
      setSessions((current) => current.map((session) => (session.id === updated.data.id ? updated.data : session)))
      setSessionEditDrawerOpen(false)
      setSessionNameError("")
      setNotice(`Session 已重命名为「${updated.data.name}」`)
    } catch (error) {
      setSessionNameError(messageFrom(error, "Session 名称更新失败，请重试"))
    } finally {
      setRenameBusy(false)
    }
  }

  function requestDeleteSession() {
    if (!sessionID() || deleteBusy()) return
    setDeleteState("idle")
    setDeleteMessage("")
    setDeleteConfirmOpen(true)
  }

  async function confirmDeleteSession() {
    const deletingID = sessionID()
    if (!deletingID || deleteBusy()) return
    setDeleteBusy(true)
    setDeleteState("pending")
    setDeleteMessage("正在删除 Session…")
    try {
      await client.experimental.nexum.session.delete({ sessionID: deletingID })
    } catch (error) {
      const message = messageFrom(error, "Session 删除失败，请重试")
      setDeleteState("error")
      setDeleteMessage(message)
      setNotice(message)
      setDeleteConfirmOpen(false)
      setDeleteBusy(false)
      return
    }

    const currentSessions = sessions()
    const deletingIndex = currentSessions.findIndex((session) => session.id === deletingID)
    const remaining = currentSessions.filter((session) => session.id !== deletingID)
    setSessions(remaining)
    setSessionEditDrawerOpen(false)
    setDeleteConfirmOpen(false)
    sessionStorage.removeItem("nexum.sessionID")

    const nextSession = remaining[deletingIndex] ?? remaining[deletingIndex - 1] ?? remaining[0]
    if (nextSession) {
      await selectSession(nextSession, false).catch(clearSelectedSession)
    } else {
      clearSelectedSession()
    }
    setNotice("Session 已删除")
    setDeleteBusy(false)
  }

  function clearSelectedSession() {
    setSessionID("")
    setDirectory("")
    setDeleteState("idle")
    setDeleteMessage("")
    sessionStorage.removeItem("nexum.sessionID")
  }

  /**
   * 输入栏控制组只创建一次，内部信号以细粒度 effect 原地更新。
   *
   * 若直接写在 composerExtras 的 getter 里，ChatSurface 每次求值都会重建整棵
   * DOM（模式徽章、Plan/Build、权限 chip），切换 Agent 模式时会明显闪烁。
   */
  const composerControls = (
    <div class="composer-control-group" role="group" aria-label="Agent 模式和权限设置">
      <span class={`agent-mode-current agent-mode-current-${currentAgentMode()}`} aria-label={`当前 Agent 模式：${agentModeLabel(currentAgentMode())}`}>
        {agentModeLabel(currentAgentMode())}
      </span>
      <div class="agent-mode-toggle" classList={{ "is-switching": agentModeBusy() }} role="group" aria-label="Agent 模式" aria-busy={agentModeBusy()}>
        <button
          type="button"
          class="agent-mode-button"
          classList={{ "is-active": currentAgentMode() === "plan" }}
          aria-pressed={currentAgentMode() === "plan"}
          title="Plan：只读取项目或写入 .nexum/plans/ 计划文件"
          disabled={!currentSession() || currentSession()?.status === "running"}
          onClick={() => void setAgentMode("plan")}
        >
          Plan
        </button>
        <button
          type="button"
          class="agent-mode-button"
          classList={{ "is-active": currentAgentMode() === "build" }}
          aria-pressed={currentAgentMode() === "build"}
          title="Build：允许按权限策略执行完整任务"
          disabled={!currentSession() || currentSession()?.status === "running"}
          onClick={() => void setAgentMode("build")}
        >
          Build
        </button>
      </div>
      <button ref={setPolicyAnchorEl} type="button" class="perm-chip" title="权限设置" onClick={openPolicyPopover}>
        <span aria-hidden="true">{permissionModeOption()?.icon ?? "🛡"}</span>
        <span class="perm-chip-label extras-label">{permissionModeOption()?.label ?? "权限策略"}</span>
      </button>
    </div>
  )

  return (
    <Popover
      open={policyPopoverOpen()}
      onOpenChange={(open) => (open ? openPolicyPopover() : setPolicyPopoverOpen(false))}
      anchorRef={policyAnchorEl}
      placement="top-end"
      gutter={8}
    >
      <main class="app-shell">
        <Popover.Portal>
          <Popover.Content class="policy-popover">
            <div class="policy-pop-head">
              <strong>应如何批准 Agent 操作？</strong>
              <Popover.CloseButton class="drawer-close policy-pop-close" aria-label="关闭权限策略">
                ✕
              </Popover.CloseButton>
            </div>
            <div class="policy-mode-list" role="radiogroup" aria-label="权限模式">
              <For each={permissionModeOptions}>
                {(option) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={currentPermissionMode() === option.value}
                    class="policy-mode-option"
                    classList={{ "is-active": currentPermissionMode() === option.value }}
                    disabled={policyBusy()}
                    onClick={() => void applyPermissionMode(option.value)}
                  >
                    <span class="policy-mode-icon" aria-hidden="true">
                      {option.icon}
                    </span>
                    <span class="policy-mode-copy">
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                    <Show when={currentPermissionMode() === option.value}>
                      <span class="policy-mode-check" aria-hidden="true">
                        ✓
                      </span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
            <Show when={extraPermissionGrantCount() > 0}>
              <p class="policy-pop-extra">另有 {extraPermissionGrantCount()} 条来自逐次审批「始终允许」的具体放行规则。</p>
            </Show>
            <Show when={policyError()}>
              <p class="field-error" role="alert">
                {policyError()}
              </p>
            </Show>
          </Popover.Content>
        </Popover.Portal>
      <aside class="app-sidebar">
        <div class="sidebar-brand">
          <span class="brand-mark">H</span>
          <div>
            <p class="eyebrow">NEXUM / RUNTIME</p>
            <strong>内部演示工作台</strong>
          </div>
        </div>

        <div class="sidebar-meta">
          <span class="model-chip">{model() ? `全局模型 · ${model()}` : "未配置全局模型"}</span>
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
              <span>
                Session 名称 <span class="label-note">可选</span>
              </span>
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
                <span class="field-error" role="alert">
                  {sessionNameError()}
                </span>
              </Show>
            </label>
            <fieldset class="form-field session-mode-field">
              <legend>Agent 模式</legend>
              <div class="session-mode-options" role="radiogroup" aria-label="新建 Session 的 Agent 模式">
                <label class="session-mode-option" classList={{ "is-selected": sessionCreateMode() === "plan" }}>
                  <input
                    type="radio"
                    name="session-create-mode"
                    value="plan"
                    aria-label="Plan 模式"
                    checked={sessionCreateMode() === "plan"}
                    onChange={() => setSessionCreateMode("plan")}
                  />
                  <span>
                    <strong>Plan</strong>
                    <small>分析、读取并维护计划文件</small>
                  </span>
                </label>
                <label class="session-mode-option" classList={{ "is-selected": sessionCreateMode() === "build" }}>
                  <input
                    type="radio"
                    name="session-create-mode"
                    value="build"
                    aria-label="Build 模式"
                    checked={sessionCreateMode() === "build"}
                    onChange={() => setSessionCreateMode("build")}
                  />
                  <span>
                    <strong>Build</strong>
                    <small>按权限策略执行完整任务</small>
                  </span>
                </label>
              </div>
              <span class="field-help">模式会在创建时写入 Session；运行中不能切换。</span>
            </fieldset>
            <label class={`form-field ${directoryError() ? "field-invalid" : ""}`}>
              <span>
                工作目录 <span class="required-mark">必填</span>
              </span>
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
            onOpenChange={(open) => {
              setSkillsDrawerOpen(open)
              if (open) void loadSkills()
            }}
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
            <Show when={skillLoading()}>
              <p class="loading-copy" role="status" aria-live="polite">
                正在加载 Skills…
              </p>
            </Show>
            <Show when={skillError()}>
              <p class="field-error" role="alert">
                {skillError()}
              </p>
            </Show>
            <div class="skill-register-form">
              <label class="form-field">
                <span>Skill 目录地址 <span class="required-mark">必填</span></span>
                <input
                  aria-label="Skill 目录地址"
                  value={skillAddress()}
                  onInput={(event) => {
                    setSkillAddress(event.currentTarget.value)
                    setSkillRegisterState("idle")
                    setSkillRegisterMessage("")
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void registerSkill()
                  }}
                  placeholder="/Users/…/skills/metric-view-lifecycle"
                />
                <span class="field-help">只填写本地 Skill 目录；注册不会复制、修改或删除源目录。</span>
              </label>
              <button class="button button-primary" disabled={skillBusy()} onClick={() => void registerSkill()}>
                {skillBusy() ? "处理中…" : "注册 Skill"}
              </button>
              <Show when={skillRegisterMessage()}>
                <p class={`form-feedback form-feedback-${skillRegisterState()}`} role="status" aria-live="polite">
                  {skillRegisterMessage()}
                </p>
              </Show>
            </div>
            <div class="skill-list" aria-live="polite">
              <Show when={!skillLoading() && !skillError() && skills().length > 0} fallback={<Show when={!skillLoading() && !skillError()}><p class="empty-copy">暂无已发现的项目 Skill</p></Show>}>
                <For each={skills()}>
                  {(skill) => (
                    <article class={`skill-row skill-row-${skill.status}`}>
                      <div class="skill-row-copy">
                        <div class="skill-row-title">
                          <strong>{skill.id}</strong>
                          <span class="skill-status">{skill.status}</span>
                          <span class="skill-source-kind">
                            {skill.sourceKind === "builtin" ? "内置" : skill.sourceKind === "registered" ? "外部" : "来源未知"}
                          </span>
                        </div>
                        <p>{skill.description || "暂无描述"}</p>
                        <small>
                          {skill.fileCount} 个文件 · {skill.digest.slice(0, 10)}
                        </small>
                      </div>
                      <button class="skill-detail" onClick={() => void showSkillDetail(skill.id)} disabled={skillDetailBusy() && skillDetailID() === skill.id}>
                        {skillDetailBusy() && skillDetailID() === skill.id ? "加载中…" : skillDetailID() === skill.id ? "收起详情" : "详情"}
                      </button>
                      <button class="skill-validate" onClick={() => validateSkill(skill.id)} disabled={skillBusy()}>
                        校验
                      </button>
                      <Show when={skillValidation()[skill.id]}>
                        <span class="skill-validation">{skillValidation()[skill.id]}</span>
                      </Show>
                      <Show
                        when={skill.sourceKind === "builtin"}
                        fallback={
                          <Show
                            when={skill.sourceKind === "registered"}
                            fallback={<span class="skill-source-kind">来源未知，暂不可操作</span>}
                          >
                            <button
                              class="skill-unregister"
                              disabled={skillBusy() || skillUnregisterBusy() || skillRemoveBusy()}
                              onClick={() => requestUnregisterSkill(skill.id)}
                            >
                              取消注册
                            </button>
                          </Show>
                        }
                      >
                        <button
                          class="skill-remove"
                          disabled={skillBusy() || skillUnregisterBusy() || skillRemoveBusy()}
                          onClick={() => requestRemoveSkill(skill.id)}
                        >
                          删除 Skill
                        </button>
                      </Show>
                      <Show when={skillDetailID() === skill.id}>
                        <div class="skill-detail-panel" aria-live="polite">
                          <Show when={skillDetailError()}>
                            <p class="field-error" role="alert">{skillDetailError()}</p>
                          </Show>
                          <Show when={skillDetail()}>
                            {(detail) => (
                              <>
                                <p>{detail().description || "暂无描述"}</p>
                                <small>{detail().files.length} 个文件：{detail().files.join(", ")}</small>
                                <Show when={detail().diagnostics.length > 0}>
                                  <ul>
                                    <For each={detail().diagnostics}>{(diagnostic) => <li>{diagnostic}</li>}</For>
                                  </ul>
                                </Show>
                              </>
                            )}
                          </Show>
                        </div>
                      </Show>
                    </article>
                  )}
                </For>
              </Show>
            </div>
          </Drawer>
          <Drawer
            title="默认角色提示词"
            description="只注入模型上下文，不改写模型的思考或输出。"
            open={rolePromptDrawerOpen()}
            onOpenChange={(open) => {
              setRolePromptDrawerOpen(open)
              if (open) void loadRolePrompt()
            }}
            triggerClass="nav-item"
            trigger={
              <>
                <span>✧</span>角色提示词
                <span class={`nav-badge ${rolePrompt()?.source === "custom" ? "is-ready" : ""}`}>
                  {rolePrompt()?.source === "custom" ? "已配置" : "内置默认"}
                </span>
              </>
            }
          >
            <label class="form-field">
              <span>提示词内容</span>
              <textarea
                aria-label="默认角色提示词"
                value={rolePromptDraft()}
                onInput={(event) => {
                  setRolePromptDraft(event.currentTarget.value)
                  setRolePromptDirty(true)
                  setRolePromptState("idle")
                  setRolePromptMessage("")
                }}
                placeholder="例如：思考和回答都使用中文。"
              />
              <span class="field-help">Nexum 会把这段原文作为 system context 传给模型；不会翻译、过滤或后处理模型响应。</span>
            </label>
            <div class="button-stack">
              <button class="button button-primary" disabled={rolePromptBusy()} onClick={() => void saveRolePrompt()}>
                {rolePromptBusy() ? "保存中…" : "保存角色提示词"}
              </button>
              <button class="button button-secondary" disabled={rolePromptBusy()} onClick={() => void resetRolePrompt()}>
                {rolePromptBusy() ? "处理中…" : "恢复内置默认"}
              </button>
            </div>
            <Show when={rolePromptMessage()}>
              <p class={`form-feedback form-feedback-${rolePromptState()}`} role="status" aria-live="polite">
                {rolePromptMessage()}
              </p>
            </Show>
          </Drawer>
            <Popover.Trigger class="nav-item" aria-label="权限策略">
              <span>⚙</span>权限策略
              <Show when={policyRules().length > 0}>
                <span class="nav-badge">{policyRules().length}</span>
              </Show>
            </Popover.Trigger>
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
            <div class="card-heading-actions">
              <span class="status-badge">{sessions().length} 个</span>
              <Drawer
                title="会话操作"
                description="重命名、恢复当前 Session，或删除不再需要的运行记录。"
                open={sessionEditDrawerOpen()}
                onOpenChange={(open) => (open ? openRenameSession() : setSessionEditDrawerOpen(false))}
                triggerClass="session-ops-button"
                trigger={
                  <>
                    <span aria-hidden="true">⋯</span>
                    <span class="sr-only">会话操作</span>
                  </>
                }
              >
                <label class={`form-field ${sessionNameError() ? "field-invalid" : ""}`}>
                  <span>
                    Session 名称 <span class="required-mark">必填</span>
                  </span>
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
                    <span class="field-error" role="alert">
                      {sessionNameError()}
                    </span>
                  </Show>
                </label>
                <button
                  class="button button-primary"
                  disabled={!sessionID() || renameBusy()}
                  onClick={() => void renameSession()}
                >
                  {renameBusy() ? "保存中…" : "保存名称"}
                </button>
                <div class="drawer-toolbar">
                  <p class="helper-text">Session 状态和聊天事件由 ChatSurface 管理。</p>
                </div>
                <div class="button-stack">
                  <button
                    class="button button-secondary"
                    disabled={!sessionID() || refreshBusy()}
                    onClick={refreshRuntime}
                  >
                    {refreshBusy() ? "刷新中…" : "刷新状态"}
                  </button>
                </div>
                <button
                  class="button button-danger session-delete-button"
                  disabled={!sessionID() || deleteBusy()}
                  onClick={requestDeleteSession}
                >
                  {deleteBusy() ? "删除中…" : "删除 Session"}
                </button>
                <Show when={deleteMessage()}>
                  <p class={`form-feedback form-feedback-${deleteState()}`} role="status" aria-live="polite">
                    {deleteMessage()}
                  </p>
                </Show>
              </Drawer>
            </div>
          </div>
          <Show
            when={sessions().length > 0}
            fallback={<p class="empty-copy session-empty">还没有 Session，点击上方“新建 Session”开始。</p>}
          >
            <div class="session-list" aria-label="可用 Session">
              <For each={sessions()}>
                {(session) => (
                  <button
                    class={`session-item ${session.id === sessionID() ? "is-active" : ""}`}
                    aria-pressed={session.id === sessionID()}
                    title={session.directory}
                    onClick={() => void selectSession(session)}
                  >
                    <span class="session-item-top">
                      <strong class="session-item-name">{session.name}</strong>
                      <span class="session-item-pills">
                        <span class={`session-mode-pill session-mode-${session.mode}`}>{agentModeLabel(session.mode)}</span>
                        <span class={`session-status-pill session-status-${session.status}`}>{session.status}</span>
                      </span>
                    </span>
                    <small class="session-item-directory">{session.directory}</small>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </section>

        <section class="sidebar-card" id="mcp">
          <div class="card-heading">
            <div>
              <span class="section-kicker">Runtime 管理</span>
              <h2>MCP Servers</h2>
            </div>
            <span class="status-badge">{mcpServers().length} 个</span>
          </div>
          <Show when={mcpError()}>
            <p class="field-error" role="alert">
              {mcpError()}
            </p>
          </Show>
          <Show
            when={mcpServers().length > 0}
            fallback={<p class="empty-copy mcp-empty">{mcpLoading() ? "正在读取 MCP 状态…" : "暂无已注册 MCP Server"}</p>}
          >
            <div class="mcp-list" aria-live="polite" aria-label="MCP Server 状态">
              <For each={mcpServers()}>
                {(server) => (
                  <article class={`mcp-row mcp-row-${server.status}`}>
                    <div class="mcp-row-head">
                      <strong>{server.name}</strong>
                      <span class="mcp-status">{mcpStatusLabel(server.status)}</span>
                    </div>
                    <Show when={server.url}>
                      <small class="mcp-row-url" title={server.url}>
                        {server.url}
                      </small>
                    </Show>
                    <Show when={server.status === "retrying"}>
                      <small class="mcp-row-detail">第 {server.retryAttempt ?? 0} 次重试，Runtime 将自动恢复</small>
                    </Show>
                    <Show when={server.status === "failed"}>
                      <div class="mcp-row-action">
                        <Show when={server.error?.message}>
                          <small class="mcp-row-detail">{server.error?.message}</small>
                        </Show>
                        <button
                          class="mcp-action-button"
                          type="button"
                          disabled={Boolean(mcpActionID())}
                          onClick={() => void retryMcp(server.id)}
                        >
                          {mcpActionID() === server.id ? "重试中…" : "重试"}
                        </button>
                      </div>
                    </Show>
                    <Show when={server.status === "needs_auth"}>
                      <button
                        class="mcp-action-button"
                        type="button"
                        disabled={Boolean(mcpActionID())}
                        onClick={() => void authorizeMcp(server.id)}
                      >
                        {mcpActionID() === server.id ? "打开授权…" : "授权"}
                      </button>
                    </Show>
                  </article>
                )}
              </For>
            </div>
          </Show>
        </section>

        <div class="notice" aria-live="polite">
          <span class="notice-light" />
          {notice()}
        </div>
      </aside>

      <section class="app-main" id="workspace">
        <section class="main-grid chat-surface-host">
          <ChatSurface
            sessionID={sessionID()}
            client={{ baseUrl: apiBaseUrl }}
            title={currentSessionTitle()}
            theme={darkMode() ? "dark" : undefined}
            model={savedModel() || undefined}
            composerDisabledHint={savedModel() ? undefined : "尚未配置全局模型，请先在左侧「模型配置」保存模型服务"}
            onSessionStatusChange={(id, status) => setSessions((current) => mergeSessionStatus(current, id, status))}
            onSkillUpdated={scheduleSkillReload}
            onOpenPermissionSettings={openPolicyPopover}
            composerExtras={composerControls}
          />
        </section>

        <footer>
          <span>NEXUM CORE / INTERNAL DEMO</span>
          <span>UI 是控制面，Runtime 在 Core</span>
        </footer>

        <ConfirmDialog
          title="删除当前 Session？"
          description="删除会清理消息、交互和事件记录，但不会删除工作目录或全局模型配置。此操作不可恢复，确认要继续吗？"
          confirmLabel="确认删除 Session"
          open={deleteConfirmOpen()}
          onOpenChange={setDeleteConfirmOpen}
          busy={deleteBusy()}
          onConfirm={confirmDeleteSession}
        />
        <ConfirmDialog
          title="取消注册这个 Skill？"
          description={`只会移除 Nexum 注册记录，不会删除或修改源目录。确认取消注册 ${skillUnregisterID()} 吗？`}
          confirmLabel="确认取消注册"
          open={skillUnregisterConfirmOpen()}
          onOpenChange={setSkillUnregisterConfirmOpen}
          busy={skillUnregisterBusy()}
          onConfirm={confirmUnregisterSkill}
        />
        <ConfirmDialog
          title="删除这个内置 Skill？"
          description={`将删除 root 下的 ${skillRemoveID()} 目录及其文件，操作不可恢复。确认继续吗？`}
          confirmLabel="确认删除 Skill"
          open={skillRemoveConfirmOpen()}
          onOpenChange={setSkillRemoveConfirmOpen}
          busy={skillRemoveBusy()}
          onConfirm={confirmRemoveSkill}
        />
      </section>
      </main>
    </Popover>
  )
}

/**
 * 调用 Nexum Server 的权限策略接口。
 *
 * 策略路由属于 Nexum Server 的接口，不进入生成的 SDK，因此页面直接用 fetch，
 * 并把服务端返回的稳定错误消息原样交给调用方展示。
 *
 * @param apiBaseUrl - Nexum Server API 基地址
 * @param path - 以 /api 开头的策略路径
 * @param init - 可选的 fetch 配置
 * @returns 响应中的 data 字段
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
async function requestPermissionPolicy<T>(apiBaseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  })
  const payload = (await response.json().catch(() => undefined)) as { data?: T; message?: string } | undefined
  if (!response.ok) throw new Error(payload?.message ?? "权限策略请求失败")
  if (payload?.data === undefined) throw new Error("权限策略响应缺少数据")
  return payload.data
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function defaultApiBaseUrl() {
  const configured = import.meta.env?.VITE_NEXUM_API_URL
  if (configured) return configured
  if (typeof window === "undefined") return "http://127.0.0.1:4097"
  return `${window.location.protocol}//${window.location.hostname}:4097`
}
