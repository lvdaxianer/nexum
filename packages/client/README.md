# @opencode/client

Private generation target for clients derived directly from OpenCode's authoritative Effect `HttpApi`.

## 在整体架构中的位置

`@opencode/client` 是原 OpenCode 产品的生成式传输客户端，不承载 Coding Loop、权限决策或工具执行。Nexum 场景使用独立的 [`@nexum/client`](../nexum-client/README.md) 和 [`@nexum-protocol`](../nexum-protocol/README.md)，避免把原产品的完整 API 面积带入可组合 Runtime。

## Entrypoints

- `@opencode/client`: zero-Effect Promise client using `fetch`.
- `@opencode/client/effect`: rich Effect network client using an environment-provided `HttpClient`.

The generated surface includes every standard HTTP group from Server's concrete API. The build compiler reads `@opencode/server/api`; the generated Effect runtime imports a client-local projection built from Protocol, with a generation-equivalence test preventing transport drift. Custom transports such as the PTY WebSocket connection remain outside the generic HTTP client. Run `bun run generate` after changing the contract and `bun run check:generated` to detect committed-output drift.

The Effect entrypoint uses canonical decoded values such as `Session.ID`, `Location.Ref`, and `Prompt`. These datatypes come from the lightweight `@opencode/schema` package and are re-exported so callers depend only on the client surface. Protocol owns endpoint construction and middleware placement; Server supplies the concrete middleware keys used by the build-time API.

The Promise root remains structural and has no Core or Effect runtime dependency. `/effect` depends only on Effect, Schema, and Protocol and is browser-bundle safe. Bundle-boundary tests enforce both import graphs.

修改协议后必须重新生成并检查提交产物，避免客户端与服务端消息格式漂移。

Effect consumers construct canonical decoded inputs:

```ts
import { AbsolutePath, Location, OpenCode, Prompt } from "@opencode/client/effect"

const client = yield * OpenCode.make({ baseUrl: "https://opencode.example" })
yield *
  client.sessions.create({
    location: Location.Ref.make({ directory: AbsolutePath.make("/workspace") }),
  })
yield * client.sessions.prompt({ sessionID, prompt: Prompt.make({ text: "Hello" }) })
```
