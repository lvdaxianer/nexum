# Spec Delta

## ADDED Requirements

### Requirement: Runtime exposes typed reasoning events

Nexum Protocol SHALL expose `assistant.thinking`, `assistant.reasoning` and `assistant.text` as stable runtime event types. Reasoning deltas SHALL contain only the model-provided text increment, while event identity and ordering SHALL use the existing event envelope.

#### Scenario: Protocol advertises reasoning events
- **WHEN** a client reads Nexum capabilities
- **THEN** `eventTypes` contains `assistant.thinking`, `assistant.reasoning` and `assistant.text`

#### Scenario: Reasoning delta has a stable public shape
- **WHEN** Core publishes a reasoning increment
- **THEN** the SSE event type is `assistant.reasoning` and its data contains a string `content` field together with the standard event identity fields

### Requirement: Core preserves reasoning order and visibility boundaries

Core SHALL publish model-provided reasoning increments in sequence order before the related tool or final text events, SHALL keep reasoning in canonical model history, and SHALL NOT merge reasoning into `assistant.text` event data.

#### Scenario: Reasoning precedes a tool call
- **WHEN** a model returns reasoning followed by a tool call
- **THEN** the event sequence contains `assistant.reasoning` before `tool.request`, and the reasoning content remains available to the next model step

#### Scenario: Model provides no reasoning
- **WHEN** a model emits text or a tool call without reasoning content
- **THEN** Core emits no fabricated `assistant.reasoning` content and may emit only the safe `assistant.thinking` heartbeat while the model is silent

### Requirement: UI renders reasoning as a continuous transcript

A Nexum UI SHALL be able to reconstruct reasoning, tool activity and final text from ordered runtime events. It SHALL keep reasoning in its own transcript segment, append deltas in real time, and leave completed reasoning visible without representing it as a mandatory large card.

#### Scenario: Reasoning streams between tool actions
- **WHEN** the UI receives reasoning deltas, a tool request/result, and later assistant text
- **THEN** it shows reasoning text, lightweight tool rows, and the final answer in that event order on one scrolling transcript

#### Scenario: Reasoning segment completes
- **WHEN** a later tool or assistant text event arrives
- **THEN** the active reasoning segment stops showing a streaming cursor, remains in the transcript, and does not become part of the final assistant text

#### Scenario: Client reconnects during reasoning
- **WHEN** the UI reconnects and receives replayed reasoning events after its last event ID
- **THEN** it rebuilds the same ordered transcript without duplicating already applied deltas
