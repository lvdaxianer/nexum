# Spec Delta

## ADDED Requirements

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
