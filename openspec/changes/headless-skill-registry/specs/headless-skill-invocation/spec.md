# Headless Skill Invocation

## ADDED Requirements

### Requirement: Resolve explicit skill mentions

The Session prompt pipeline SHALL resolve explicit `@<skill-id>` mentions against the registry, preserve the mention range, and attach the selected Skill content to the owning user message.

#### Scenario: Mentioned skill is attached

- **GIVEN** `metric-view-lifecycle` is registered and the prompt contains `@metric-view-lifecycle`
- **WHEN** the prompt is admitted to a Session
- **THEN** the user message contains one Skill attachment with the matching ID and mention range
- **AND** the model context contains the Skill instructions and the prompt text

#### Scenario: Unknown mention is safe

- **GIVEN** the prompt contains `@missing-skill`
- **WHEN** the prompt is admitted
- **THEN** the request returns a stable not-found diagnostic
- **AND** the coding loop does not execute tools for that request

### Requirement: Apply skill permission and lifecycle controls

Skill activation SHALL be governed by `skill.use` permission, emit ordered activation/failure events, and resolve pending Skill work on Session cancellation.

#### Scenario: Denied skill does not run

- **GIVEN** a policy denies `skill.use` for the requested Skill
- **WHEN** the user mentions the Skill
- **THEN** the Session pauses for the existing Permission decision or fails with a stable denial
- **AND** no Skill script or external tool is executed

#### Scenario: Cancellation is terminal

- **GIVEN** Skill activation or a Skill-driven tool request is pending
- **WHEN** the user cancels the run
- **THEN** the pending request is resolved as cancelled
- **AND** no later Skill/tool event claims success

### Requirement: Keep Skill execution inside existing tool boundaries

Skill instructions SHALL not create a bypass around coding-loop tools, file sandboxing, HTTP policy, or Permission decisions; all side effects SHALL remain observable as normal tool events.

#### Scenario: Skill requests a shell check

- **GIVEN** the Skill instructions request a local script check
- **WHEN** the model attempts to run it
- **THEN** the request appears in the normal Permission queue with its bounded resource
- **AND** allow/deny/cancel produces the same terminal semantics as any other tool request
