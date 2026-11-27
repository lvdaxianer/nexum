# Local JavaScript function calling

[中文](../zh-CN/capabilities/local-functions.md)

Local JavaScript functions are an in-process tool mode. They are registered
directly on a Runtime, exposed to the model with JSON Schema definitions, and
executed without a network hop or child process.

## Register functions

```ts
import { createEmbeddedRuntime } from "nexum-ai/application"

const runtime = createEmbeddedRuntime({
  localFunctions: [{
    providerID: "project-tools",
    providerName: "Project Tools",
    functions: [{
      name: "create_issue",
      description: "Create an issue in the current project",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
        additionalProperties: false,
      },
      async execute(input, context) {
        return { issueID: await createIssue(input.title), sessionID: context.sessionID }
      },
    }],
  }],
})
```

The model sees the stable name
`local__project_tools__create_issue`. The function receives the validated
input and `{ sessionID, signal }`. Its result is converted to text for the
model; strings remain unchanged and other values are JSON encoded.

## Lifecycle and persistence

`runtime.localFunctions.register(provider)` and `unregister(providerID)` update
the catalog in place, so an active coding loop sees new definitions without
recreating the Runtime. Identical definitions are idempotent; the same stable
name with a different description or schema is rejected.

Function bodies are deliberately not serialized. A file or SQLite Runtime can
persist MCP configuration, but local JS handlers must be injected again when
the process starts. This keeps executable code inside the application boundary
and avoids treating JSON metadata as executable source.

Local functions and MCP tools share the same model catalog and `ToolPort`, but
use different namespaces: `local__...` for in-process functions and `mcp__...`
for MCP tools. Local function requests use the `local.call` permission action.
