import { For, Show, createSignal, onCleanup, onMount } from "solid-js"
import { OpenCode } from "@opencode/client"
import type {
  ExperimentalHeadlessSessionEventsOutput,
  ExperimentalHeadlessSessionPermissionListOutput,
} from "@opencode/client"
import "./styles.css"

type TimelineEvent = ExperimentalHeadlessSessionEventsOutput & { localTime: string }
type PermissionRequest = ExperimentalHeadlessSessionPermissionListOutput[number]

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
  const [events, setEvents] = createSignal<TimelineEvent[]>([])
  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([])
  const [busy, setBusy] = createSignal(false)
  const [notice, setNotice] = createSignal("Ready for a headless run.")
  const [connected, setConnected] = createSignal(false)
  let streamController: AbortController | undefined

  onMount(async () => {
    try {
      const active = await client.experimental.headless.model.get()
      if (active) {
        setBaseUrl(active.baseUrl)
        setModel(active.model)
        setCredentialRef(active.credentialRef ?? "")
        setNotice(active.credentialConfigured ? "Model configuration loaded." : "Model endpoint loaded.")
      }
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

  async function createSession() {
    setBusy(true)
    try {
      const created = await client.experimental.headless.session.create({ directory: directory().trim() })
      setSessionID(created.id)
      setSessionStatus(created.status)
      setEvents([])
      setPermissions([])
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
        setEvents((current) => [
          ...current,
          { ...event, localTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
        ])
        if (event.type === "session.completed") setSessionStatus("completed")
        if (event.type === "session.failed") setSessionStatus("failed")
        if (event.type === "session.cancelled") setSessionStatus("cancelled")
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

  async function sendPrompt() {
    if (!sessionID() || !prompt().trim()) return
    setBusy(true)
    try {
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

  async function decide(requestID: string, decision: "allow_once" | "allow_always" | "deny") {
    try {
      await client.experimental.headless.session.permission.reply({ sessionID: sessionID(), requestID, decision })
      await refreshPermissions()
      setNotice(decision === "deny" ? "Permission denied." : "Permission approved.")
    } catch (error) {
      setNotice(messageFrom(error, "Permission reply failed."))
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
            <button class="ghost-button" disabled={!sessionID()} onClick={cancelSession}>
              Cancel run ↗
            </button>
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
          </section>

          <div class="notice">
            <span class="notice-light" />
            {notice()}
          </div>
        </aside>

        <section class="panel panel-timeline">
          <div class="panel-heading timeline-heading">
            <div>
              <span class="panel-index">03</span>
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
            <textarea
              value={prompt()}
              onInput={(event) => setPrompt(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void sendPrompt()
              }}
              placeholder="Describe the next coding move…"
              disabled={!sessionID()}
            />
            <button class="send-button" disabled={!sessionID() || !prompt().trim() || busy()} onClick={sendPrompt}>
              Send
              <br />
              <span>⌘ ↵</span>
            </button>
          </div>
        </section>
      </section>

      <section class="permission-strip">
        <div class="permission-title">
          <span class="panel-index">04</span>
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
                    <button onClick={() => decide(request.id, "allow_once")}>Allow once</button>
                    <button onClick={() => decide(request.id, "allow_always")}>Always</button>
                    <button class="deny" onClick={() => decide(request.id, "deny")}>
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

export default App
