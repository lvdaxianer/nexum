# Spec Delta

## Purpose

将交互呈现从具体 UI 框架中抽象为可扩展 Surface Adapter，为 Web、TUI、CLI、Desktop、Mobile 和 Headless 场景提供统一的状态映射边界。

## ADDED Requirements

### Requirement: Surface adapters SHALL be protocol consumers

Surface adapters SHALL consume Protocol/Client state and SHALL NOT import Core or create Runtime infrastructure.

#### Scenario: Web surface consumes a session
- **WHEN** the Web surface receives protocol events
- **THEN** it SHALL update normalized interaction state without calling Core directly

### Requirement: Surface naming SHALL remain scenario-neutral

The public package SHALL use `@nexum/surfaces` and SHALL permit subpaths for different presentation scenarios without changing Core or Protocol contracts.

#### Scenario: Add a TUI surface
- **WHEN** a TUI adapter is added
- **THEN** it SHALL reuse the same Client and Protocol contracts as the Web surface
