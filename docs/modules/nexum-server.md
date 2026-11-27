# `nexum-ai/server`

[中文](../zh-CN/modules/nexum-server.md)

Import `startNexumServer` from `nexum-ai/server` to expose a composed Runtime over
HTTP/SSE.

## Responsibility

Server owns routing, JSON envelopes, SSE delivery, and the HTTP boundary for
Session, model, role prompt, Permission, Question, Skill, and capability APIs.
It does not own Core decisions or UI rendering.

## Public API

```ts
import { startNexumServer } from "nexum-ai/server"

const server = await startNexumServer({
  hostname: "127.0.0.1",
  port: 4097,
})

await server.stop()
```

| Option | Meaning |
| --- | --- |
| `runtime` | Already-composed `NexumDefaultRuntime`; otherwise a default is created |
| `hostname` | HTTP listen address |
| `port` | HTTP listen port |
| `authToken` | Bearer token for non-loopback deployment |
| `rolePromptStore` | Custom role prompt store |
| `rolePromptFile` | Role prompt file path |

The return value is a `NexumServer` handle with `url` and `stop()`.

## Routes and references

Session routes create, list, update, delete, and read state/history. Prompt,
continue, and cancel drive execution; events are delivered as ordered SSE;
Permission and Question routes expose pending interactions and replies. Read
the [Runtime API](../../apis/nexum.md) for exact paths and payloads.

For non-loopback deployment, configure authentication and a safe host policy.
Server is the transport boundary; Persistence and Application remain the owners
of storage and runtime composition.

## Capability mapping

| Capability | Server behavior |
| --- | --- |
| Health/Capabilities | Return protocol identity, supported operations, and event types |
| Model/Role Prompt | Read, update, reset, and probe Runtime configuration |
| Session | Create, list, update, delete, and read state/history |
| Prompt/Continue/Cancel | Start, resume, or cancel a run |
| Events | Deliver ordered Session events over SSE |
| Permission/Question | Expose pending items and replies |
| Skill | Expose discovery, registration, refresh, validation, and removal |

When a capability is loaded asynchronously, Server returns what is available
now. Client code should refresh the matching list or item when its update event
arrives; Server should not turn plugin loading into a request timeout.
