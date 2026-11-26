# Spec Delta

## MODIFIED Requirements

### Requirement: ChatSurface SHALL provide complete chat runtime interactions

ChatSurface SHALL expose the existing Protocol operations needed to load paginated history, send Prompt, continue or cancel a run, subscribe to ordered events, recover after reconnect, and surface stable errors. A submitted user Prompt SHALL remain rendered while asynchronous state, history, or event responses are applied. The cancel operation SHALL be visible and actionable only when the Protocol Session State declares `canCancel` true.

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

#### Scenario: Hide cancel when the protocol denies cancellation

- **WHEN** the loaded Session State has `canCancel` false
- **THEN** ChatSurface does not render an actionable “取消运行” control

#### Scenario: Keep cancel when the protocol allows cancellation

- **WHEN** the loaded Session State has `canCancel` true
- **THEN** ChatSurface renders the existing confirmation-based cancel control and keeps it protected against repeated submission

#### Scenario: Reflect a terminal event

- **WHEN** an ordered terminal event changes a previously cancellable Session to completed, failed, or cancelled
- **THEN** ChatSurface removes the cancel control after applying the event state

## ADDED Requirements

### Requirement: Session cancellation SHALL respect the Core lifecycle capability

The Core SHALL define whether a Session is cancellable, the Protocol State SHALL expose that capability, and the Server SHALL reject cancellation requests that target a Session for which the Core reports `canCancel` false.

#### Scenario: Reject cancellation for a completed Session

- **WHEN** a client sends a cancel request for a completed Session
- **THEN** the Server returns the stable cancellation-conflict error and does not claim a successful cancellation

#### Scenario: Allow cancellation for a running Session

- **WHEN** a client sends a cancel request for a running Session
- **THEN** Core cancels the active run and the Server returns the existing cancelled result after the cancellation is accepted
