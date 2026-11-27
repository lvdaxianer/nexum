# Example: Local file Persistence

[中文](../zh-CN/examples/local-file-runtime.md)

## When to use this

Use File Persistence for a local CLI, desktop, or single-user application that
must keep Sessions, messages, events, and role configuration after restart.

## Composition

```text
Local application
  └─ nexum-ai/application
       ├─ nexum-ai/persistence/file
       ├─ nexum-ai/core
       └─ ModelPort
```

## Example

```ts
import { createLocalRuntime } from "nexum-ai/application"

const runtime = createLocalRuntime({
  dataDirectory: ".nexum",
})

await runtime.modelConfig.update({
  baseUrl: "https://api.example.com/v1",
  model: "example-model",
  credentialRef: "MODEL_API_KEY",
})

await runtime.rolePrompt.update("You are a long-running project assistant.")

const session = await runtime.sessionService.create({
  directory: process.cwd(),
  name: "local-project",
})

await runtime.codingLoop.run({
  sessionID: session.sessionID,
  text: "Record the three most important issues in this project",
})

console.log(await runtime.sessionService.list())
await runtime.close()
```

`dataDirectory` is where Nexum stores runtime data. `directory` is where the
Agent is allowed to work; they are different values.

## Parameters

| Parameter | Meaning |
| --- | --- |
| `dataDirectory` | Persistence directory for Sessions, messages, events, interactions, and configuration |
| `directory` | Agent working directory; it is not the Persistence directory |
| `rolePrompt` | Runtime-level role instruction stored with the configuration |
| `text` | Current user task; previous history is loaded by Nexum |

## What is persisted?

The file implementation stores Sessions, messages, events, interactions, model
configuration, role prompts, permission policies, Skill registration, and
Memory. Put the data directory in the application data location and do not
commit credentials or runtime data to source control.

## Related references

- [File Persistence API](../modules/nexum-persistence-file.md#public-api)
- [Session guide](../capabilities/session.md)
- [Context and History](../capabilities/context-and-history.md)
