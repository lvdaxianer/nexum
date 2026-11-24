# Proposal

## Why

Nexum 的 UI 交互、Runtime Protocol、HTTP/SSE API 和 package 边界目前分散在源码、README、历史设计和 API 说明中，前后端协作时难以判断行为的权威来源和需要同步的文件。现在建立统一文档入口和按能力、模块分层的文档体系，可以在继续扩展 Surface 与 Runtime 之前固定协作语言，降低协议误读和文档漂移。

## What Changes

- 在根 `README.md` 增加文档总导航，直接链接架构、UI、能力、API 和全部 `nexum-*` 模块文档。
- 建立架构文档，说明 Protocol、Client、Server、Core、Application、Persistence、Integrations、Surface 和 Test 的边界及依赖方向。
- 建立 UI 交互文档，明确 Question、Permission、流式状态、取消、恢复、加载、错误和 UI 本地确认等协议与状态。
- 补齐 `apis/nexum.md` 的 Runtime API 路由覆盖、请求/响应契约、错误处理、SSE 语义和可运行示例。
- 为当前每个 `packages/nexum-*` 包建立一份模块文档，说明职责、公开入口、依赖、能力映射、测试和修改同步清单。
- 更新 `docs/README.md`、`apis/README.md` 和 `packages/README.md` 的入口关系，使它们回链根 README 并保持目录职责清晰。
- 建立文档同步规则和 Markdown 验证要求；不修改运行时行为、API 路由、Protocol 类型或生成的 Client 文件。

## Capabilities

### New Capabilities

无。本变更只建立文档和导航，不引入新的系统行为。

### Modified Capabilities

无。本变更不改变现有能力的 REQUIREMENTS。

## Impact

- 影响根 `README.md`、`docs/`、`apis/`、`packages/README.md` 和每个 `packages/nexum-*` 模块的文档入口。
- 需要依据 `packages/nexum-protocol`、`packages/nexum-server`、`packages/nexum-client`、`packages/nexum-chat-surface`、`packages/nexum-surfaces`、Core/Application/Persistence/Integrations 实现和测试核对内容。
- 不新增运行时依赖、不修改对外接口、不生成 OpenAPI、不引入 Changesets。
