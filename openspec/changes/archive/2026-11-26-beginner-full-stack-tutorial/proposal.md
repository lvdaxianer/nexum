# Proposal

## Why

当前 README 已经有组合案例索引，但小白仍然需要自己在后端、SQLite、Client 和 Chat Surface 文档之间拼出一条完整路径。需要一个从安装到看到聊天界面的手把手教程。

## What Changes

- 在根 README 增加“手把手构建一个完整 Agent 应用”模块。
- 增加一个前后端完整教程：后端使用 SQLite Persistence，Server 提供 HTTP/SSE，前端使用 Client、Surface Adapter 和 Chat Surface。
- 按步骤解释模型配置、角色提示词、Session、`directory`、`baseUrl` 和 SSE 事件。
- 在案例索引和文档中心中增加该教程入口。

## Non-Goals

- 不修改运行时实现、协议路由或发布产物。
- 不加入仓库 workspace 启动、测试或源码安装流程。

## Acceptance Criteria

- 小白只看 README 的教程入口，就能理解后端、前端和 SQLite 的职责。
- 教程包含服务端和前端的完整代码片段，并链接每个相关模块/协议文档。
- 教程明确说明模型服务地址、后端工作目录和前端 Server 地址不是同一个参数。
