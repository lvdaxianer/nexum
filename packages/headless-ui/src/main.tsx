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
type PermissionRequest = ExperimentalHeadlessSessionPermissionListOutput[number]
type QuestionRequest = ExperimentalHeadlessSessionQuestionListOutput[number]
type SessionSummary = ExperimentalHeadlessSessionListOutput[number]
type ModelProbeResult = ExperimentalHeadlessModelProbeOutput
type SkillSummary = ExperimentalHeadlessSkillListOutput[number]
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
  const [notice, setNotice] = createSignal("Ready for a headless run.")
  const [connected, setConnected] = createSignal(false)
  const [pendingDecisionID, setPendingDecisionID] = createSignal("")
  let streamController: AbortController | undefined
  const seenEventKeys = new Set<string>()

  onMount(async () => {
    try {
      const active = await client.experimental.headless.model.get()
      if (active) {
        setBaseUrl(active.baseUrl)
        setModel(active.model)
        setCredentialRef(active.credentialRef ?? "")
        setNotice(active.credentialConfigured ? "Model configuration loaded." : "Model endpoint loaded.")
      }
      await Promise.all([restoreSession(), loadSkills()])
    } catch {
      setNotice("Headless API is not reachable yet.")
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
      setNotice(`Model ${saved.model} is armed at ${saved.baseUrl}.`)
    } catch (error) {
      setNotice(messageFrom(error, "Model configuration was rejected."))
    } finally {
      setBusy(false)
    }
  }

  async function probeModel() {
    if (probeBusy()) return
    setProbeBusy(true)
    try {
      const result = await client.experimental.headless.model.probe({ mode: "both" })
      setProbeResult(result)
      setNotice("Model probe completed.")
    } catch (error) {
      setProbeResult(undefined)
      setNotice(messageFrom(error, "Model probe failed."))
    } finally {
      setProbeBusy(false)
    }
  }

  async function restoreSession() {
    const savedID = sessionStorage.getItem("headless.sessionID")
    const available = await client.experimental.headless.session.list()
    setSessions(available)
    const saved = savedID ? available.find((item) => item.id === savedID) : undefined
    if (!saved) {
      if (savedID) sessionStorage.removeItem("headless.sessionID")
      return
    }
    await selectSession(saved, false)
    setNotice(`Session ${saved.id.slice(0, 8)} restored from the page.`)
  }

  async function refreshRuntime() {
    if (refreshBusy()) return
    setRefreshBusy(true)
    try {
      const available = await client.experimental.headless.session.list()
      setSessions(available)
      const current = available.find((item) => item.id === sessionID())
      if (current) {
        setSessionStatus(current.status)
        await Promise.all([refreshPermissions(current.id), refreshQuestions(current.id)])
      }
      await loadSkills()
      setNotice("Runtime state refreshed.")
    } catch (error) {
      setNotice(messageFrom(error, "Runtime refresh failed."))
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
      setSkills(await client.experimental.headless.skill.list())
    } catch (error) {
      setNotice(messageFrom(error, "Skill registry is not reachable."))
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
      setSkills(await client.experimental.headless.skill.refresh())
      setSkillValidation({})
      setNotice("Skill registry refreshed.")
    } catch (error) {
      setNotice(messageFrom(error, "Skill refresh failed."))
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
      const skill = result.data.find((item) => item.id === skillID)
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
    setSessionID(session.id)
    setSessionStatus(session.status)
    setDirectory(session.directory)
    setEvents([])
    setPermissions([])
    setQuestions([])
    setQuestionAnswers({})
    setCompactionStatus("idle")
    setContextSources([])
    seenEventKeys.clear()
    sessionStorage.setItem("headless.sessionID", session.id)
    connectEvents(session.id)
    await Promise.all([refreshPermissions(session.id), refreshQuestions(session.id)])
    if (announce) setNotice(`Session ${session.id.slice(0, 8)} selected.`)
  }

  async function createSession() {
    setBusy(true)
    try {
      const created = await client.experimental.headless.session.create({ directory: directory().trim() })
      setSessionID(created.id)
      setSessionStatus(created.status)
      setDirectory(created.directory)
      sessionStorage.setItem("headless.sessionID", created.id)
      setSessions((current) => [...current.filter((item) => item.id !== created.id), created])
      setEvents([])
      setPermissions([])
      setQuestions([])
      setQuestionAnswers({})
      setCompactionStatus("idle")
      setContextSources([])
      seenEventKeys.clear()
      connectEvents(created.id)
      setNotice(`Session ${created.id.slice(0, 8)} is waiting for a prompt.`)
    } catch (error) {
      setNotice(messageFrom(error, "Session could not be created."))
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
      for await (const event of client.experimental.headless.session.events(
        { sessionID: id },
        { signal: controller.signal },
      )) {
        const eventKey = `${event.sessionID}:${event.sequence}`
        if (seenEventKeys.has(eventKey)) continue
        seenEventKeys.add(eventKey)
        setEvents((current) => [
          ...[
            ...current,
            { ...event, localTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
          ].slice(-200),
        ])
        if (event.type === "session.completed") setSessionStatus("completed")
        if (event.type === "session.failed") setSessionStatus("failed")
        if (event.type === "session.cancelled") setSessionStatus("cancelled")
        if (event.type === "tool.request") setSessionStatus("awaiting permission")
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
        if (event.type === "skill.failed") setNotice("Skill activation failed. Check status and permissions.")
        void refreshPermissions(id)
      }
    } catch (error) {
      if (!controller.signal.aborted) setNotice(messageFrom(error, "Event stream disconnected."))
    } finally {
      if (!controller.signal.aborted) setConnected(false)
    }
  }

  async function refreshPermissions(id = sessionID()) {
    if (!id) return
    try {
      setPermissions(await client.experimental.headless.session.permission.list({ sessionID: id }))
    } catch {
      // A missing permission endpoint should not break the event timeline.
    }
  }

  async function refreshQuestions(id = sessionID()) {
    if (!id) return
    try {
      setQuestions(await client.experimental.headless.session.question.list({ sessionID: id }))
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
      setNotice("Question answered. Runtime is continuing.")
    } catch (error) {
      setNotice(messageFrom(error, "Question reply failed."))
    } finally {
      setBusy(false)
    }
  }

  async function cancelQuestion(requestID: string) {
    if (!sessionID()) return
    try {
      await client.experimental.headless.session.question.cancel({ sessionID: sessionID(), requestID })
      await refreshQuestions()
      setNotice("Question cancelled. No answer was fabricated.")
    } catch (error) {
      setNotice(messageFrom(error, "Question cancellation failed."))
    }
  }

  async function sendPrompt() {
    if (!sessionID() || !prompt().trim()) return
    setBusy(true)
    seenEventKeys.clear()
    try {
      setActiveSkillIDs(skillIDsFromText(prompt()))
      await client.experimental.headless.session.prompt({ sessionID: sessionID(), text: prompt().trim() })
      setPrompt("")
      setSessionStatus("running")
      setNotice("Prompt accepted. Waiting for the next runtime event.")
    } catch (error) {
      setNotice(messageFrom(error, "Prompt was not accepted."))
    } finally {
      setBusy(false)
    }
  }

  async function cancelSession() {
    if (!sessionID()) return
    try {
      await client.experimental.headless.session.cancel({ sessionID: sessionID() })
      setSessionStatus("cancelled")
      setNotice("Cancellation requested.")
    } catch (error) {
      setNotice(messageFrom(error, "Cancellation failed."))
    }
  }

  async function reconnectEvents() {
    if (!sessionID()) return
    connectEvents(sessionID())
    setNotice("Event stream reconnecting.")
  }

  async function decide(requestID: string, decision: "allow_once" | "allow_always" | "deny") {
    if (pendingDecisionID()) return
    setPendingDecisionID(requestID)
    try {
      await client.experimental.headless.session.permission.reply({ sessionID: sessionID(), requestID, decision })
      await refreshPermissions()
      setNotice(decision === "deny" ? "Permission denied." : "Permission approved.")
    } catch (error) {
      setNotice(messageFrom(error, "Permission reply failed."))
    } finally {
      setPendingDecisionID("")
    }
  }

  return (
    <main class="shell">
      <header class="topbar">
        <div class="brand-lockup">
          <span class="brand-mark">H</span>
          <div>
            <p class="eyebrow">OPENCODE / HEADLESS</p>
            <h1>Control Room</h1>
          </div>
        </div>
        <div class="top-meta">
          <span class={`status-dot ${connected() ? "is-live" : ""}`} />
          <span>{connected() ? "event stream live" : "standby"}</span>
          <code>{apiBaseUrl}</code>
        </div>
      </header>

      <section class="hero-grid">
        <div class="hero-copy">
          <p class="eyebrow amber">HEADLESS POC / 01</p>
          <h2>
            Bring your own
            <br />
            <em>control surface.</em>
          </h2>
          <p class="lede">
            A small UI for the parts that matter: model runtime, session admission, ordered events, and human
            permission.
          </p>
        </div>
        <div class="run-card">
          <div class="run-card-head">
            <span class="eyebrow">ACTIVE SESSION</span>
            <span class={`pill pill-${sessionStatus()}`}>{sessionStatus()}</span>
          </div>
          <div class="session-id">{sessionID() || "No session admitted"}</div>
          <div class="run-card-footer">
            <span>directory-bound runtime</span>
            <div class="run-controls">
              <button class="ghost-button" disabled={!sessionID()} onClick={reconnectEvents}>
                Reconnect events
              </button>
              <button class="ghost-button" disabled={!sessionID() || refreshBusy()} onClick={refreshRuntime}>
                {refreshBusy() ? "Refreshing…" : "Refresh runtime"}
              </button>
              <button class="ghost-button danger-text" disabled={!sessionID()} onClick={cancelSession}>
                Cancel run ↗
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="workspace-grid">
        <aside class="side-stack">
          <section class="panel panel-config">
            <div class="panel-heading">
              <span class="panel-index">01</span>
              <h3>Model runtime</h3>
            </div>
            <p class="panel-note">One endpoint. No hidden provider fallback.</p>
            <label>
              Base URL
              <input
                value={baseUrl()}
                onInput={(event) => setBaseUrl(event.currentTarget.value)}
                placeholder="https://…/v1"
              />
            </label>
            <label>
              Model
              <input
                value={model()}
                onInput={(event) => setModel(event.currentTarget.value)}
                placeholder="coding-model"
              />
            </label>
            <label>
              Credential ref
              <input
                value={credentialRef()}
                onInput={(event) => setCredentialRef(event.currentTarget.value)}
                placeholder="MODEL_API_KEY"
              />
            </label>
            <label>
              Credential value
              <input
                type="password"
                value={credential()}
                onInput={(event) => setCredential(event.currentTarget.value)}
                placeholder="optional, write-only"
              />
            </label>
            <button class="primary-button" disabled={busy()} onClick={saveModel}>
              {busy() ? "Saving…" : "Save model config"}
            </button>
            <button class="outline-button probe-button" disabled={probeBusy()} onClick={probeModel}>
              {probeBusy() ? "Probing…" : "Probe model"}
              <span>↗</span>
            </button>
            <Show when={probeResult()}>
              {(result) => (
                <div class="probe-result" aria-live="polite">
                  <span>Text response: {result().text}</span>
                  <span>Function Calling: {result().functionCalling}</span>
                </div>
              )}
            </Show>
          </section>

          <section class="panel panel-session">
            <div class="panel-heading">
              <span class="panel-index">02</span>
              <h3>Session admission</h3>
            </div>
            <p class="panel-note">The core validates this path before it can run.</p>
            <label>
              Working directory
              <input
                value={directory()}
                onInput={(event) => setDirectory(event.currentTarget.value)}
                placeholder="/workspace/project"
              />
            </label>
            <button class="outline-button" disabled={busy() || !directory().trim()} onClick={createSession}>
              Create session <span>→</span>
            </button>
            <Show when={sessions().length > 0}>
              <div class="session-picker">
                <div class="session-picker-head">
                  <span class="eyebrow">AVAILABLE SESSIONS</span>
                  <span>{sessions().length}</span>
                </div>
                <For each={sessions()}>
                  {(session) => (
                    <button
                      class={`session-option ${session.id === sessionID() ? "is-active" : ""}`}
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

          <section class="panel panel-skills">
            <div class="panel-heading skill-panel-head">
              <div class="skill-panel-title">
                <span class="panel-index">03</span>
                <h3>Skill registry</h3>
              </div>
              <button class="text-button skill-refresh" disabled={skillBusy()} onClick={refreshSkills}>
                {skillBusy() ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <p class="panel-note">Skills are admitted by the Core, then gated by permission.</p>
            <div class="skill-list" aria-live="polite">
              <Show when={skills().length > 0} fallback={<p class="queue-empty">No project Skills discovered</p>}>
                <For each={skills()}>
                  {(skill) => (
                    <article class={`skill-row skill-row-${skill.status}`}>
                      <div class="skill-row-copy">
                        <div class="skill-row-title">
                          <strong>{skill.id}</strong>
                          <span class="skill-status">{skill.status}</span>
                        </div>
                        <p>{skill.description || "No description provided."}</p>
                        <small>
                          {skill.fileCount} files · {skill.digest.slice(0, 10)}
                        </small>
                      </div>
                      <button class="skill-validate" onClick={() => validateSkill(skill.id)} disabled={skillBusy()}>
                        Validate
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
            <span class="notice-light" />
            {notice()}
          </div>
        </aside>

        <section class="panel panel-timeline">
          <div class="panel-heading timeline-heading">
            <div>
              <span class="panel-index">04</span>
              <h3>Runtime timeline</h3>
            </div>
            <span class="event-count">{events().length.toString().padStart(2, "0")} events</span>
          </div>
          <div class="timeline">
            <Show
              when={events().length > 0}
              fallback={
                <div class="empty-state">
                  <span>∅</span>
                  <p>
                    Events will appear here
                    <br />
                    after a prompt is accepted.
                  </p>
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
                value={prompt()}
                onInput={(event) => setPrompt(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void sendPrompt()
                }}
                placeholder="Describe the next coding move…"
                disabled={!sessionID()}
              />
              <Show when={skillSuggestions().length > 0}>
                <div class="skill-suggestions" role="listbox" aria-label="Skill suggestions">
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
                <div class="active-skill-row" aria-label="Active Skills">
                  <span class="eyebrow">ATTACHED</span>
                  <For each={activeSkillIDs()}>{(id) => <span class="skill-chip">@{id}</span>}</For>
                </div>
              </Show>
            </div>
            <button class="send-button" disabled={!sessionID() || !prompt().trim() || busy()} onClick={sendPrompt}>
              Send
              <br />
              <span>⌘ ↵</span>
            </button>
          </div>
        </section>
      </section>

      <section class="question-strip">
        <div class="permission-title">
          <span class="panel-index">05</span>
          <div>
            <h3>User input queue</h3>
            <p>Questions pause the runtime until every answer is explicit.</p>
          </div>
        </div>
        <Show when={questions().length > 0} fallback={<span class="queue-empty">No pending questions</span>}>
          <div class="question-list">
            <For each={questions()}>
              {(request) => (
                <article class="question-card">
                  <div class="question-card-head">
                    <span class="permission-action">{request.id}</span>
                    <button class="text-button" onClick={() => cancelQuestion(request.id)}>
                      Cancel question
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
                  <button class="primary-button" disabled={busy()} onClick={() => replyQuestion(request)}>
                    Submit answers
                  </button>
                </article>
              )}
            </For>
          </div>
        </Show>
      </section>

      <section class="context-strip">
        <div class="context-card">
          <span class="panel-index">06</span>
          <div>
            <h3>Context compaction</h3>
            <p class="context-value">{compactionStatus()}</p>
          </div>
        </div>
        <div class="context-card context-sources">
          <span class="panel-index">07</span>
          <div>
            <h3>Project context sources</h3>
            <Show when={contextSources().length > 0} fallback={<p class="context-value">Waiting for Core sources</p>}>
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
          </div>
        </div>
      </section>

      <section class="permission-strip">
        <div class="permission-title">
          <span class="panel-index">08</span>
          <div>
            <h3>Permission queue</h3>
            <p>Nothing executes without an explicit decision.</p>
          </div>
        </div>
        <Show
          when={permissions().length > 0}
          fallback={<span class="queue-empty">Queue clear · awaiting tool requests</span>}
        >
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
                    <button disabled={Boolean(pendingDecisionID())} onClick={() => decide(request.id, "allow_once")}>
                      {pendingDecisionID() === request.id ? "Saving…" : "Allow once"}
                    </button>
                    <button disabled={Boolean(pendingDecisionID())} onClick={() => decide(request.id, "allow_always")}>
                      Always
                    </button>
                    <button
                      class="deny"
                      disabled={Boolean(pendingDecisionID())}
                      onClick={() => decide(request.id, "deny")}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>

      <footer>
        <span>HEADLESS CORE / EXPERIMENTAL</span>
        <span>UI is a client. Runtime is elsewhere.</span>
      </footer>
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
