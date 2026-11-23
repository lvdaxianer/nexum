# Spec Delta

## Purpose

让 Nexum 用户能够安全删除不再需要的 Session，同时清理该 Session 在本地运行时产生的历史数据。删除操作必须保留用户工作目录和全局模型配置，并在运行冲突或失败时提供可恢复的结果。

## ADDED Requirements

### Requirement: Session deletion SHALL remove Nexum-owned history but preserve the working directory

Nexum SHALL provide a DELETE operation for one Session that removes its metadata, canonical messages, persisted interactions, and replayable events without deleting the bound working directory or global model configuration.

#### Scenario: Delete a settled Session

- **WHEN** a caller deletes an existing Session whose status is `idle`, `completed`, `failed`, or `cancelled`
- **THEN** the service returns a successful deletion result, the Session is absent from subsequent lists, its Nexum-owned history is absent after restart, and its working directory still exists

#### Scenario: Delete an unknown Session

- **WHEN** a caller deletes a Session ID that does not exist
- **THEN** the service returns `404` with `NEXUM_SESSION_NOT_FOUND` and does not modify other Sessions or persistence files

#### Scenario: Delete a running Session

- **WHEN** a caller deletes a Session whose status is `running`
- **THEN** the service returns `409` with `NEXUM_SESSION_RUN_CONFLICT` and keeps the Session and all associated history unchanged

#### Scenario: Retry a completed deletion

- **WHEN** a caller repeats a DELETE request after the Session has already been deleted
- **THEN** the service returns the same stable `404` not-found contract and does not recreate or alter any data

### Requirement: The Session deletion interaction SHALL require confirmation and expose recoverable operation states

The UI SHALL require explicit confirmation before sending a deletion request, prevent duplicate confirmation while the request is pending, and keep the current Session visible with retryable feedback when deletion fails.

#### Scenario: Confirm deletion of the current Session

- **WHEN** the user opens Session actions, chooses delete, and confirms the warning
- **THEN** the UI sends one DELETE request, shows a pending state until the response succeeds, closes the event stream, removes the deleted Session from the list, and selects another Session or shows the empty state

#### Scenario: Cancel deletion confirmation

- **WHEN** the user opens the deletion confirmation and chooses to go back or presses Escape
- **THEN** no DELETE request is sent and the current Session remains selected

#### Scenario: Deletion fails

- **WHEN** the DELETE request fails because the Session is running, missing, or the service is unavailable
- **THEN** the UI stops the pending state, keeps the current Session and its input context, and announces a caller-safe message with a retry path
