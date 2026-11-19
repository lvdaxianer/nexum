# Spec Delta

## Purpose

为任意外部 UI 提供与 OpenCode Coding Agent 交互的无界面 Session 能力，使任务提交、运行状态和 Agent 事件不依赖 CLI、TUI 或 Desktop。

## ADDED Requirements

### Requirement: Headless Service SHALL create sessions

The service SHALL create a session for a valid working directory and return a stable session identifier with its initial status.

#### Scenario: Create a session for a valid directory

- **WHEN** a client submits a valid working directory and an available agent identifier
- **THEN** the service returns a unique session identifier and status `idle`

#### Scenario: Reject an invalid directory

- **WHEN** a client submits a directory that does not exist or is not accessible
- **THEN** the service returns a validation error and does not create a runnable session

### Requirement: Headless Service SHALL accept prompts

The service SHALL accept a text prompt for an existing session and start the Agent coding loop asynchronously.

#### Scenario: Submit a prompt

- **WHEN** a client submits non-empty text for an idle session
- **THEN** the service accepts the prompt and exposes a running state or equivalent execution event

#### Scenario: Reject an unknown session

- **WHEN** a client submits a prompt for an unknown session identifier
- **THEN** the service returns a not-found error and does not invoke the model

### Requirement: Headless Service SHALL stream runtime events

The service SHALL expose ordered session events for assistant output, tool calls, tool results, permission requests, completion, failure, and cancellation.

#### Scenario: Observe a successful run

- **WHEN** a client subscribes before submitting a prompt
- **THEN** the client receives events that identify the session, preserve event order, and end with a completion event

#### Scenario: Observe a failed run

- **WHEN** model or tool execution fails
- **THEN** the client receives a failure event with a safe error description and the session becomes terminal

### Requirement: Headless Service SHALL cancel running sessions

The service SHALL allow a client to request cancellation of a running session and SHALL stop accepting further tool execution for that run.

#### Scenario: Cancel a running session

- **WHEN** a client cancels a running session
- **THEN** the service emits a cancellation result and the session reaches a cancelled terminal state

#### Scenario: Cancel an idle session

- **WHEN** a client cancels an idle session
- **THEN** the service returns an idempotent success or no-op result without creating a new run
