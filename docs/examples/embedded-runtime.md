# Example: Embed an Agent in an application

[中文](../zh-CN/examples/embedded-runtime.md)

## When to use this

Use this composition when your application already owns the UI, routing, and
task system and only needs to call an Agent in the same process. It does not
need HTTP or a Server. The default setup uses in-memory Persistence.

## Composition

```text
Your application
  └─ nexum-ai/application
       ├─ nexum-ai/core
       ├─ Memory Persistence
       └─ ModelPort
```

See [Application](../modules/nexum-application.md), [Core](../modules/nexum-core.md),
[Memory Persistence](../modules/nexum-persistence-memory.md), and
[Integrations](../modules/nexum-integrations.md).

## Example

```ts
import { createEmbeddedRuntime } from "nexum-ai/application"

const runtime = createEmbeddedRuntime()

await runtime.modelConfig.update({
  baseUrl: "https://api.example.com/v1",
  model: "example-model",
  credentialRef: "MODEL_API_KEY",
})

await runtime.rolePrompt.update("You are a concise, reliable coding assistant.")

const session = await runtime.sessionService.create({
  directory: process.cwd(),
  name: "embedded-demo",
})

await runtime.codingLoop.run({
  sessionID: session.sessionID,
  text: "Summarize the current project structure",
})

await runtime.close()
```

## Parameters in plain language

| Parameter | Meaning |
| --- | --- |
| `baseUrl` | Upstream OpenAI-compatible model URL, not the Nexum Server URL |
| `model` | Model name at the upstream provider |
| `credentialRef` | Environment/config reference used to load credentials |
| `rolePrompt` | Runtime-level system instruction applied before model calls |
| `directory` | Absolute working directory available to the Agent |
| `sessionID` | Session identifier returned by `sessionService.create()` |
| `text` | The task submitted by the user |

In-memory data disappears when the process closes. For restart recovery, use
[local file Persistence](local-file-runtime.md); for Web or another language,
use [SQLite + HTTP/SSE](sqlite-http-runtime.md).

## When to choose another example

This composition is process-local. Switch to [local file Persistence](local-file-runtime.md)
for restart recovery, or [SQLite + HTTP/SSE](sqlite-http-runtime.md) when the
Runtime must be called by Web, desktop, CLI, or another language.

## Related references

- [Application API](../modules/nexum-application.md#public-api)
- [Model and Runtime](../capabilities/model-runtime.md)
- [Session guide](../capabilities/session.md#session-api)
