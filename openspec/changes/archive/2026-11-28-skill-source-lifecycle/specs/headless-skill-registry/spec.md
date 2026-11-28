# Spec Delta

## MODIFIED Requirements

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
- **THEN** the registry validates it as an external registration
- **AND** the resulting Skill can be activated when ready

## ADDED Requirements

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
