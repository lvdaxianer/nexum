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

The registry SHALL accept only directories inside configured Skill roots, reject path traversal and symlink escape, and report duplicate Skill IDs as conflicts instead of silently choosing one.

#### Scenario: Path escape is rejected

- **GIVEN** a registration request points outside every configured Skill root
- **WHEN** the request is validated
- **THEN** the server returns a caller-safe path error with a trace ID
- **AND** no file outside the root is read

#### Scenario: Duplicate ID is visible

- **GIVEN** two configured roots expose the same Skill ID
- **WHEN** the registry refreshes
- **THEN** the Skill status is `conflict`
- **AND** the Session resolver refuses activation until one source is removed or explicitly selected

### Requirement: Provide safe validation metadata

The registry SHALL report validation status, version, digest, file count, and diagnostics without returning credentials, environment values, absolute paths, or raw command output.

#### Scenario: Secret-shaped diagnostics are redacted

- **GIVEN** a local validation emits a credential-shaped value
- **WHEN** validation results are returned
- **THEN** the result contains only redacted diagnostics and status fields
- **AND** the credential-shaped value is absent from HTTP response, event stream, and page state
