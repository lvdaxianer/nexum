# Spec Delta

## Purpose

为 Nexum 提供 Provider 与模型的统一发现、能力描述和用量语义，使不同模型适配器可以被 CLI、Web、ACP 安全地选择、诊断和展示，而无需了解 Provider-specific SDK。

## ADDED Requirements

### Requirement: Provider catalog exposes safe model capabilities

Nexum SHALL expose a provider catalog containing stable provider/model identifiers, supported capabilities, context limits, and optional pricing estimates without credentials.

#### Scenario: List configured provider catalog

- **WHEN** a caller requests the provider catalog
- **THEN** the response contains provider and model identifiers with capability flags
- **AND** it excludes credential values, authorization headers, and raw upstream configuration

#### Scenario: Catalog is unavailable

- **WHEN** an adapter cannot load its catalog
- **THEN** the caller receives a stable unavailable result or an empty list
- **AND** existing model Prompt requests remain unaffected

### Requirement: Model responses expose bounded usage

Nexum SHALL represent provider usage and cost as optional bounded fields that can be attached to a model response without changing existing text or tool-call behavior.

#### Scenario: Parse usage from a model response

- **WHEN** a provider returns prompt tokens, completion tokens, total tokens, or an estimated cost
- **THEN** Nexum exposes the numeric usage fields with stable names
- **AND** missing fields remain absent rather than fabricated

#### Scenario: Reject unsafe usage metadata

- **WHEN** provider metadata contains credential-shaped text or an unbounded diagnostic payload
- **THEN** the public usage/diagnostic result omits or bounds that value
- **AND** the model error keeps a stable classification

### Requirement: Provider errors remain portable

Nexum SHALL map Provider-specific failures to stable model error categories while preserving bounded retry-after and reasoning/finish semantics.

#### Scenario: Rate limit includes retry guidance

- **WHEN** a Provider returns a rate-limit response with retry guidance
- **THEN** Nexum exposes a bounded retryAfterMs value
- **AND** no credential or raw response body is returned
