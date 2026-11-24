# Context 与 History 能力

状态：现状基线

权威来源：`packages/nexum-core/src/context.ts`、`packages/nexum-core/src/index.ts`、`packages/nexum-integrations/src/project-context.ts`、`packages/nexum-persistence/src/message-store.ts`

最后核对：2026-11-24

## 1. 三类内容边界

Nexum 将模型可见上下文分成三类：

| 内容                                          | 是否写入 canonical history | 用途                        |
| --------------------------------------------- | -------------------------- | --------------------------- |
| 用户、assistant、tool、需要保留的 system 消息 | 是                         | Session 恢复和下一次 Prompt |
| 角色 Prompt、Skill 指令、项目上下文           | 默认否                     | 当前模型请求的临时注入      |
| Context summary                               | 是                         | 上下文压缩后的可恢复摘要    |

普通历史查询不得返回临时注入内容原文、工具定义或模型凭据。`sourceID` 用于识别和去重 system 来源；例如 Skill 使用 `skill:<id>`，压缩摘要使用 `context:summary`。

## 2. 项目上下文

`ProjectContextPort` 接受带 `sourceID`、`kind`、`path` 的来源描述，当前 `kind` 为 `instruction`、`skill` 或 `reference`。本地适配器读取存在的文件，缺失文件被跳过，并按 source ID 去重。

每次模型请求前，Core 将项目上下文作为 system message 插入首个非 system 消息之前，并发布 `context.project.loaded`，事件只包含来源 ID、类型和路径。项目上下文不因为一次加载而自动写入历史。

## 3. 压缩流程

配置 `ContextCompactionPort` 后，Core 先用 `estimate(messages)` 估算 token；达到 `compactionThreshold` 或模型返回 `context_overflow` 时：

1. 发布 `context.compaction.started`，包含估算值；强制压缩额外标记 `reason: context_overflow`。
2. 调用 `compact({ messages, keepRecent })` 生成 summary、项目 context 和最近消息。
3. 成功发布 `context.compaction.completed`，包含 `summaryLength`、`keptMessages`。
4. 形成 `Context summary` system message、项目上下文和最近 canonical 消息。
5. 移除本轮临时 Skill/项目来源，避免它们被重复落盘；将新的 canonical history 保存到 MessageStore。

压缩失败发布 `context.compaction.failed` 并抛出原始运行错误。UI 应显示可恢复错误，不清空已有历史。

## 4. 历史读取与恢复

MessageStore 提供按 Session 的 `load`、`save`、`delete`。内存实现用于嵌入式和测试；本地 Runtime 默认使用 JSON 文件 Store，写入采用临时文件加 rename，并串行化同一 Store 的写入。

Server 的实验性 messages 端点提供有界分页和 `snapshotID`；页面加载最新页后向上滚动读取更早消息。快照变化时重新从最新页加载，避免把压缩前后的消息拼成错误顺序。历史、Session state 和 SSE 事件是不同读取模型，恢复时必须组合使用。

## 5. 可恢复消息类型与脱敏

canonical history 保持用户消息、assistant 文本/reasoning、assistant tool calls、tool results 和压缩 summary 的顺序。Server 会将内部 ModelMessage 转换成公共 `NexumMessage`，并通过安全映射避免泄露凭据形状的值。

角色 Prompt、Skill 原文和项目文件内容只在模型请求中临时存在；调用方若需要展示激活状态，应使用 `skill.activated`、`context.project.loaded` 和压缩事件，而不是读取内部 system message。

## 6. 相关入口

- [Session 会话能力](session.md)
- [事件与 SSE](events.md)
- [Session History 规范](../../openspec/specs/headless-session-history/spec.md)
- [Context 压缩测试](../../packages/nexum-core/test/context-compaction.test.ts)
- [Project Context 测试](../../packages/nexum-core/test/project-context.test.ts)
- [Message Store 测试](../../packages/nexum-persistence/test/message-store.test.ts)
