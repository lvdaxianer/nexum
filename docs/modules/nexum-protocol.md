# `nexum-ai/protocol`

[中文](../zh-CN/modules/nexum-protocol.md)

Protocol contains cross-process and cross-language data models. Import types
from `nexum-ai/protocol`.

## Responsibility

Protocol defines versioned schemas, constants, envelopes, Session snapshots,
interaction payloads, capabilities, and event types. It does not perform HTTP,
execute a Session, persist data, or render UI.

## Public types

| Type | Key fields | Use |
| --- | --- | --- |
| `NexumSession` | `id`, `name`, `directory`, `status` | Public Session snapshot |
| `NexumSessionState` | `session`, `canContinue`, pending items, `lastSequence` | Page recovery |
| `NexumSessionMessages` | `messages`, `total`, `hasMore`, `snapshotID` | Paginated history |
| `NexumEvent` | `eventID`, `runID`, `sessionID`, `sequence`, `type`, `data` | Runtime event envelope |
| `NexumRolePrompt` | `prompt`, `source`, `updatedAt` | Role prompt snapshot |
| `NexumPermission`, `NexumQuestion` | request ID, Session ID, interaction data | Human-in-the-loop requests |

## How it is used

Server serializes these types, Client validates and consumes them, and Surface
packages project them into UI state. A custom client in another language only
needs to implement the same versioned envelope and event rules.

Protocol has no runtime dependency on Core, Application, Server, or UI. See the
[event guide](../capabilities/events.md) and the [Runtime API](../../apis/nexum.md).

## Protocol identity and envelope

The protocol identity is `nexum.runtime.v1`; the default HTTP prefix is
`/api/nexum`. JSON responses use `data` and `meta.protocolVersion`. SSE frames
use the same event envelope and keep `eventID`, `sessionID`, `sequence`, and
`type` explicit.

| Model | Used by | Purpose |
| --- | --- | --- |
| `NexumSession`, `NexumSessionState`, `NexumSessionMessages` | Server, Client, Chat Surface | Session lifecycle, recovery, and paginated history |
| `NexumEvent` | Server, Client, Surfaces | Ordered text, tool, interaction, and terminal facts |
| `NexumPermission`, `NexumQuestion` | Application, Server, Chat Surface | Human-in-the-loop requests and replies |
| `NexumPermissionPolicyRule` | Server, Client, CLI | Policy lookup and management |
| `NexumCapabilities` | Server, Client, Surfaces | Feature discovery and UI switches |
| `NexumSkill`, `NexumModelConfig`, `NexumRolePrompt` | Server, Client, Surfaces | Skill, model, and role configuration |

Protocol only describes data. Use Client or HTTP/SSE to create Sessions,
persist messages, and execute the model.
