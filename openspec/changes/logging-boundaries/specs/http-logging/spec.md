## ADDED Requirements

### Requirement: HTTP 日志必须结构化并关联 trace context
Nexum Server MUST emit structured WARN/ERROR records with the request trace ID when an HTTP request reaches a logged warning or error boundary.

#### Scenario: Log an asynchronous request failure
- **WHEN** an error is handled after an awaited operation
- **THEN** the log record includes the same trace ID created at the HTTP boundary

### Requirement: 日志必须统一脱敏和限长
The Server logger MUST recursively redact credential-shaped fields and MUST cap diagnostic strings before writing them.

#### Scenario: Log a credential-shaped error
- **WHEN** an exception message or field contains a token, password, authorization value, or credential
- **THEN** the emitted record contains a redacted marker and no original secret

#### Scenario: Log an oversized stack or field
- **WHEN** a diagnostic string exceeds the logger limit
- **THEN** the emitted record is truncated and remains valid JSON

### Requirement: 正常 HTTP 请求不得产生高频 INFO 日志
The Server MUST NOT emit per-request INFO start and completion records by default.

#### Scenario: Complete a normal request
- **WHEN** a request returns a normal response
- **THEN** no high-frequency request lifecycle INFO record is emitted
