# Spec Delta

## Purpose

为 Nexum 提供可恢复且可审计的 Session execution claim，使进程重启后能够安全识别未完成运行、限制恢复尝试并保持同一 Session 的幂等执行语义。

## ADDED Requirements

### Requirement: Persist an execution claim

Nexum SHALL persist one active execution claim per Session with a stable execution ID, execution mode, lifecycle status, attempt count, and caller-safe timestamps.

#### Scenario: Prompt admission creates one claim

- **GIVEN** an idle Session accepts a Prompt
- **WHEN** admission completes
- **THEN** Nexum persists one running claim before model execution starts
- **AND** repeated admission for the same Session is rejected without creating a second active claim

#### Scenario: Claim completion is terminal

- **GIVEN** a running claim is executing
- **WHEN** the run completes, fails, or is cancelled by the user
- **THEN** Nexum records the matching terminal status and updated timestamp
- **AND** the Session no longer appears locally busy after the terminal event is durable

### Requirement: Recover interrupted execution safely

Nexum SHALL recover only interrupted claims whose canonical Session history can continue, and SHALL use a bounded durable attempt count for every recovery admission.

#### Scenario: Restart recovers a continuable claim

- **GIVEN** a running claim remains after process termination and the Session history ends with a user or tool message
- **WHEN** the next Runtime starts with the same persistence data
- **THEN** Nexum creates one recovery attempt and resumes the existing Session context
- **AND** it does not append a duplicate user message

#### Scenario: Restart leaves non-continuable work idle

- **GIVEN** a running claim remains after process termination but canonical history has no continuable user or tool message
- **WHEN** the next Runtime starts
- **THEN** Nexum marks the claim recoverable-but-idle with a caller-safe diagnostic
- **AND** it does not invoke the model automatically

#### Scenario: Recovery attempt budget is bounded

- **GIVEN** a claim has reached the configured recovery attempt limit
- **WHEN** Runtime startup scans claims
- **THEN** Nexum stops automatic recovery and exposes a stable exhausted status
- **AND** the Session remains available for explicit user action

### Requirement: Separate local claims from cluster ownership

The execution claim SHALL describe a process-local recovery marker only and MUST NOT promise distributed locking, fencing, or exactly-once execution.

#### Scenario: Two processes do not claim ownership through the record

- **GIVEN** two Runtime processes read the same persisted claim
- **WHEN** either process evaluates recovery eligibility
- **THEN** the record does not authorize cross-process ownership or fencing
- **AND** the public status identifies the claim as local recovery state

### Requirement: Expose safe recovery status

Nexum SHALL expose execution/recovery status with stable IDs, state, attempt count, and safe timestamps while excluding internal locks, filesystem paths, credentials, and raw exception details.

#### Scenario: Client reads recovery status

- **GIVEN** a caller requests recovery status for a known Session
- **WHEN** the Session has an active or interrupted claim
- **THEN** the response includes the execution ID, state, attempts, and recovery eligibility
- **AND** it does not include the claim file path or sensitive runtime data
