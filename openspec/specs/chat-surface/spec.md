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

ChatSurface SHALL expose the existing Protocol operations needed to load paginated history, send Prompt, continue or cancel a run, subscribe to ordered events, recover after reconnect, and surface stable errors.

#### Scenario: Submit a prompt

- **WHEN** the user submits non-empty text while the Session can accept a prompt
- **THEN** ChatSurface prevents duplicate submission, shows the running state, and renders subsequent streamed events in order

#### Scenario: Reconnect after an event-stream failure

- **WHEN** the event stream disconnects
- **THEN** ChatSurface preserves rendered messages, shows a reconnectable offline state, and resumes from the latest known event sequence without duplicating events

#### Scenario: Load earlier history

- **WHEN** the user reaches the top of the conversation and an earlier page exists
- **THEN** ChatSurface requests the bounded earlier page, prepends it without clearing current content, and preserves the visible scroll position

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
