# headless-skill-registry Specification

## Purpose
TBD - created by archiving change headless-skill-registry. Update Purpose after archive.

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

The registry SHALL accept only explicitly registered local Skill directories, reject path traversal and symlink escape, and report duplicate Skill IDs as conflicts instead of silently choosing one.

#### Scenario: Unregistered address is not read

- **GIVEN** a local Skill directory has not been registered
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

- **GIVEN** two registered addresses expose the same Skill ID
- **WHEN** the registry refreshes
- **THEN** the Skill status is `conflict`
- **AND** the Session resolver refuses activation until one registration is removed or explicitly resolved

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

The registry SHALL remove a source from Nexum registration and derived registry state without deleting, modifying, or moving any file in the source directory.

#### Scenario: User unregisters a Skill

- **GIVEN** a Skill is registered from a local directory
- **WHEN** the registration is removed
- **THEN** the Skill no longer appears in the available registry
- **AND** the source directory and its files remain unchanged and readable

#### Scenario: Re-register after unregister

- **GIVEN** a local Skill source was unregistered but still exists
- **WHEN** the same address is registered again
- **THEN** the registry validates it as a new registration
- **AND** the resulting Skill can be activated when ready
