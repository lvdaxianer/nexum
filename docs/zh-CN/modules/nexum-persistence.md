# `nexum/persistence`

[English](../../modules/nexum-persistence.md)

源码模块：`@nexum/persistence`。用户安装唯一公共包 `nexum` 后，从 `nexum/persistence` 导入持久化契约和 Store 实现。

状态：现状基线

权威来源：[`packages/nexum-persistence/src/index.ts`](../../../packages/nexum-persistence/src/index.ts)、[`packages/nexum-persistence/README.md`](../../../packages/nexum-persistence/README.md)

最后核对：2026-11-24

## 职责

`@nexum/persistence` 是 Core Port 的默认持久化实现层。它提供文件/内存 Store、Event Hub 和可恢复状态，但不承载 Skill、Tool、Permission 判定或 Runtime 编排。

当前持久化范围包括 Session、Message、Interaction、Model Config、Role Prompt、Permission Policy、Skill 注册、Event 和 Memory。策略判定仍由 Core 负责，本包只保存策略状态。

## 公开 API

入口 [`src/index.ts`](../../../packages/nexum-persistence/src/index.ts) 导出：

- Session/Message/Interaction：`createFileSessionStore`、`createInMemorySessionStore`、`createFileMessageStore`、`createInMemoryMessageStore`、`createFileInteractionStore`。
- Runtime 配置：File/In-memory Model Config、Role Prompt、Permission Policy、Skill Registration Store。
- Event/Memory：`createNexumEventHub`、`createFileMemory`、`createInMemoryMemory`。

各 Store 通过 Core 接口提供最小读写能力。调用方由 Application 选择文件或内存实现，Server 不应复制 Store 的读写逻辑。

| API                               | 参数                      | 返回值          | 作用                          |
| --------------------------------- | ------------------------- | --------------- | ----------------------------- |
| `createInMemorySessionStore()`    | 无                        | `SessionStore`  | 创建进程内 Session 存储       |
| `createFileSessionStore(options)` | `filePath`                | `SessionStore`  | 使用 JSON 文件保存 Session    |
| `createInMemoryMessageStore()`    | 无                        | `MessageStore`  | 创建进程内消息历史存储        |
| `createFileMessageStore(options)` | `filePath`                | `MessageStore`  | 使用 JSON 文件保存消息历史    |
| `createNexumEventHub(options?)`   | `filePath?`、保留策略选项 | `NexumEventHub` | 发布、订阅和回放 Runtime 事件 |
| `createInMemoryMemory(options?)`  | Memory 配置可选           | `MemoryPort`    | 创建进程内记忆实现            |

具体 Runtime 组合优先使用 `nexum/application` 的创建器；只有需要替换单个 Store 或实现自定义 Persistence 时，才直接调用这些 API。

## 持久化与恢复

`createLocalRuntime` 默认把数据写入 `.nexum`：

```text
sessions.json          messages.json          interactions.json
model-config.json      role-prompt.json       skills.json
permission-policies.json  events.json         memory.json
```

文件路径可由 Application 的 `NexumRuntimeStorageOptions` 覆盖。Event Hub 保存事件序列并支持按游标重放；Interaction 恢复后可标记为 orphaned，旧请求 ID 不应继续回复。内存 Store 仅用于测试或显式嵌入场景。

## 依赖边界

Persistence 依赖 Core 的端口和类型，不依赖 Application、Server、Client 或 UI；Application 组合它，Server 通过 Application 访问它。事件与 Session 的公共行为见 [`docs/capabilities/events.md`](../capabilities/events.md) 和 [`docs/capabilities/session.md`](../capabilities/session.md)。

## 修改同步清单

- 修改文件名、序列化字段或恢复状态：同步 Application、Test POC、Session/Events 能力文档和 Server 测试。
- 修改 Event Hub 游标/重放：同步 [`apis/nexum.md`](../../../apis/zh-CN/nexum.md) 的 SSE 章节与 [`docs/capabilities/events.md`](../capabilities/events.md)。
- 新增 Store：同步 [`@nexum/application`](./nexum-application.md) 的 Runtime 组合说明和持久化测试。
