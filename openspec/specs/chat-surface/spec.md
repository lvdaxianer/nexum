# chat-surface Specification

## Purpose
提供一个遵守 Nexum Protocol、可由宿主传入 Session ID 直接使用的完整聊天 Surface，使同一套聊天能力能够独立运行或嵌入页面、弹框和 Drawer。

## Requirements

### Requirement: ChatSurface SHALL be controlled by a host-owned Session

ChatSurface SHALL require a Session ID and SHALL not create, select, rename or delete Sessions. The host SHALL be able to place the component in any container without changing chat behavior.

#### Scenario: Mount with an existing Session

- **WHEN** the host mounts ChatSurface with a valid Session ID
- **THEN** ChatSurface loads that Session state and message history, connects its event stream, and renders the chat composer

#### Scenario: Host changes the Session

- **WHEN** the host changes the Session ID
- **THEN** ChatSurface aborts the previous stream, clears transient chat state, loads the new Session, and does not issue a Session creation request

### Requirement: ChatSurface SHALL provide complete chat runtime interactions

ChatSurface SHALL expose the existing Protocol operations needed to load paginated history, send Prompt, continue or cancel a run, subscribe to ordered events, recover after reconnect, and surface stable errors. A submitted user Prompt SHALL remain rendered while asynchronous state, history, or event responses are applied.

#### Scenario: Submit a prompt

- **WHEN** the user submits non-empty text while the Session can accept a prompt
- **THEN** ChatSurface prevents duplicate submission, immediately renders the submitted user question, shows the running state, and renders subsequent streamed events in order

#### Scenario: Reconnect after an event-stream failure

- **WHEN** the event stream disconnects
- **THEN** ChatSurface preserves rendered messages, shows a reconnectable offline state, and resumes from the latest known event sequence without duplicating events

#### Scenario: Load earlier history

- **WHEN** the user reaches the top of the conversation and an earlier page exists
- **THEN** ChatSurface requests the bounded earlier page, prepends it without clearing current content, and preserves the visible scroll position

#### Scenario: Apply asynchronous state after a prompt

- **WHEN** Session state or history completes after a user Prompt was rendered
- **THEN** ChatSurface keeps the user Prompt visible and does not replace it with only pending interaction items or runtime status items

### Requirement: ChatSurface SHALL gate run cancellation by the Protocol capability

ChatSurface SHALL render and invoke the run cancellation control only when the Protocol Session State declares `canCancel` true.

#### Scenario: Hide cancel when the protocol denies cancellation

- **WHEN** the loaded Session State has `canCancel` false
- **THEN** ChatSurface does not render an actionable “取消运行” control

#### Scenario: Keep cancel when the protocol allows cancellation

- **WHEN** the loaded Session State has `canCancel` true
- **THEN** ChatSurface renders the existing confirmation-based cancel control and keeps it protected against repeated submission

#### Scenario: Reflect a terminal event

- **WHEN** an ordered terminal event changes a previously cancellable Session to completed, failed, or cancelled
- **THEN** ChatSurface removes the cancel control after applying the event state

### Requirement: Session cancellation SHALL respect the Core lifecycle capability

The Core SHALL define whether a Session is cancellable, the Protocol State SHALL expose that capability, and the Server SHALL reject cancellation requests that target a Session for which the Core reports `canCancel` false.

#### Scenario: Reject cancellation for a completed Session

- **WHEN** a client sends a cancel request for a completed Session
- **THEN** the Server returns the stable cancellation-conflict error and does not claim a successful cancellation

#### Scenario: Allow cancellation for a running Session

- **WHEN** a client sends a cancel request for a running Session
- **THEN** Core cancels the active run and the Server returns the existing cancelled result after the cancellation is accepted

### Requirement: ChatSurface SHALL support local Markdown and text file context

ChatSurface MUST let the user select one local `.md` or `.txt` file, read its UTF-8 text in the browser, and attach that content to the next non-empty Prompt without changing the existing Prompt API.

#### Scenario: Select a supported file

- **WHEN** the user selects a `.md` or `.txt` file within the supported size limit
- **THEN** the composer shows the file name and a readable loading/success state, while the file content remains local until the user sends the Prompt

#### Scenario: Reject an unsupported or oversized file

- **WHEN** the user selects a file whose extension is not `.md` or `.txt`, or whose size exceeds the supported limit
- **THEN** ChatSurface rejects the file before sending, keeps the current Prompt text, and shows an actionable error explaining the accepted types or size limit

#### Scenario: Send a Prompt with file context

