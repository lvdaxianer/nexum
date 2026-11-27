# Example: SQLite + HTTP/SSE service

[中文](../zh-CN/examples/sqlite-http-runtime.md)

## When to use this

Use this composition when Web, desktop, CLI, or another language needs to call
the same runtime. The Server owns HTTP/SSE, the Client consumes the protocol,
and SQLite provides durable storage.

## Composition

```text
Web / Desktop / CLI / another language
             │
       Protocol + Client
             │ HTTP/SSE
           Server
             │
 Application + Core + SQLite Persistence
```

## Server composition

```ts
import { createSqliteRuntime } from "nexum-ai/application"
import { startNexumServer } from "nexum-ai/server"

const runtime = await createSqliteRuntime({
  databasePath: ".nexum/nexum.db",
})

await runtime.modelConfig.update({
  baseUrl: "https://api.example.com/v1",
  model: "example-model",
  credentialRef: "MODEL_API_KEY",
})

await runtime.rolePrompt.update("You are a reliable internal project assistant.")

const server = await startNexumServer({
  runtime,
  hostname: "127.0.0.1",
  port: 4097,
})

console.log(server.url)
```

`databasePath` is the SQLite file used for Session, message, event, and runtime
data. The Server exposes the already-composed runtime; it does not replace the
runtime's execution or persistence rules.

## Client composition

```ts
import { Nexum } from "nexum-ai/client"

const client = Nexum.make({ baseUrl: "http://127.0.0.1:4097" })
const session = await client.experimental.nexum.session.create({
  directory: "/workspace/demo",
  name: "demo",
})

await client.experimental.nexum.session.prompt({
  sessionID: session.id,
  text: "Summarize this project",
})

for await (const event of client.experimental.nexum.session.events({
  sessionID: session.id,
})) {
  console.log(event.type, event.data)
}
```

| Parameter | Passed to | Meaning |
| --- | --- | --- |
| `databasePath` | `createSqliteRuntime` | SQLite database file |
| `baseUrl` | `Nexum.make` | Nexum Server URL, not the model URL |
| `directory` | `session.create` | Agent working directory on the Server host |
| `sessionID` | `session.prompt/events` | Target Session identifier |
| `text` | `session.prompt` | User's task |
| `afterSequence` | `session.events` | Cursor used to resume after a disconnect |

For authentication and non-loopback deployment, read [Server API](../modules/nexum-server.md#public-api).
For the complete request/response contract, read the [Runtime API](../../apis/nexum.md).

## Related references

- [SQLite Persistence](../modules/nexum-persistence-sqlite.md)
- [Server](../modules/nexum-server.md)
- [Client](../modules/nexum-client.md)
- [Runtime API](../../apis/nexum.md)
