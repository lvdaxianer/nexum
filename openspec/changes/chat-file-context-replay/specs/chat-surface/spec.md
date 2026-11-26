## ADDED Requirements

### Requirement: ChatSurface SHALL preserve and clearly replay uploaded text context

ChatSurface MUST preserve full uploaded text for model context while rendering the user's question and attachment summary on send and history replay. State initialization and refresh MUST NOT remove already-rendered user messages.

#### Scenario: Model receives uploaded content as authoritative context

- **WHEN** the user submits a question with a selected `.md` or `.txt` file
- **THEN** the Prompt contains the complete file text, a filename, explicit start/end boundaries, and an instruction to use the provided text directly instead of reading the filename from the workspace

#### Scenario: User question remains visible with a long file

- **WHEN** a user message containing file context is rendered immediately or restored from history
- **THEN** the user question is shown as the main bubble content and the file is shown as a compact attachment summary

#### Scenario: Initialization does not erase a submitted question

- **WHEN** a session state or history response completes after a user Prompt was optimistically rendered
- **THEN** existing user messages remain in the conversation and pending interaction items are merged without replacing the list

#### Scenario: Existing file-context messages remain readable

- **WHEN** history contains a Prompt created by the previous file-context format
- **THEN** ChatSurface extracts the question and filename for display while preserving the stored full Prompt for model context
