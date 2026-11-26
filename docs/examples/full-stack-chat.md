# 手把手构建一个完整 Agent 应用

这篇教程带你从零组合一个最小的 Agent 应用：后端使用 SQLite 保存数据，通过 Nexum Server 提供 HTTP/SSE；前端使用 Nexum Client 和 Chat Surface 显示聊天界面。

完成后，你会得到下面这条链路：

```text
前端 Chat Surface
        ↓
Client + Surface Adapter
        ↓ HTTP/SSE
Nexum Server
        ↓
Application + Core + SQLite Persistence
        ↓
模型服务
```

## 第 1 步：安装 Nexum

Nexum 对外只发布一个 `nexum` 包，所有模块都从 subpath 导入：

```bash
npm install nexum
```

你会用到这些入口：

| 入口                                                                 | 用来做什么                               |
| -------------------------------------------------------------------- | ---------------------------------------- |
| [`nexum/application`](../modules/nexum-application.md)               | 创建 Runtime、Session 和 Coding Loop     |
| [`nexum/persistence/sqlite`](../modules/nexum-persistence-sqlite.md) | 保存 Session、消息和事件                 |
| [`nexum/server`](../modules/nexum-server.md)                         | 提供 HTTP/SSE 接口                       |
| [`nexum/client`](../modules/nexum-client.md)                         | 前端创建 Session、提交 Prompt 和订阅事件 |
| [`nexum/chat-surface`](../modules/nexum-chat-surface.md)             | 展示聊天界面                             |

## 第 2 步：创建后端 Runtime

后端先创建 SQLite Runtime。Runtime 是 Agent 真正运行的地方，负责 Session、模型、工具、权限和事件。

```ts
import { createSqliteRuntime } from "nexum/application"

const runtime = await createSqliteRuntime({
  databasePath: ".nexum/nexum.db",
})
```

这里的 `databasePath` 是后端保存 Runtime 数据的 SQLite 文件路径。它和 Agent 的工作目录不是一个概念：

- `databasePath` 保存 Session、消息、事件和配置；
- `directory` 告诉 Agent 可以在哪个项目目录中工作。

