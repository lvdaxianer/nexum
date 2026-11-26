# Spec Delta

## MODIFIED Requirements

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
