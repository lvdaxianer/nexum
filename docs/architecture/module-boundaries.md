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
