# Spec Delta

## Purpose

为 Headless Coding Agent 提供可被外部 UI 或生产审批系统驱动的工具权限闭环，确保未获准的文件、Shell 或扩展工具操作不会继续执行。

## ADDED Requirements

### Requirement: Tool execution SHALL pause for approval

The service SHALL emit a permission request and pause the affected tool execution whenever the active permission rules resolve to `ask`.

#### Scenario: Tool requires approval

- **WHEN** an Agent requests a tool operation whose action and resource resolve to `ask`
- **THEN** the service emits a permission request containing a request identifier, action, resource, and session identifier, and the tool has not executed

#### Scenario: Tool is already allowed

- **WHEN** an Agent requests a tool operation whose action and resource resolve to `allow`
- **THEN** the service executes the tool without creating an approval request

### Requirement: Approval decisions SHALL control execution

The service SHALL accept `allow_once`, `allow_always`, and `deny` decisions for a pending permission request.

#### Scenario: Allow once

- **WHEN** a client submits `allow_once` for a pending request
- **THEN** the blocked tool executes once and the decision does not automatically authorize unrelated future operations

#### Scenario: Allow always

- **WHEN** a client submits `allow_always` for a pending request
- **THEN** the blocked tool executes and the resulting approval pattern is available to subsequent matching operations in the configured scope

#### Scenario: Deny

- **WHEN** a client submits `deny` for a pending request
- **THEN** the blocked tool does not execute and the Agent receives a denied tool result

### Requirement: Pending approvals SHALL be safe to resolve

The service SHALL reject unknown, already-resolved, or malformed approval decisions without executing the associated tool.

#### Scenario: Resolve an unknown request

- **WHEN** a client submits a decision for an unknown request identifier
- **THEN** the service returns a not-found or conflict error and performs no tool execution

#### Scenario: Resolve the same request twice

- **WHEN** a client submits a second decision for an already-resolved request
- **THEN** the service returns a conflict or idempotent result and does not execute the tool a second time

### Requirement: Permission events SHALL omit secrets

The service SHALL expose enough action and resource information for approval without including API keys, tokens, or credential values in permission events or ordinary responses.

#### Scenario: Emit a permission request with credentials in context

- **WHEN** a tool request is evaluated while a model or integration credential is configured
- **THEN** the permission event redacts credential values before it is sent to a client
