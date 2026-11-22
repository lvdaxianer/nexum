# Spec Delta

## Purpose

为 Nexum 提供不携带默认基础设施的 Core，使同一套 Agent Loop、Session 语义和上下文压缩能力可以被不同 Adapter、Protocol 和交互面组合。

## ADDED Requirements

### Requirement: Core SHALL depend only on pure contracts and domain semantics

Core SHALL NOT import filesystem, process, network transport, model SDK, MCP transport, concrete persistence, Server, Protocol, Client or Surface packages. Core SHALL expose only semantic contracts, lifecycle, errors and execution behavior.

#### Scenario: Import Core without infrastructure
- **WHEN** a host imports `@nexum/core` in an environment without filesystem, process and network adapters
- **THEN** the import SHALL succeed without creating or probing any infrastructure resource

#### Scenario: Boundary audit finds concrete implementation
- **WHEN** a Core source file imports a concrete store, local host, model SDK or Surface package
- **THEN** the boundary test SHALL fail with the offending file and import

### Requirement: Core SHALL require explicit ports

Core SHALL receive required Model, Tool, Permission, Session, Message and Event implementations through explicit dependencies and SHALL NOT create hidden fallbacks.

#### Scenario: Start with all required ports
- **WHEN** the host supplies all required ports
- **THEN** Core SHALL start and execute a prompt

#### Scenario: Start without a required port
- **WHEN** the host omits a required port
- **THEN** Core SHALL return a stable configuration error before model execution

### Requirement: Core SHALL preserve session execution semantics

Core SHALL preserve durable admission, inbox delivery, steering, compaction priority, process-local execution coordination and one explicit model stream per step while allowing every infrastructure port to be replaced.

#### Scenario: Replace storage and model ports
- **WHEN** a host supplies different Session, Message and Model implementations
- **THEN** the same Core loop SHALL preserve event ordering and completion semantics
