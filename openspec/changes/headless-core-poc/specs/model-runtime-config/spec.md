# Spec Delta

## Purpose

让 Headless Service 在不依赖 OpenCode 模型配置界面的情况下使用一个外部 OpenAI-compatible 模型端点，并为后续接入企业模型网关保留清晰的运行时配置边界。

## ADDED Requirements

### Requirement: Service SHALL accept a minimal model configuration

The service SHALL accept a Base URL, model identifier, and credential value or credential reference for one OpenAI-compatible model endpoint.

#### Scenario: Save a valid model configuration

- **WHEN** a client submits a valid absolute Base URL and non-empty model identifier
- **THEN** the service accepts the configuration and uses it for newly started sessions

#### Scenario: Reject an invalid model configuration

- **WHEN** a client submits a malformed URL or empty model identifier
- **THEN** the service returns a validation error and preserves the last valid configuration

### Requirement: Model configuration SHALL be applied to new runs

The service SHALL resolve the active model configuration when a session run starts and SHALL return a clear error if the model cannot be reached or authenticated.

#### Scenario: Start a run with an active configuration

- **WHEN** a client submits a prompt after a valid model configuration has been saved
- **THEN** the Agent uses that configuration and emits normal assistant or tool events

#### Scenario: Model endpoint is unavailable

- **WHEN** the configured endpoint cannot be reached or rejects authentication
- **THEN** the service emits a safe model error and does not silently fall back to another provider

### Requirement: Model credentials SHALL be protected

The service SHALL avoid returning credential values in configuration responses, runtime events, ordinary logs, or error messages.

#### Scenario: Read model configuration

- **WHEN** a client requests the active configuration
- **THEN** the response includes non-secret fields and represents the credential as redacted or configured without returning its value

#### Scenario: Invalid credential response

- **WHEN** the model endpoint rejects the credential
- **THEN** the service returns a generic authentication failure without including the submitted credential
