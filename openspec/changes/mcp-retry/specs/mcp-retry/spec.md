## ADDED Requirements

### Requirement: Retry initial MCP connection failures

The MCP Registry MUST retry recoverable initial connection failures with bounded backoff and MUST expose retrying state without leaking credentials.

#### Scenario: Initial connection recovers

- **WHEN** the first connection attempt fails with a recoverable transport error and a later attempt succeeds
- **THEN** the server transitions through `retrying` and ends in `connected`, with the retry counter reset

#### Scenario: Retry budget is exhausted

- **WHEN** all bounded retry attempts fail
- **THEN** the server remains `failed` with a safe error summary and waits for an explicit connect

### Requirement: Cancel retries on ownership changes

The MCP Registry MUST cancel pending retries when a server is disconnected, removed, or the runtime is closed, and stale connection completions MUST NOT publish a connected state.

#### Scenario: Disconnect during backoff

- **WHEN** a retry timer is pending and the caller disconnects the server
- **THEN** the timer is cleared, the server becomes disabled, and no later connector call occurs

### Requirement: Keep authentication and configuration errors out of retry

The MCP Registry MUST NOT automatically retry invalid configuration or `needs_auth` failures.

#### Scenario: OAuth is required

- **WHEN** a connector reports `needs_auth`
- **THEN** the server remains `needs_auth` and the caller must complete authorization before explicitly reconnecting
