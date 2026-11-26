# host-security-boundary Specification

## Purpose
为 Nexum 提供统一的 Host 资源风险与沙箱边界，使文件、Shell 及未来网络执行在进入权限和执行适配器时具有一致、可审计且不泄露敏感信息的语义。

## Requirements

### Requirement: Host requests expose normalized risk

Nexum SHALL derive a stable action, normalized resource, and risk classification for every built-in Host request before permission evaluation.

#### Scenario: Normalize a file request

- **WHEN** a read or write request contains surrounding whitespace or Windows separators
- **THEN** the permission-facing resource uses the normalized representation
- **AND** the Host receives the original value needed for execution

#### Scenario: Classify network and credential-bearing Shell input

- **WHEN** a Shell command contains a network client, redirect, nested shell, or credential-bearing argument
- **THEN** the request is classified as high risk
- **AND** a broad allow rule cannot silently bypass the normal approval boundary

### Requirement: Sandbox Host enforces injected policy

Nexum SHALL allow Application to wrap a Host with an injected Sandbox policy that can deny actions and bound returned output without requiring a container runtime.

#### Scenario: Deny a disallowed action

- **WHEN** a wrapped Host receives an action not present in its allowlist
- **THEN** it returns a stable denied ToolResult
- **AND** it does not invoke the underlying Host

#### Scenario: Bound oversized output

- **WHEN** the underlying Host returns output larger than the Sandbox policy limit
- **THEN** the wrapper returns a bounded output with a truncation marker
- **AND** it preserves the original success or failure status

### Requirement: Host cancellation completes cleanup

Nexum SHALL preserve cancellation and timeout semantics so a terminated Shell process is cleaned up before the caller receives its terminal result.

#### Scenario: Cancel a running Shell

- **WHEN** the Session cancellation signal aborts a Shell request
- **THEN** the Host terminates the process group within the cleanup bound
- **AND** the returned result uses the stable cancelled status without exposing raw process details
