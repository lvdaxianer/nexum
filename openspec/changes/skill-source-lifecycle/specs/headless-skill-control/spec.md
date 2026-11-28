# Spec Delta

## MODIFIED Requirements

### Requirement: Expose skill management through the Headless API

The Headless API SHALL expose list, detail, address-based register/refresh, validate, activate and source-aware unregister operations with stable schemas, error codes, trace IDs, and credential redaction.

#### Scenario: Page lists registered skills

- **GIVEN** the project Skill root contains `metric-view-lifecycle`
- **WHEN** the page requests the Skill list
- **THEN** the response includes its safe summary, validation status, and built-in source ownership
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

- **GIVEN** a caller submits a valid local Skill directory address outside configured roots
- **WHEN** the register endpoint completes
- **THEN** the response contains the safe Skill summary and external source ownership
- **AND** a later service restart can restore that external registration from Nexum storage

#### Scenario: Unregistering removes only Nexum state

- **GIVEN** a Skill was explicitly registered from a local directory outside configured roots
- **WHEN** the caller deletes the Skill registration
- **THEN** the API removes it from future list and activation results
- **AND** the source directory is not deleted or modified

#### Scenario: Unregistering a built-in source is rejected

- **GIVEN** a Skill was discovered under a configured root
- **WHEN** the caller deletes the Skill registration
- **THEN** the API returns a stable conflict error identifying the source as built-in
- **AND** the response includes the request trace ID

### Requirement: Provide page-level skill discovery and validation

The page SHALL show source ownership for each Skill, hide ordinary unregister controls for built-in Skills, and provide explicit conflict feedback when a built-in unregister is rejected.

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

#### Scenario: Built-in Skill has no ordinary unregister action

- **GIVEN** the list contains a built-in Skill
- **WHEN** the page renders the Skill row
- **THEN** the row identifies it as built-in
- **AND** the external unregister action is not offered

#### Scenario: External Skill can be unregistered

- **GIVEN** the list contains an external Skill
- **WHEN** the user confirms cancellation
- **THEN** the page removes the row only after the API succeeds
- **AND** it states that the source directory was preserved

### Requirement: Expose Skill registry operations to the Session Agent

The Session Agent SHALL have a `skill_registry` tool for source-aware listing, inspecting, registering, refreshing, validating, and unregistering external Nexum-managed Skills, and SHALL report a stable conflict when unregister targets a built-in Skill.

#### Scenario: Agent registers a Skill by address

- **GIVEN** a user asks the Agent to register a Skill and supplies its address
- **WHEN** the Agent invokes `skill_registry` with `register`
- **THEN** Nexum validates and persists the registration
- **AND** the Agent receives a safe status result without raw source contents

#### Scenario: Agent unregisters without deleting source files

- **GIVEN** a user asks the Agent to remove an external Nexum Skill registration
- **WHEN** the Agent invokes `skill_registry` with `unregister`
- **THEN** Nexum removes only its registration
- **AND** the Agent does not issue a shell or filesystem deletion command for the source

#### Scenario: Agent attempts to unregister a built-in Skill

- **GIVEN** a user asks the Agent to unregister a built-in Skill
- **WHEN** the Agent invokes `skill_registry` with `unregister`
- **THEN** the tool returns a stable built-in-source conflict
- **AND** the tool does not delete or modify the root directory

#### Scenario: Registry management requires permission

- **GIVEN** an Agent requests `register`, `refresh`, `unregister`, or `remove`
- **WHEN** the policy evaluates the request
- **THEN** Nexum uses the `skill.manage` permission boundary
- **AND** read-only list, detail, and validate operations remain non-mutating

### Requirement: Publish safe Skill registry updates

The runtime SHALL publish a Skill registry update event after registration, refresh, validation, or successful unregistration, and SHALL publish a safe conflict result without mutating state when built-in unregistration is rejected.

#### Scenario: Page refreshes after registration

- **GIVEN** a Skill registration completes
- **WHEN** the page receives the registry update event
- **THEN** it refreshes the Skill list and `@skill` suggestions
- **AND** the event contains only safe identifiers, status, source ownership, and change type

#### Scenario: Existing activation events remain compatible

- **GIVEN** a Skill is activated or activation fails
- **WHEN** the runtime publishes the result
- **THEN** existing `skill.activated` and `skill.failed` event semantics remain available

#### Scenario: Page refreshes after external unregistration

- **GIVEN** an external Skill registration completes successfully
- **WHEN** the runtime publishes the registry update
- **THEN** the event contains only the safe identifier, source ownership, and change type
- **AND** connected pages can remove the external Skill without exposing its path

#### Scenario: Built-in unregistration does not publish a success event

- **GIVEN** a built-in Skill is targeted for unregistration
- **WHEN** the Registry rejects the operation
- **THEN** no `unregistered` success event is published
- **AND** the built-in Skill remains available

## ADDED Requirements

### Requirement: Expose built-in source deletion through the control plane

The Headless API, Client, CLI, Agent tool, and page SHALL expose a separate confirmed operation for deleting a built-in Skill source and SHALL reject the operation for external sources.

#### Scenario: User deletes a built-in source

- **GIVEN** the user confirms deletion of a built-in Skill
- **WHEN** the control-plane request succeeds
- **THEN** the root Skill directory is deleted
- **AND** the page and connected clients receive a safe `removed` update

#### Scenario: External source cannot use built-in deletion

- **GIVEN** the target Skill is externally registered
- **WHEN** the caller invokes source deletion
- **THEN** the control plane returns a stable source-not-removable error
- **AND** the external source directory is preserved
