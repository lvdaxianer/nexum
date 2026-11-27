# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Discover configured Skill roots during service startup

The registry SHALL discover every valid direct-child Skill directory under each configured local Skill root during initial service startup, persist the discovered registration metadata, and restore persisted source addresses on later startup.

#### Scenario: Start with multiple built-in Skills

- **GIVEN** a configured Skill root contains ten valid direct-child Skill directories
- **WHEN** the service starts with no persisted Skill registrations
- **THEN** all ten Skills appear in the registry with their safe summaries and validation status
- **AND** their source addresses and metadata are persisted for subsequent starts

#### Scenario: Start after a prior discovery

- **GIVEN** the registry has persisted registrations from an earlier startup
- **WHEN** the service starts again with the same data directory
- **THEN** the persisted source addresses are restored and revalidated
- **AND** unchanged valid Skills remain activatable without a new registration request

#### Scenario: Add a directory after startup

- **GIVEN** a new Skill directory is added under a configured root after the service has started
- **WHEN** no explicit registration request is sent for the new address
- **THEN** the new Skill is not required to appear in the current registry
- **AND** the owning product can make it available by calling the existing address-based register operation