- **WHEN** the user sends non-empty text with a successfully read file attached
- **THEN** ChatSurface sends the original question followed by a clearly delimited file name and full file content, clears the Prompt and attachment only after the request is accepted, and renders the user-visible submission

#### Scenario: Remove a selected file

- **WHEN** the user removes the selected file before sending
- **THEN** ChatSurface removes the file context without changing the remaining Prompt text, and the next Prompt contains no removed file content

#### Scenario: Recover from reading or sending failure

- **WHEN** file reading or Prompt submission fails
- **THEN** ChatSurface stops the pending state, preserves the relevant Prompt text and selected file when available, and exposes a retry or correction path without creating a duplicate submission

### Requirement: ChatSurface SHALL preserve and clearly replay uploaded text context

ChatSurface MUST preserve full uploaded text for model context while rendering the user's question and attachment summary on send and history replay. State initialization, history refresh, and event replay MUST NOT remove already-rendered user messages or create duplicate visible copies of the same submitted Prompt.

#### Scenario: Model receives uploaded content as authoritative context

- **WHEN** the user submits a question with a selected `.md` or `.txt` file
- **THEN** the Prompt contains the complete file text, a filename, explicit start/end boundaries, and an instruction to use the provided text directly instead of reading the filename from the workspace

#### Scenario: User question remains visible with a long file

- **WHEN** a user message containing file context is rendered immediately or restored from history
- **THEN** the user question is shown as the main bubble content and the file is shown as a compact attachment summary

#### Scenario: Initialization does not erase a submitted question

- **WHEN** a session state or history response completes after a user Prompt was optimistically rendered
- **THEN** the existing user message remains in the conversation, equivalent history is reconciled without a duplicate, and pending interaction items are merged without replacing the list

#### Scenario: Existing file-context messages remain readable

- **WHEN** history contains a Prompt created by the previous file-context format
- **THEN** ChatSurface extracts the question and filename for display while preserving the stored full Prompt for model context

#### Scenario: User question remains available after refresh

- **WHEN** the user reloads or re-enters a Session after a file-context Prompt has been accepted
- **THEN** the history view shows the original question and attachment filename without showing the full file body in the user bubble

### Requirement: ChatSurface SHALL handle Permission and Question interactions

ChatSurface SHALL render pending Permission and Question requests from the Session state or ordered events and SHALL submit their decisions through the Protocol. A pending interaction SHALL remain actionable until it reaches a terminal result or the run is cancelled.

#### Scenario: Approve a Permission request

- **WHEN** a Permission request appears and the user chooses an allowed decision
- **THEN** ChatSurface disables repeated decisions until the response settles, sends the decision, and updates the request with its terminal result

#### Scenario: Answer a Question

- **WHEN** a Question request appears and the user submits valid answers
- **THEN** ChatSurface validates the answer shape locally, sends the answers once, and keeps the entered answers visible while the request is pending or failed

#### Scenario: Cancel a pending interaction

- **WHEN** the user cancels the active run while Permission or Question is pending
- **THEN** ChatSurface stops accepting new decisions for that request and renders the cancelled terminal state after the Protocol confirms it

### Requirement: ChatSurface SHALL support Skill discovery and use

ChatSurface SHALL load safe Skill summaries for composer autocomplete and SHALL preserve explicit `@<skill-id>` mentions in submitted text. Skill registration, refresh, validation and removal SHALL remain outside ChatSurface.

#### Scenario: Complete a Skill mention

- **WHEN** the user types `@` in the composer
- **THEN** ChatSurface shows available Skill IDs and descriptions without exposing Skill source paths or instruction text

#### Scenario: Activate a mentioned Skill

- **WHEN** the user submits text containing a selected `@<skill-id>` mention
- **THEN** ChatSurface sends the original mention, renders any `skill.use` Permission request, and displays ordered Skill activated or failed feedback from the event stream

#### Scenario: Unknown Skill mention

- **WHEN** the submitted text contains an unavailable Skill ID
- **THEN** ChatSurface shows the stable failure diagnostic, does not claim activation, and keeps the composer usable for correction or retry

### Requirement: ChatSurface SHALL expose a stable embeddable UI contract

ChatSurface SHALL provide a complete default visual UI through both the Solid component API and a Web Component wrapper. The wrapper SHALL use light DOM and CSS variables or equivalent host styling hooks so the host can control size, placement and theme without replacing chat behavior. ChatSurface SHALL expose an optional typed status callback for the host; when a run reaches completed, failed or cancelled, the callback SHALL report the controlled Session ID and terminal status while retaining the result in the conversation view.

#### Scenario: Embed in a modal

