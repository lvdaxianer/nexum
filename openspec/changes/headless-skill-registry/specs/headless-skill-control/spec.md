# Headless Skill Control

## ADDED Requirements

### Requirement: Expose skill management through the Headless API

The Headless API SHALL expose list, detail, register/refresh, activate and local validation operations with stable schemas, error codes, trace IDs, and credential redaction.

#### Scenario: Page lists registered skills

- **GIVEN** the project Skill root contains `metric-view-lifecycle`
- **WHEN** the page requests the Skill list
- **THEN** the response includes its safe summary and validation status
- **AND** it excludes local absolute paths and secrets

#### Scenario: Registering an existing ID is idempotent

- **GIVEN** the same validated source is submitted again
- **WHEN** the page registers or refreshes it
- **THEN** the registry returns the existing digest and no duplicate entry is created

### Requirement: Provide page-level skill discovery and validation

The page SHALL provide Skill search/selection, `@skill` autocomplete, active Skill visibility, validation status, and recoverable errors without requiring direct Core imports.

#### Scenario: User activates the metric skill

- **GIVEN** the Skill is listed and a Session is active
- **WHEN** the user selects `@metric-view-lifecycle` and submits a prompt
- **THEN** the page shows the active Skill and ordered runtime events
- **AND** the Session can continue through Permission, Question, tool, and context controls

#### Scenario: Validation failure is recoverable

- **GIVEN** a Skill validation command fails
- **WHEN** the page displays the result
- **THEN** it shows a safe diagnostic and keeps the Skill available for refresh or removal
- **AND** it does not report the Skill as ready or run save/publish actions
