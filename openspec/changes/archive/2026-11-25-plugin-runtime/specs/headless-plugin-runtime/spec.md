# Spec Delta

## Purpose

为 Headless Runtime 提供可发现、可按需激活并可安全卸载的领域扩展入口，使用户能够通过 `@plugin` 或自然语言启用包含 Skill、Function 和 Workflow 的完整插件能力。

## ADDED Requirements

### Requirement: Discover plugins through safe top-level descriptors

The Runtime SHALL register each enabled Plugin as a top-level descriptor containing a stable ID, version, description, exported capability summary, routing metadata, and lifecycle status without executing the Plugin runtime or exposing host paths and secrets.

#### Scenario: Plugin descriptor is visible before activation
- **WHEN** a valid CRM Plugin is discovered
- **THEN** the Plugin Registry exposes its safe ID, description, exported capability summary, routing metadata, and `registered` status
- **AND** the Plugin implementation is not executed before activation

#### Scenario: Invalid Plugin is not activatable
- **WHEN** a Plugin manifest is missing a stable ID, has an incompatible version, or declares an invalid export
- **THEN** the Registry reports a stable validation diagnostic and non-ready status
- **AND** the Plugin cannot be activated

### Requirement: Resolve explicit and natural-language Plugin activation

The prompt pipeline SHALL activate a ready top-level Plugin either from an explicit `@<plugin-id>` mention or from an unmentioned user request whose intent uniquely matches the Plugin routing metadata; an explicit mention SHALL take precedence over automatic routing.

#### Scenario: Explicit Plugin mention activates deterministically
- **GIVEN** the `crm` Plugin is registered and ready
- **WHEN** the user submits `@crm 查询订单 123`
- **THEN** the prompt pipeline selects `crm` without semantic ambiguity
- **AND** the activation uses the same Plugin activation path as automatic routing

#### Scenario: Natural language request activates a unique Plugin
- **GIVEN** the `crm` Plugin describes order queries and is the unique eligible match
- **WHEN** the user submits `我的订单为什么还没有收到`
- **THEN** the Runtime selects and activates `crm`
- **AND** the original user request remains available to the activated Plugin context

#### Scenario: Ambiguous automatic routing does not activate a Plugin
- **GIVEN** multiple enabled Plugins match the same user request without a unique eligible winner
- **WHEN** the user submits the request without an explicit Plugin mention
- **THEN** the Runtime does not activate any matching Plugin automatically
- **AND** it preserves a recoverable clarification or fallback path

### Requirement: Activate plugins progressively and mount their internal capabilities

The Runtime SHALL load a Plugin implementation only after explicit or automatic activation, verify its dependencies and permissions, and make its declared internal Skills, Functions, Workflows, and Hooks available to the owning Session only after activation succeeds.

#### Scenario: Plugin activation mounts internal capabilities
- **GIVEN** `crm` has passed manifest validation and activation permission
- **WHEN** the Runtime activates `crm`
- **THEN** the Plugin implementation is loaded and mounted
- **AND** its internal capabilities become available to the owning Session

#### Scenario: Activation failure leaves capabilities unavailable
- **GIVEN** a Plugin runtime fails dependency initialization or activation
- **WHEN** activation is attempted
- **THEN** the Plugin reaches a stable failed status with a caller-safe diagnostic
- **AND** none of its internal capabilities are exposed to the Session

### Requirement: Keep plugin internals hidden from direct Skill mentions

The Runtime SHALL treat a Plugin as the only user-facing `@` target for its package, while Plugin-provided Skills, Functions, and Workflows SHALL be selectable only by the model, Router, or Workflow after the Plugin is active.

#### Scenario: Plugin internals are not independent mentions
- **GIVEN** `crm` exports `customer-support` and `order.query`
- **WHEN** the user submits `@crm/customer-support` or `@crm/order.query`
- **THEN** the prompt pipeline does not treat either value as a valid standalone mention
- **AND** the user can activate the package through `@crm`

#### Scenario: Activated Plugin exposes internal capabilities to execution
- **GIVEN** the user activated `@crm`
- **WHEN** the model needs to answer an order question
- **THEN** the model can select the mounted `order.query` capability
- **AND** the capability remains namespaced to `crm` for runtime and audit purposes

### Requirement: Enforce Plugin permission and lifecycle boundaries

Plugin activation, internal side effects, and deactivation SHALL remain subject to existing Permission, Session, Tool, and Event boundaries; deactivation SHALL withdraw the Plugin's registrations and settle or cancel its owned work without claiming successful execution.

#### Scenario: Denied Plugin activation does not run code
- **GIVEN** the active policy denies Plugin use
- **WHEN** the user explicitly or automatically selects the Plugin
- **THEN** the Runtime requests or reports the existing permission decision
- **AND** it does not execute or mount the Plugin implementation

#### Scenario: Deactivation removes Plugin capabilities
- **GIVEN** an active Plugin has registered internal capabilities and background work
- **WHEN** the Plugin is deactivated
- **THEN** its internal capabilities are no longer eligible for new calls
- **AND** its owned work reaches a terminal cancelled or failed state before deactivation completes