- **WHEN** the host places `<nexum-chat>` inside a modal and provides a Session ID
- **THEN** the component renders the same history, composer, Permission, Question, Skill and run interactions within the modal bounds

#### Scenario: Host observes terminal state

- **WHEN** a run completes, fails or is cancelled
- **THEN** the component emits the terminal status callback and retains the result in the conversation view

### Requirement: ChatSurface SHALL reconcile terminal run items

When a terminal event for a run is projected, ChatSurface SHALL reconcile transient thinking, streaming assistant/reasoning and running model-attempt items belonging to that run into the same completed, failed or cancelled status. It SHALL NOT change already terminal tool, permission or question results, and repeated terminal events SHALL be idempotent.

#### Scenario: Complete a streamed response

- **WHEN** `run.settled` reports `completed` after assistant text has streamed
- **THEN** the Agent item and model-attempt item for that run no longer render `输出中` or `执行中`, and one completed run result remains discoverable

#### Scenario: Fail or cancel a run

- **WHEN** `run.settled` reports `failed` or `cancelled`
- **THEN** the run-owned transient items render the matching terminal status and the existing failure or cancellation result remains visible

### Requirement: ChatSurface SHALL render bounded tool execution state

ChatSurface SHALL 根据有序运行事件渲染工具执行、工具超时、工具失败和工具取消状态；assistant.thinking 心跳 SHALL 不能覆盖已知的工具活动状态。

#### Scenario: Tool activity replaces thinking heartbeat

- **WHEN** ChatSurface 已收到工具请求或工具执行事件，之后继续收到 assistant.thinking 心跳
- **THEN** 页面 SHALL 保持工具活动状态，并不得把该项重新渲染为模型思考

#### Scenario: Tool timeout is recoverable

- **WHEN** ChatSurface 收到工具超时和 failed 的 run.settled
- **THEN** 页面 SHALL 展示超时诊断、保留前序消息，并提供 continue 或 retry 操作

#### Scenario: Reconnect after tool settlement

- **WHEN** 页面在工具超时或取消后断线并从事件游标重连
- **THEN** ChatSurface SHALL 恢复同一工具终态和运行终态，不得重新创建或重复执行工具

### Requirement: 宿主聊天页面 SHALL 显示当前 Agent 模式

承载 ChatSurface 的宿主页面 SHALL 在当前 Session 标题或紧邻 Composer 的控制区显示当前 Agent 模式，并使用与权限策略不同的语义标签。

#### Scenario: 当前 Session 为 Plan

- **WHEN** 宿主页面加载 `mode: "plan"` 的 Session
- **THEN** 页面在 Session 标题区域或 Composer 控制区显示 Plan 标签

#### Scenario: 当前 Session 为 Build

- **WHEN** 宿主页面加载 `mode: "build"` 的 Session
- **THEN** 页面显示 Build 标签，且不把权限策略标签当作模式提示

### Requirement: 模式切换 SHALL 提供可靠反馈

模式切换控件 SHALL 在请求期间阻止重复操作，在成功前不改变本地模式，在失败后恢复原模式并提供可读错误提示；运行中的 Session SHALL 禁用切换控件。

#### Scenario: 切换成功

- **WHEN** 用户对 idle Session 选择另一个模式且 Protocol 返回成功
- **THEN** 页面更新模式标签并显示切换成功状态

#### Scenario: 切换失败

- **WHEN** Protocol 返回冲突、网络或服务错误
- **THEN** 页面保留旧模式，解除控件忙碌状态并提示用户重试

#### Scenario: Session 正在运行

- **WHEN** 当前 Session 状态为 running
- **THEN** Plan/Build 切换控件不可操作，并向用户说明需要等待本轮运行结束

### Requirement: ChatSurface SHALL support explicit theme override

ChatSurface MUST accept an optional `theme` value of `light` or `dark`; when provided, the component MUST apply that theme to its own visual surface regardless of the host document or system color-scheme preference. When omitted, it MUST keep the component's default light theme.

#### Scenario: Force the light theme inside a dark host

- **WHEN** 宿主文档或系统偏好为深色，且 ChatSurface 接收 `theme="light"`
- **THEN** 聊天背景、文字、边框和控件使用浅色主题，不被宿主暗色选择器覆盖

#### Scenario: Force the dark theme inside a light host

- **WHEN** 宿主文档或系统偏好为浅色，且 ChatSurface 接收 `theme="dark"`
- **THEN** 聊天表面使用深色主题，不修改宿主页面的全局主题状态

#### Scenario: Use the default theme

- **WHEN** 宿主不传 `theme`
- **THEN** ChatSurface 使用默认浅色主题，并保持既有聊天交互行为
