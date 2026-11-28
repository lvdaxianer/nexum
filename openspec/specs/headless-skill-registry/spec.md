# headless-skill-registry Specification

## Purpose
定义 Nexum Skill 来源的发现、注册、持久化、校验、冲突处理和安全取消注册边界，确保运行时只读取经过授权且可安全验证的本地 Skill 目录。

## Requirements

### Requirement: Discover complete directory skills

The registry SHALL discover a directory Skill only when it contains a valid `SKILL.md`, parse its declared metadata, retain the complete relative file manifest, and expose a stable content digest without exposing the host absolute path.

#### Scenario: Register metric-view lifecycle

- **GIVEN** a configured Skill root contains `metric-view-lifecycle/SKILL.md`, `references/`, `scripts/`, and `evals/`
- **WHEN** the registry refreshes
- **THEN** the result contains the Skill ID, name, description, version, digest, and all accepted relative files
- **AND** the Skill is available to the Session resolver

#### Scenario: Reject incomplete package

- **GIVEN** a candidate directory has no `SKILL.md`, invalid frontmatter, or an unsafe relative file
- **WHEN** the registry refreshes
- **THEN** the candidate is excluded with a stable validation code
- **AND** no partial Skill is activatable

### Requirement: Enforce configured roots and duplicate policy

The registry SHALL accept Skill sources discovered from configured local Skill roots or explicitly registered local Skill directories, reject path traversal and symlink escape, and report duplicate Skill IDs as conflicts instead of silently choosing one.

#### Scenario: Unregistered address is not read

- **GIVEN** a local Skill directory is outside configured roots and has not been registered
- **WHEN** a refresh or activation request references its address or ID
- **THEN** the registry does not read the directory as an available Skill
- **AND** the caller receives a stable not-found or not-registered diagnostic

#### Scenario: Registered address is validated safely

- **GIVEN** a registration request points to a local directory
- **WHEN** the address is validated
- **THEN** the registry reads only ordinary files under that directory
- **AND** path traversal and symlink escape are rejected before activation

#### Scenario: Path escape is rejected

- **GIVEN** a registration request contains path traversal or resolves through a symlink outside the registered Skill directory
- **WHEN** the request is validated
- **THEN** the server returns a caller-safe path error with a trace ID
- **AND** no file outside the registered directory is read

#### Scenario: Duplicate ID is visible

- **GIVEN** two configured or registered addresses expose the same Skill ID
- **WHEN** the registry refreshes
- **THEN** the Skill status is `conflict`
- **AND** the Session resolver refuses activation until one registration is removed or explicitly resolved

### Requirement: Discover configured Skill roots during service startup

The registry SHALL discover every valid direct-child Skill directory under each configured local Skill root during initial service startup, expose those Skills as built-in sources, and persist only enough source metadata to restore their origin without converting them into externally registered sources.

#### Scenario: Start with multiple built-in Skills

- **GIVEN** a configured Skill root contains ten valid direct-child Skill directories
- **WHEN** the service starts with no persisted Skill registrations
- **THEN** all ten Skills appear in the registry with safe summaries and validation status marked as built-in
- **AND** restarting the service restores their configured-root origin

#### Scenario: Start after a prior discovery

- **GIVEN** the registry has discovered built-in Skills during an earlier startup
- **WHEN** the service starts again with the same configured root
- **THEN** the root is scanned again and unchanged valid Skills remain available
- **AND** a built-in Skill is not treated as an externally registered address

#### Scenario: Add a directory after startup

- **GIVEN** a new Skill directory is added under a configured root after the service has started
- **WHEN** no explicit registration request is sent for the new address
- **THEN** the new Skill is not required to appear in the current registry
- **AND** the owning product can make it available by calling the existing address-based register operation

### Requirement: Provide safe validation metadata

The registry SHALL report validation status, version, digest, file count, and diagnostics without returning credentials, environment values, absolute paths, or raw command output.

#### Scenario: Secret-shaped diagnostics are redacted

- **GIVEN** a local validation emits a credential-shaped value
- **WHEN** validation results are returned
- **THEN** the result contains only redacted diagnostics and status fields
- **AND** the credential-shaped value is absent from HTTP response, event stream, and page state

### Requirement: Persist registered Skill sources

The registry SHALL persist each registered source address and its safe validation metadata in the Nexum data directory, restore those registrations on startup, and refresh them without requiring the original registration request again.

#### Scenario: Registration survives restart

- **GIVEN** a valid local Skill directory is registered
- **WHEN** Nexum stops and starts with the same data directory
- **THEN** the registration source is restored
- **AND** the registry refreshes it into the same ready Skill when the source is unchanged

#### Scenario: One broken source does not block others

- **GIVEN** persisted registrations contain one valid source and one moved or invalid source
- **WHEN** Nexum restores and refreshes the registry
- **THEN** the valid source remains available
- **AND** the broken source is reported as invalid with a safe diagnostic

### Requirement: Unregister without deleting the Skill source

The registry SHALL remove an externally registered source from Nexum registration and derived registry state without deleting, modifying, or moving any file in the source directory, and SHALL reject unregister requests for built-in sources.

#### Scenario: User unregisters a Skill

- **GIVEN** a Skill was explicitly registered from a local directory outside configured roots
- **WHEN** the registration is removed
- **THEN** the Skill no longer appears in the available registry
- **AND** the source directory and its files remain unchanged and readable

#### Scenario: User attempts to unregister a built-in Skill

- **GIVEN** a Skill was discovered under a configured Skill root
- **WHEN** the caller requests unregister by Skill ID
- **THEN** the registry rejects the operation with a stable built-in-source conflict
- **AND** the root directory and its files remain unchanged

#### Scenario: Re-register after unregister

- **GIVEN** an external Skill source was unregistered but still exists
- **WHEN** the same address is registered again
- **THEN** the registry validates it as a new registration
- **AND** the resulting Skill can be activated when ready

### Requirement: Identify Skill source ownership in safe summaries

The registry SHALL expose whether a Skill is built-in or externally registered in its safe summary without exposing host absolute paths or secrets.

#### Scenario: List mixed Skill sources

- **GIVEN** the registry contains one configured-root Skill and one explicitly registered Skill
- **WHEN** a caller lists Skills
- **THEN** each summary identifies its source ownership
- **AND** no summary exposes the source directory path

### Requirement: Delete built-in Skill sources safely

The registry SHALL provide a separate destructive operation for deleting a built-in Skill directory, restricted to a configured root's direct child and never applicable to an external source.

#### Scenario: Delete a built-in Skill

- **GIVEN** a Skill was discovered under a configured root and the target is a real direct-child directory
- **WHEN** the caller requests source deletion
- **THEN** the Skill directory and its files are deleted
- **AND** the Skill no longer appears in the available registry

#### Scenario: Reject deletion outside a configured root

- **GIVEN** a Skill was explicitly registered outside configured roots
- **WHEN** the caller requests source deletion
- **THEN** the registry returns a stable source-not-removable error
- **AND** the external directory remains unchanged

#### Scenario: Reject deletion of a root or symlink

- **GIVEN** the target is a configured root itself or a symbolic-link Skill path
- **WHEN** the caller requests source deletion
- **THEN** the registry rejects the operation with a safe path error
- **AND** no file or directory is deleted
