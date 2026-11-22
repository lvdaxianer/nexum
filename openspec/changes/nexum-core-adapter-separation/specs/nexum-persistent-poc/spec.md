# Spec Delta

## Purpose

通过一个可启动的 Test Workbench 验证 Nexum 的完整组合能力，并确保 POC 使用真实文件持久化而不是内存状态。

## ADDED Requirements

### Requirement: Test Workbench SHALL use persistent default adapters

The Test Workbench SHALL use a local Runtime backed by a dedicated `.nexum-test` data directory. Session, message, interaction, event and memory state SHALL survive process restart.

#### Scenario: Restart the POC
- **WHEN** the Workbench is stopped and started again with the same data directory
- **THEN** previously created Session, visible messages, durable events and pending interactions SHALL be readable

#### Scenario: Write failure
- **WHEN** a persistence write fails
- **THEN** the Runtime SHALL preserve the previous file, return a stable persistence error and SHALL NOT silently replace state with an empty in-memory store

### Requirement: Test Workbench SHALL exercise the complete cross-layer path

The Workbench SHALL execute Core, Adapter, Protocol, Client and Surface code in one path. A static fixture or UI-only mock SHALL NOT count as a passing POC.

#### Scenario: Prompt to completed Session
- **WHEN** a user submits a prompt
- **THEN** the Workbench SHALL show the real Session transition, assistant output, event stream and completed state

#### Scenario: Question and answer
- **WHEN** Core emits a question interaction
- **THEN** the Surface SHALL render a question/card, and submitting an answer SHALL resume the same Session

#### Scenario: Error and cancellation
- **WHEN** Core returns an error or the user cancels a running Session
- **THEN** the Protocol SHALL emit a stable error/terminal event and the Surface SHALL show the corresponding state

### Requirement: Test Workbench SHALL expose observable runtime state

The Workbench SHALL show Session list, current Session, Coding Loop messages, event count/types, Runtime status and prompt controls from live protocol state.

#### Scenario: Observe a running Session
- **WHEN** a Session is running
- **THEN** the page SHALL show running status and append live output/events without replacing the durable history
