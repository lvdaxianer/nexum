# Spec Delta: chat-surface

## MODIFIED Requirements

### Requirement: ChatSurface SHALL expose a stable embeddable UI contract

ChatSurface SHALL provide a complete default visual UI through both the Solid component API and a Web Component wrapper. The wrapper SHALL use light DOM and CSS variables or equivalent host styling hooks so the host can control size, placement and theme without replacing chat behavior. ChatSurface SHALL expose an optional typed status callback for the host; when a run reaches completed, failed or cancelled, the callback SHALL report the controlled Session ID and terminal status while retaining the result in the conversation view.

#### Scenario: Host observes terminal state

- **WHEN** a run completes, fails or is cancelled
- **THEN** the component emits the terminal status callback and retains the result in the conversation view

#### Scenario: Embed in a modal

- **WHEN** the host places `<nexum-chat>` inside a modal and provides a Session ID
- **THEN** the component renders the same history, composer, Permission, Question, Skill and run interactions within the modal bounds

## ADDED Requirements

### Requirement: ChatSurface SHALL reconcile terminal run items

When a terminal event for a run is projected, ChatSurface SHALL reconcile transient thinking, streaming assistant/reasoning and running model-attempt items belonging to that run into the same completed, failed or cancelled status. It SHALL NOT change already terminal tool, permission or question results, and repeated terminal events SHALL be idempotent.

#### Scenario: Complete a streamed response

- **WHEN** `run.settled` reports `completed` after assistant text has streamed
- **THEN** the Agent item and model-attempt item for that run no longer render `输出中` or `执行中`, and one completed run result remains discoverable

#### Scenario: Fail or cancel a run

- **WHEN** `run.settled` reports `failed` or `cancelled`
- **THEN** the run-owned transient items render the matching terminal status and the existing failure or cancellation result remains visible
