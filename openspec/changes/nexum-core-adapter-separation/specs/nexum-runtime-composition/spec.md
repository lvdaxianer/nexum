# Spec Delta

## ADDED Requirements

### Requirement: Runtime SHALL be composed outside Core

The Runtime SHALL be assembled by `@nexum/application` from explicit Persistence and Integrations implementations and passed into Server or a host application. Server SHALL NOT create Core stores, models, local Host or other default implementations implicitly.

#### Scenario: Start a local persistent Runtime
- **WHEN** the host calls the Application local Runtime composer with a data directory
- **THEN** all default stores SHALL use that directory and the returned Runtime SHALL be startable and observable

#### Scenario: Inject a custom implementation
- **WHEN** the host replaces one Persistence or Integrations Port
- **THEN** the composer SHALL use the replacement without changing Core code or Protocol code
