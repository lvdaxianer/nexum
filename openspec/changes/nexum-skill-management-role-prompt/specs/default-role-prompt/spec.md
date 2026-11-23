# Spec Delta

## Purpose

为 Nexum 提供可持久化、可恢复且与 Skill 和 Session 历史隔离的全局默认角色提示词，让用户能够稳定地向模型声明语言、角色和回答风格偏好。

## ADDED Requirements

### Requirement: Persist and manage the default role prompt

Nexum SHALL store one global default role prompt independently from model credentials and Session messages, expose read/save/reset operations, and restore it from the configured data directory after restart.

#### Scenario: Save and restore a role prompt

- **GIVEN** a user saves a non-empty default role prompt
- **WHEN** Nexum restarts with the same data directory
- **THEN** the saved prompt is returned by the role prompt read operation
- **AND** it remains independent from model credential responses and Session history

#### Scenario: Reset to the built-in default

- **GIVEN** a custom default role prompt exists
- **WHEN** the user resets the role prompt
- **THEN** Nexum removes the custom value
- **AND** subsequent reads return the built-in default prompt

#### Scenario: Agent cannot modify global role policy

- **GIVEN** a Session Agent is executing user work
- **WHEN** it considers changing the default role prompt
- **THEN** the role prompt management operation is not available as an Agent tool
- **AND** only the explicit management surface can change it

### Requirement: Inject the default role prompt into every model call

Nexum SHALL include the current default role prompt as a system message in every model call, including new, resumed, continued, and compacted Session execution, without persisting that message as a user or assistant history entry.

#### Scenario: New Session receives the role prompt

- **GIVEN** a default role prompt is configured
- **WHEN** the first model call for a Session is created
- **THEN** the model input contains one system message with the configured prompt
- **AND** the Session history does not contain a duplicate visible message

#### Scenario: Resumed execution re-injects the role prompt

- **GIVEN** a Session resumes or continues after a previous model call
- **WHEN** the next model input is assembled
- **THEN** the current default role prompt is included again as system context
- **AND** the latest configured value is used

### Requirement: Preserve model interpretation and output

Nexum SHALL pass the role prompt text to the model without translating, rewriting, filtering, or post-processing the model's reasoning or output.

#### Scenario: Chinese preference remains a model instruction

- **GIVEN** the default role prompt asks the model to think and answer in Chinese
- **WHEN** Nexum sends a model request and receives its response
- **THEN** the request contains the original prompt text
- **AND** Nexum returns the model response without language conversion or output rewriting
