# Nexum module boundaries

[中文](../zh-CN/architecture/module-boundaries.md)

Nexum keeps runtime semantics, environment adapters, transport, and UI as
replaceable layers.

| Layer | Owns | Does not own |
| --- | --- | --- |
| Core | Coding Loop, Session, Permission, Question, Context, Skill, ports, domain errors | HTTP, UI, concrete SDKs |
| Persistence | Session/message/event/memory stores and recovery data | Core decisions or UI |
| Integrations | Model, Host, project context, Skill sources, MCP transport | Session orchestration or HTTP |
| Application | Runtime Composer, Skill/Tool/Question services, configured loop | Page layout or transport details |
| Protocol | Versioned envelopes, schemas, capabilities, events | Network calls or storage |
| Client | HTTP/SSE encoding, validation, normalized errors | Core or Server internals |
| Server | HTTP/SSE routes, event delivery, runtime binding | UI rendering or policy decisions |
| Surface Adapter | Stable chat operations and error normalization | Core execution or UI layout |
| Chat Surface / CLI | User-facing projection and interaction | Runtime ownership |

## Dependency direction

```text
Schema / Protocol → Core → Server
                 ↘ Client
Application → Core + Persistence + Integrations
Surface → Surface Adapter → Client → Protocol
```

The public package is still one `nexum` package; these names are subpath
boundaries, not independent user installation targets. See the [module index](../modules/README.md).

## How a change crosses boundaries

Changing Session semantics belongs in Core and its Persistence projections;
changing an HTTP route belongs in Server, Protocol, Client, and the Runtime API;
changing how a chat card looks belongs in Surface or Chat Surface. Keep the
direction explicit so replacing SQLite, a model provider, a transport, or a UI
does not require rewriting the Agent loop.

| Need to change | Start at | Do not change directly |
| --- | --- | --- |
| Runtime semantics | Core ports and rules | UI components or HTTP handlers |
| Durable storage | Persistence implementation | Core's domain decisions |
| External model/files/MCP | Integrations adapter | Client or Surface |
| HTTP/SSE contract | Protocol and Server | Persistence internals |
| Browser or terminal display | Surface Adapter/Surface | Coding Loop |
