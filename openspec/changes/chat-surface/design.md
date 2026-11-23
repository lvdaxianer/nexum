# Design

## Context

现有聊天状态、事件订阅、历史分页、Permission、Question、Skill 和 Composer 逻辑集中在 `packages/nexum-surfaces/src/main.tsx`，同时与 Session、模型、Role Prompt 和 Skill 注册管理耦合。既有 `@nexum/client` 已提供 Nexum Protocol 的 JSON/SSE 客户端，Server 和 Core 已经定义历史、运行生命周期、Permission、Question 与 Skill 的行为契约。本设计只抽取 UI 和客户端编排，不修改 Protocol 端点。

## Goals / Non-Goals

**Goals:**

- 建立独立的 `@nexum/chat-surface` 包，提供 Solid `ChatSurface` 和 `<nexum-chat>` Web Component。
- 让宿主只通过稳定的 Session ID 和连接配置嵌入完整聊天体验。
- 将 Protocol 调用集中到一个可替换的聊天适配器，避免视图直接散落调用客户端方法。
- 保留已有历史恢复、SSE 游标、事件去重、Permission、Question、`@skill` 和运行控制行为。
- 通过轻量 DOM 和 CSS Variables 支持独立页面、内嵌区域、Modal 和 Drawer。

**Non-Goals:**

- 不在 ChatSurface 内创建、切换、重命名或删除 Session。
- 不在 ChatSurface 内管理模型配置、Role Prompt 或 Skill 注册生命周期。
- 不新增或修改 HTTP/SSE Protocol 端点。
- 不实现文件上传；附件等待 Protocol 提供正式契约。

## Decisions

### 1. 使用独立包承载聊天能力

选择新增 `packages/nexum-chat-surface`，而不是继续在 `nexum-surfaces` 内导出页面级组件。这样页面级 Surface 可以作为宿主，嵌入方也可以只依赖聊天包；聊天包只依赖 `@nexum/client`、`@nexum/protocol` 和 Solid。

备选方案是直接从 `main.tsx` 导出组件，改动较少但会继续把页面管理依赖带入嵌入场景，不符合组件独立性目标。

### 2. 用 ChatProtocolAdapter 集中协议调用

组件内部依赖一个稳定的 `ChatProtocolAdapter`，覆盖历史、Session 状态、事件流、Prompt、Continue、Cancel、Permission、Question 和 Skill 列表。默认实现基于 `@nexum/client`，测试和宿主可以注入替代实现。

组件不直接调用 Skill 激活接口。用户提交包含 `@skill` 的原始文本，由 Server/Core 按现有 Skill Invocation 和 `skill.use` Permission 语义处理；组件只负责列表补全、保留 mention、展示请求和结果。

### 3. 用 Session 代际和 AbortController 防止陈旧结果污染

每次 `sessionID` 变化或重新连接都递增本地代际并取消旧的 SSE 请求。异步历史响应、状态快照和事件只有在代际仍匹配且 Session ID 未变化时才能写入 UI 状态。事件按 `eventID` 和 sequence 去重，并从最后确认的 sequence 恢复。

### 4. 组件状态按交互状态建模

状态至少区分连接中、已连接、运行中、等待 Permission、等待 Question、重试中、已完成、失败、已取消和断线重连。所有发送、审批、回答、继续和取消操作在请求 pending 时禁用等价重复触发；失败保留输入和上下文并提供可恢复操作。

### 5. Web Component 使用轻量 DOM

Web Component 外壳负责属性与 Solid 生命周期桥接，使用普通 DOM 渲染，不启用 Shadow DOM。组件通过 `session-id`、`api-base-url` 等属性/属性对象接收配置，通过 CSS Variables 和语义事件支持宿主定制。这样 Modal 和宿主页面可以直接控制尺寸、主题和布局。

### 6. 页面迁移采用宿主替换

现有 `nexum-surfaces` 页面继续保留 Session、模型、Role Prompt、Skill 注册和策略管理；中间聊天区域替换为 ChatSurface，并将当前 Session ID 和 API 配置传入。聊天逻辑迁移后删除页面中的重复状态和事件处理，避免两套聊天状态并存。

## Risks / Trade-offs

- [大入口拆分风险] `main.tsx` 同时包含页面和聊天逻辑，迁移可能影响现有 smoke 测试 → 先为适配器和关键状态建立定向测试，再逐步替换宿主区域并运行完整 Surface smoke。
- [事件恢复风险] 重连时可能收到历史事件或重复事件 → 使用事件 ID、sequence 和 Session 代际三重校验，保留服务端游标语义。
- [嵌入样式风险] 轻量 DOM 可能受宿主 CSS 影响 → 所有核心类名前缀化，提供 CSS Variables，并在独立页面和 Modal 尺寸下验证。
- [Skill 列表过大风险] 补全列表可能扩大渲染和网络负担 → 继续使用安全摘要，并在适配器中保留显式查询/分页扩展点；第一版按现有受控 Skill 列表工作。
- [外部组件生命周期风险] Web Component 被卸载时可能遗留 SSE 连接 → disconnect、Session 切换和组件卸载统一调用 AbortController 清理路径。

## Migration Plan

1. 在新包中先建立适配器契约、默认 Nexum 实现和状态/事件投影测试。
2. 将当前聊天区域迁移到 `ChatSurface`，保留外层页面管理能力。
3. 注册 Web Component，并增加独立页面和 Modal 容器的 smoke 覆盖。
4. 在现有页面验证功能后删除已迁移的聊天状态、处理函数和重复样式。
5. 如需回滚，恢复页面直接渲染旧聊天区域；新包不修改服务端数据或协议，因此不会产生数据迁移问题。
