# headless-skill-control Specification

## Purpose
为 Nexum 提供稳定、可审计的 Skill 管理控制面，使页面和 Session Agent 能通过安全的 Headless API 完成 Skill 注册、校验、激活和生命周期管理。

## Requirements

### Requirement: Expose skill management through the Headless API

The Headless API SHALL expose list, detail, address-based register/refresh, validate, activate and unregister operations with stable schemas, error codes, trace IDs, and credential redaction.

#### Scenario: Page lists registered skills

- **GIVEN** the project Skill root contains `metric-view-lifecycle`
- **WHEN** the page requests the Skill list
- **THEN** the response includes its safe summary and validation status
- **AND** it excludes local absolute paths and secrets

#### Scenario: Registering an existing ID is idempotent

- **GIVEN** the same validated source is submitted again
- **WHEN** the page registers or refreshes it
- **THEN** the registry returns the existing digest and no duplicate entry is created

#### Scenario: Registering an existing address is idempotent

- **GIVEN** the same validated source address is submitted again
- **WHEN** the page registers or refreshes it
- **THEN** the registry returns the existing digest and no duplicate entry is created

#### Scenario: Registering by address creates a durable source

- **GIVEN** a caller submits a valid local Skill directory address
- **WHEN** the register endpoint completes
- **THEN** the response contains the safe Skill summary and registration status
- **AND** a later service restart can restore that registration from Nexum storage

#### Scenario: Unregistering removes only Nexum state

- **GIVEN** a Skill was registered from a local directory
- **WHEN** the caller deletes the Skill registration
- **THEN** the API removes it from future list and activation results
- **AND** the source directory is not deleted or modified

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

### Requirement: Expose Skill registry operations to the Session Agent

The Session Agent SHALL have a `skill_registry` tool for listing, inspecting, registering, refreshing, validating, and unregistering Nexum-managed Skills, and SHALL not use shell discovery as a substitute for those operations.

#### Scenario: Agent registers a Skill by address

- **GIVEN** a user asks the Agent to register a Skill and supplies its address
- **WHEN** the Agent invokes `skill_registry` with `register`
- **THEN** Nexum validates and persists the registration
- **AND** the Agent receives a safe status result without raw source contents

#### Scenario: Agent unregisters without deleting source files

- **GIVEN** a user asks the Agent to remove a Nexum Skill registration
- **WHEN** the Agent invokes `skill_registry` with `unregister`
- **THEN** Nexum removes only its registration
- **AND** the Agent does not issue a shell or filesystem deletion command for the source

#### Scenario: Registry management requires permission

- **GIVEN** an Agent requests `register`, `refresh`, or `unregister`
- **WHEN** the policy evaluates the request
- **THEN** Nexum uses the `skill.manage` permission boundary
- **AND** read-only list, detail, and validate operations remain non-mutating

### Requirement: Publish safe Skill registry updates

The runtime SHALL publish a Skill registry update event after registration, refresh, validation, or unregistration so connected pages can update without exposing absolute paths, credentials, or raw Skill files.

#### Scenario: Page refreshes after registration

- **GIVEN** a Skill registration completes
- **WHEN** the page receives the registry update event
- **THEN** it refreshes the Skill list and `@skill` suggestions
- **AND** the event contains only safe identifiers, status, and change type

#### Scenario: Existing activation events remain compatible

- **GIVEN** a Skill is activated or activation fails
- **WHEN** the runtime publishes the result
- **THEN** existing `skill.activated` and `skill.failed` event semantics remain available
