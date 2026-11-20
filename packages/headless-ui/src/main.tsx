import { For, Show, createSignal, onCleanup, onMount } from "solid-js"
import { render } from "solid-js/web"
import { OpenCode } from "@opencode/client"
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

const apiBaseUrl = import.meta.env.VITE_HEADLESS_API_URL ?? "http://127.0.0.1:4097"
const client = OpenCode.make({ baseUrl: apiBaseUrl })

function App() {
  const [baseUrl, setBaseUrl] = createSignal("https://model.example.com/v1")
  const [model, setModel] = createSignal("coding-model")
  const [credentialRef, setCredentialRef] = createSignal("")
  const [credential, setCredential] = createSignal("")
  const [directory, setDirectory] = createSignal("")
  const [prompt, setPrompt] = createSignal("")
  const [sessionID, setSessionID] = createSignal("")
  const [sessionStatus, setSessionStatus] = createSignal("no session")
  const [sessions, setSessions] = createSignal<SessionSummary[]>([])
  const [events, setEvents] = createSignal<TimelineEvent[]>([])
  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([])
  const [questions, setQuestions] = createSignal<QuestionRequest[]>([])
  const [questionAnswers, setQuestionAnswers] = createSignal<Record<string, string[][]>>({})
  const [compactionStatus, setCompactionStatus] = createSignal("idle")
  const [contextSources, setContextSources] = createSignal<ContextSource[]>([])
  const [busy, setBusy] = createSignal(false)
  const [probeBusy, setProbeBusy] = createSignal(false)
  const [probeResult, setProbeResult] = createSignal<ModelProbeResult | undefined>()
  const [refreshBusy, setRefreshBusy] = createSignal(false)
  const [skills, setSkills] = createSignal<SkillSummary[]>([])
  const [skillBusy, setSkillBusy] = createSignal(false)
  const [skillValidation, setSkillValidation] = createSignal<Record<string, string>>({})
  const [activeSkillIDs, setActiveSkillIDs] = createSignal<string[]>([])
  const [notice, setNotice] = createSignal("准备开始一次 Headless 运行")
  const [connected, setConnected] = createSignal(false)
  const [pendingDecisionID, setPendingDecisionID] = createSignal("")
  const [pendingQuestionID, setPendingQuestionID] = createSignal("")
  const [cancelBusy, setCancelBusy] = createSignal(false)
  let streamController: AbortController | undefined
  const seenEventKeys = new Set<string>()

  onMount(async () => {
    try {
      const active = await client.experimental.headless.model.get()
      if (active.data) {
        setBaseUrl(active.data.baseUrl)
        setModel(active.data.model)
        setCredentialRef(active.data.credentialRef ?? "")
        setNotice(active.data.credentialConfigured ? "模型配置已加载" : "模型服务地址已加载")
      }
      await Promise.all([restoreSession(), loadSkills()])
    } catch {
      setNotice("Headless API 尚未连接")
    }
  })

  onCleanup(() => streamController?.abort())

  async function saveModel() {
    setBusy(true)
    try {
      const saved = await client.experimental.headless.model.update({
        baseUrl: baseUrl().trim(),
        model: model().trim(),
        credential: credential().trim() || undefined,
        credentialRef: credentialRef().trim() || undefined,
      })
      setCredential("")
      setNotice(`模型 ${saved.data.model} 已就绪：${saved.data.baseUrl}`)
    } catch (error) {
      setNotice(messageFrom(error, "模型配置未通过，请检查地址和凭据"))
    } finally {
      setBusy(false)
    }
  }

  async function probeModel() {
    if (probeBusy()) return
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
    if (!saved) {
      if (savedID) sessionStorage.removeItem("headless.sessionID")
      return
    }
    await selectSession(saved, false)
    setNotice(`已恢复页面中的 Session：${saved.id.slice(0, 8)}`)
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
    streamController?.abort()
    const snapshot = await client.experimental.headless.session.state({ sessionID: session.id })
    setSessionID(session.id)
    setSessionStatus(snapshot.data.session.status)
    setDirectory(snapshot.data.session.directory)
    setEvents([])
    setPermissions(snapshot.data.pendingPermissions)
    setQuestions(snapshot.data.pendingQuestions)
    setQuestionAnswers({})
    setCompactionStatus("idle")
    setContextSources([])
    seenEventKeys.clear()
    sessionStorage.setItem("headless.sessionID", session.id)
    connectEvents(session.id)
    if (announce) setNotice(`已选择 Session：${session.id.slice(0, 8)}`)
  }

  async function createSession() {
    setBusy(true)
    try {
      const created = await client.experimental.headless.session.create({ directory: directory().trim() })
      setSessionID(created.data.id)
      setSessionStatus(created.data.status)
      setDirectory(created.data.directory)
      sessionStorage.setItem("headless.sessionID", created.data.id)
      setSessions((current) => [...current.filter((item) => item.id !== created.data.id), created.data])
      setEvents([])
      setPermissions([])
      setQuestions([])
      setQuestionAnswers({})
      setCompactionStatus("idle")
      setContextSources([])
      seenEventKeys.clear()
      connectEvents(created.data.id)
      setNotice(`Session ${created.data.id.slice(0, 8)} 已创建，等待 Prompt`)
    } catch (error) {
      setNotice(messageFrom(error, "Session 创建失败，请检查工作目录"))
    } finally {
      setBusy(false)
    }
  }

  async function connectEvents(id: string) {
    streamController?.abort()
    const controller = new AbortController()
    streamController = controller
    setConnected(true)
    try {
      const lastEventID = sessionStorage.getItem(`headless.eventID.${id}`) ?? undefined
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
        sessionStorage.setItem(`headless.eventID.${id}`, event.eventID)
        setEvents((current) => [
          ...[
            ...current,
            { ...event, localTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
          ].slice(-200),
        ])
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
    try {
      setActiveSkillIDs(skillIDsFromText(prompt()))
      await client.experimental.headless.session.prompt({ sessionID: sessionID(), text: prompt().trim() })
      await refreshPermissions()
      setPrompt("")
      setSessionStatus("running")
      setNotice("Prompt 已提交，等待下一条运行事件")
    } catch (error) {
      setNotice(messageFrom(error, "Prompt 未提交成功，请重试"))
    } finally {
      setBusy(false)
    }
  }

  async function cancelSession() {
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
          <a class="nav-item" href="#skills">
            <span>✦</span>Skills
          </a>
          <a class="nav-item" href="#model">
            <span>◈</span>模型配置
          </a>
        </nav>

        <section class="sidebar-card" id="model">
          <div class="card-heading">
            <div>
              <span class="section-kicker">运行配置</span>
              <h2>模型服务</h2>
            </div>
            <span class="status-badge">{probeResult() ? "已探测" : "待配置"}</span>
          </div>
          <label>
            服务地址
            <input
              aria-label="服务地址"
              value={baseUrl()}
              onInput={(event) => setBaseUrl(event.currentTarget.value)}
              placeholder="https://…/v1"
            />
          </label>
          <label>
            模型名称
            <input
              aria-label="模型名称"
              value={model()}
              onInput={(event) => setModel(event.currentTarget.value)}
              placeholder="coding-model"
            />
          </label>
          <label>
            凭据引用
            <input
              aria-label="凭据引用"
              value={credentialRef()}
              onInput={(event) => setCredentialRef(event.currentTarget.value)}
              placeholder="MODEL_API_KEY"
            />
          </label>
          <label>
            凭据值 <span class="label-note">仅写入运行时</span>
            <input
              aria-label="凭据值"
              type="password"
              value={credential()}
              onInput={(event) => setCredential(event.currentTarget.value)}
              placeholder="输入后不会回显"
            />
          </label>
          <div class="button-stack">
            <button class="button button-primary" disabled={busy()} onClick={saveModel}>
              {busy() ? "保存中…" : "保存模型配置"}
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
        </section>

        <section class="sidebar-card" id="session">
          <div class="card-heading">
            <div>
              <span class="section-kicker">项目上下文</span>
              <h2>Session</h2>
            </div>
            <span class="status-badge">{sessions().length} 个</span>
          </div>
          <label>
            工作目录
            <input
              aria-label="工作目录"
              value={directory()}
              onInput={(event) => setDirectory(event.currentTarget.value)}
              placeholder="/workspace/project"
            />
          </label>
          <button class="button button-secondary" disabled={busy() || !directory().trim()} onClick={createSession}>
            创建新 Session <span>→</span>
          </button>
          <Show when={sessions().length > 0}>
            <div class="session-list" aria-label="可用 Session">
              <For each={sessions()}>
                {(session) => (
                  <button
                    class={`session-item ${session.id === sessionID() ? "is-active" : ""}`}
                    aria-pressed={session.id === sessionID()}
                    onClick={() => void selectSession(session)}
                  >
                    <span>{session.id.slice(0, 8)}</span>
                    <small>{session.status}</small>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </section>

        <section class="sidebar-card skill-card" id="skills">
          <div class="card-heading">
            <div>
              <span class="section-kicker">能力目录</span>
              <h2>Skills</h2>
            </div>
            <button class="text-button" disabled={skillBusy()} onClick={refreshSkills}>
              {skillBusy() ? "刷新中…" : "刷新"}
            </button>
          </div>
          <p class="helper-text">Skill 先注册、校验，再进入模型上下文。</p>
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
            <span class="model-chip">{model() || "未配置模型"}</span>
          </div>
        </header>

        <div class="session-toolbar">
          <div class="session-summary">
            <span class="section-kicker">当前 Session</span>
            <strong class="session-id">{sessionID() || "尚未创建 Session"}</strong>
            <span class={`pill pill-${sessionStatus()}`}>{sessionStatus()}</span>
          </div>
          <div class="toolbar-actions">
            <button class="toolbar-button" disabled={!sessionID()} onClick={reconnectEvents}>
              重新连接
            </button>
            <button class="toolbar-button" disabled={!sessionID() || refreshBusy()} onClick={refreshRuntime}>
              {refreshBusy() ? "刷新中…" : "刷新状态"}
            </button>
            <button
              class="toolbar-button toolbar-danger"
              disabled={!sessionID() || cancelBusy()}
              onClick={cancelSession}
            >
              {cancelBusy() ? "取消中…" : "取消运行"}
            </button>
          </div>
        </div>

        <section class="capability-grid" aria-label="核心能力">
          <article class="capability-card">
            <span class="capability-icon">↯</span>
            <div>
              <span>Function Calling</span>
              <strong>{probeResult()?.functionCalling ?? "待探测"}</strong>
            </div>
          </article>
          <article class="capability-card">
            <span class="capability-icon">✓</span>
            <div>
              <span>权限门禁</span>
              <strong>{permissions().length > 0 ? `${permissions().length} 个待处理` : "安全"}</strong>
            </div>
          </article>
          <article class="capability-card">
            <span class="capability-icon">?</span>
            <div>
              <span>补充信息</span>
              <strong>{questions().length > 0 ? `${questions().length} 个问题` : "空闲"}</strong>
            </div>
          </article>
          <article class="capability-card">
            <span class="capability-icon">≈</span>
            <div>
              <span>上下文压缩</span>
              <strong class="context-value">{compactionStatus()}</strong>
            </div>
          </article>
          <article class="capability-card">
            <span class="capability-icon">✦</span>
            <div>
              <span>Skill</span>
              <strong>{activeSkillIDs().length > 0 ? `${activeSkillIDs().length} 个已激活` : "未激活"}</strong>
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
            <div class="timeline">
              <Show
                when={events().length > 0}
                fallback={
                  <div class="empty-state">
                    <span>◌</span>
                    <strong>等待一次 Prompt</strong>
                    <p>创建 Session 后，在下方输入你的第一个 Coding 任务。</p>
                  </div>
                }
              >
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
              </Show>
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