SQLite 的详细参数见 [SQLite Persistence API](../modules/nexum-persistence-sqlite.md#公开-api)。

## 第 3 步：配置模型和角色提示词

Runtime 创建后，需要告诉 Nexum 使用哪个模型服务，以及 Agent 应该扮演什么角色：

```ts
await runtime.modelConfig.update({
  baseUrl: "https://api.example.com/v1",
  model: "example-model",
  credentialRef: "MODEL_API_KEY",
})

await runtime.rolePrompt.update("你是一个可靠的项目助手。回答要清晰，不要编造执行结果。")
```

这几个参数的含义是：

| 参数            | 含义                                               |
| --------------- | -------------------------------------------------- |
| `baseUrl`       | 模型服务的地址，不是 Nexum Server 地址             |
| `model`         | 模型服务中的模型名称                               |
| `credentialRef` | 后端读取模型凭据的环境变量名                       |
| `rolePrompt`    | Agent 的默认角色提示词，会作为 system message 注入 |

角色提示词不需要随着每次用户 Prompt 重复传入。用户本次要完成的任务，会在后面通过 `text` 传递。

更多说明见 [Model / Runtime 能力](../capabilities/model-runtime.md) 和 [Integrations API](../modules/nexum-integrations.md#公开-api)。

## 第 4 步：把 Runtime 暴露为 Server

将刚刚创建好的 Runtime 交给 Server：

```ts
import { startNexumServer } from "nexum/server"

const server = await startNexumServer({
  runtime,
  hostname: "127.0.0.1",
  port: 4097,
})

console.log(`Nexum Server: ${server.url}`)
```

这里的 Server 不负责执行 Agent 业务，它主要负责：

- 接收前端的 Session 和 Prompt 请求；
- 把 Runtime 状态转换成 JSON 响应；
- 通过 SSE 推送文本、工具、权限、Question 和终态事件；
- 返回稳定的错误码。

完整接口见 [Nexum Runtime API](../../apis/nexum.md)。

## 第 5 步：前端创建 Session

前端通过 `nexum/client` 连接 Server，并创建一个 Session：

```ts
import { Nexum } from "nexum/client"

const API_BASE_URL = "http://127.0.0.1:4097"
const client = Nexum.make({ baseUrl: API_BASE_URL })

const session = await client.experimental.nexum.session.create({
  directory: "/workspace/demo",
  name: "我的第一个 Agent",
})
```

这里的 `directory` 是后端所在机器上的绝对路径，不是浏览器用户电脑上的路径。实际应用通常由后端根据用户选择的项目或工作空间生成这个值，而不是让浏览器随意提交任意目录。

创建成功后，`session.id` 就是后面交给聊天界面的 Session 标识。

Session 相关用法统一见 [Session 会话能力](../capabilities/session.md)，包括查询、切换、历史、重命名、删除、取消和继续；本教程只展示它如何和 Client、Chat Surface 组合。

## 第 6 步：查询和切换已有 Session

真实应用通常会在左侧显示 Session 列表。列表数据来自后端 SQLite，不需要前端直接读取数据库：

```tsx
import { For, Show, createSignal, onMount } from "solid-js"
import { Nexum, type NexumSession } from "nexum/client"

const API_BASE_URL = "http://127.0.0.1:4097"

export function SessionPicker(props: { onSelect: (sessionID: string) => void }) {
  const client = Nexum.make({ baseUrl: API_BASE_URL })
  const [sessions, setSessions] = createSignal<readonly NexumSession[]>([])
  const [selectedSessionID, setSelectedSessionID] = createSignal<string>()

  onMount(async () => {
    const nextSessions = await client.experimental.nexum.session.list()
    setSessions(nextSessions)
    if (nextSessions[0]) {
      setSelectedSessionID(nextSessions[0].id)
      props.onSelect(nextSessions[0].id)
    }
  })

  async function createSession() {
    const session = await client.experimental.nexum.session.create({
      directory: "/workspace/demo",
      name: `新的 Agent ${sessions().length + 1}`,
    })
    setSessions((current) => [session, ...current])
    setSelectedSessionID(session.id)
    props.onSelect(session.id)
  }

  return (
    <aside>
      <button type="button" onClick={() => void createSession()}>
        新建 Session
      </button>
      <For each={sessions()} fallback={<p>还没有 Session</p>}>
        {(session) => (
          <button
            type="button"
            onClick={() => {
              setSelectedSessionID(session.id)
              props.onSelect(session.id)
            }}
          >
            {session.name} · {session.status}
          </button>
        )}
      </For>
      <Show when={selectedSessionID()}>{(sessionID) => <p>当前 Session：{sessionID()}</p>}</Show>
    </aside>
  )
}
```

这里最重要的是两个值：

| 值                  | 作用                                            |
| ------------------- | ----------------------------------------------- |
| `sessions`          | 后端返回的 Session 列表，用来渲染左侧会话列表   |
| `selectedSessionID` | 用户当前选中的 Session ID，用来驱动右侧聊天区域 |

如果需要刷新列表，再次调用 `session.list()` 即可。Session API 的入口在 `client.experimental.nexum.session`，参数和返回值见 [Client Session 方法](../modules/nexum-client.md#session-方法参数)。

## 第 7 步：切换 Session 后回显聊天内容

把选中的 `sessionID` 传给 Chat Surface。当用户点击另一个 Session 时，只需要更新这个值：

```tsx
import { Show, createSignal } from "solid-js"
import { ChatSurface } from "nexum/chat-surface"
import "nexum/chat-surface/styles.css"

const API_BASE_URL = "http://127.0.0.1:4097"

export function App() {
  const [selectedSessionID, setSelectedSessionID] = createSignal<string>()

  return (
    <div>
      <SessionPicker onSelect={setSelectedSessionID} />
      <main>
        <Show when={selectedSessionID()} fallback={<p>请先选择一个 Session</p>}>
          <ChatSurface sessionID={selectedSessionID()!} client={{ baseUrl: API_BASE_URL }} title="我的 Agent" />
        </Show>
      </main>
    </div>
  )
}
```

实际页面通常把 `SessionPicker` 和上面的聊天区域放在同一个父组件中，并把 `setSelectedSessionID` 作为 `onSelect` 传给列表。切换 `sessionID` 后，Chat Surface 会自动：

- 加载 Session 历史；
- 加载 Session 当前状态；
- 订阅 SSE 事件；
- 显示流式文本和工具调用；
- 展示 Permission 请求并提交用户决定；
- 展示 Question 并提交答案；
- 支持取消和继续运行；
- 在刷新或断线后恢复状态。

UI 不需要自己实现 Coding Loop，也不需要解析模型文本来判断运行状态。组件通过 [Surface Adapter](../modules/nexum-surface-adapter.md) 消费 [Protocol](../modules/nexum-protocol.md) 和 [Client](../modules/nexum-client.md) 的数据。

如果你不使用 Chat Surface，而是自己实现聊天 UI，就需要手动读取目标 Session：

```ts
const state = await client.experimental.nexum.session.state({
  sessionID,
})
const history = await client.experimental.nexum.session.messages({
  sessionID,
  limit: 50,
})

for await (const event of client.experimental.nexum.session.events(
  { sessionID },
  { afterSequence: state.lastSequence },
)) {
  console.log(event.type, event.data)
}
```

`state()` 用来恢复状态，`messages()` 用来恢复聊天历史，`events()` 用来接收实时变化。完整字段说明见 [Session 会话能力](../capabilities/session.md) 和 [ChatSurface 参数](../modules/nexum-chat-surface.md#chatsurface-参数)。

## 第 8 步：理解一次请求是怎么走的

当用户在聊天框输入“总结项目结构”并发送时，数据会按下面的顺序流动：

```text
ChatSurface
  ↓ sessionID + text
Client
  ↓ HTTP POST /session/:id/prompt
Server
  ↓ 调用 Runtime
Coding Loop
  ↓ 读取角色提示词、历史、工具和权限
Model
  ↓ 输出文本或工具调用
Server
  ↓ SSE 事件
Client / ChatSurface
  ↓
用户看到结果
```

其中：

- `sessionID` 标识任务属于哪个 Session；
- `text` 是用户这一次输入的 Prompt；
- `rolePrompt` 是 Runtime 的默认角色；
- SQLite 保存可以恢复的历史和状态；
- SSE 事件负责把运行过程实时传回前端。

## 下一步可以替换什么

完成这个案例后，可以按需求替换单个模块：

- 想暂时不落盘：换成 [Memory Persistence](../modules/nexum-persistence-memory.md)；
- 想保存为 JSON 文件：换成 [File Persistence](../modules/nexum-persistence-file.md)；
- 想接入自己的模型：实现或注入 [ModelPort](../modules/nexum-core.md#公开-api)；
- 想换自己的 UI：保留 [Protocol](../modules/nexum-protocol.md) 和 [Client](../modules/nexum-client.md)，替换 Chat Surface；
- 想自己控制聊天交互：实现 [ChatProtocolAdapter](../modules/nexum-surface-adapter.md#公开-api)。

## 常见问题

### 为什么前端不能直接连接模型？

模型凭据和文件、Shell 等宿主能力应该留在后端。前端只连接 Nexum Server，通过 Protocol 和 Client 消费安全的状态与事件。

### `directory` 为什么是后端路径？

Agent 的工具在后端 Runtime 中执行，所以 `directory` 必须是后端能够校验和访问的工作目录。它不是浏览器本地文件路径。

### 我只想先验证调用链怎么办？

先看[进程内嵌入 Agent](embedded-runtime.md)；不需要 Server 和前端，确认 Runtime 工作后再升级到本教程的 SQLite + HTTP/SSE 组合。
