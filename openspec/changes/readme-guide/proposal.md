# Proposal

## Why

当前根 README 已经包含架构、模块和启动说明，但阅读顺序偏向内部设计，第一次接触 Nexum 的使用者仍需要自行拼出“它是什么、能做什么、应该组合哪些包以及如何启动”。同时，根 README 对三个 Persistence 实现包和真实 Runtime 入口的说明不完整，容易造成模块边界和示例与源码漂移。

本次调整以使用者/集成方为优先，把 Nexum 的定位、能力、模块边界、组合方式和可复制的使用路径组织成一条清晰主线。

## What Changes

- 重排根 `README.md`，先解释 Nexum 是什么、解决什么问题、能做什么，再进入架构、模块和深入文档。
- 用 Core、Persistence、Integrations、Application、Protocol、Surface、Test 七类边界说明模块职责和依赖方向。
- 补充 `@nexum/persistence-memory`、`@nexum/persistence-file`、`@nexum/persistence-sqlite` 的职责和选择建议。
- 增加进程内、本地持久化、SQLite Server 三种真实 Runtime 组合示例，并说明如何替换 Model、Persistence、Host 等 Port。
- 保留 Test Workbench、Server、CLI 的快速开始，同时把命令与当前 root/package scripts 对齐。
- 更新 README 的模块地图、文档导航和项目状态，避免把未列出的包或过时的状态描述当成当前事实。

## Capabilities

### New Capabilities

无。本变更只调整文档表达和导航，不引入新的运行时行为。

### Modified Capabilities

无。本变更不改变现有能力的 REQUIREMENTS。

## Impact

- 主要修改根 `README.md`，依据 `package.json`、各包 `package.json`、Application/Server/Client 公开入口和现有 `docs/`、`packages/` 文档进行核对。
- 不修改 Protocol、HTTP/SSE 路由、生成文件、运行时依赖或 Changesets。
- 需要执行 Markdown 差异检查、README 本地链接检查、文档格式检查和仓库 canonical `bun run check`。
