# Design

## Context

根 README 是 Nexum 的公开入口，但当前内容把定位、架构、模块地图、快速开始和文档索引混在一起，且“三层架构”无法准确表达 Core、适配器、Application、Protocol 和 Surface 的职责差异。源码已经提供了三个可直接使用的 Runtime 组合入口：`createEmbeddedRuntime`、`createLocalRuntime` 和 `createSqliteRuntime`；README 应直接围绕这些入口组织使用说明。

## Goals / Non-Goals

**Goals:**

- 让新读者先理解 Nexum 的用途和能力，再选择运行方式和模块。
- 用与源码一致的模块分层解释 Core、Persistence、Integrations、Application、Protocol、Surface 和 Test。
- 给出进程内、文件持久化和 SQLite Server 三种可复制组合方式。
- 让根 README 的包地图覆盖当前所有一级 `packages/nexum-*` 包，并把详细内容链接到现有文档。

**Non-Goals:**

- 不修改任何 TypeScript、Protocol、HTTP/SSE 路由、依赖或生成文件。
- 不新增 API 文档、能力规范或 package。
- 不把 README 变成所有 API 字段的完整参考；细节继续由 `docs/`、`apis/` 和模块文档承载。

## Decisions

### 1. 采用“定位 → 能力 → 上手 → 组合 → 模块 → 深入文档”的顺序

开头用一句话说明 Nexum 是 UI 无关、协议优先、可组合的 Agent Runtime，紧接着列出 Session、Coding Loop、Tool/Permission、Question、Context、Skill、MCP、事件和恢复能力。快速开始放在架构之前，让使用者可以先运行 Test Workbench、Server/CLI，再理解内部边界。

### 2. 用七类模块边界代替三层架构

README 使用以下稳定分类：`@nexum/core` 承载领域语义；`@nexum/persistence` 及其 memory/file/sqlite 实现承载状态存储；`@nexum/integrations` 接入 Model、Host、目录和 MCP；`@nexum/application` 负责服务编排；`@nexum/protocol`、`@nexum/client`、`@nexum/server` 负责协议和传输边界；`@nexum/chat-surface`、`@nexum/surfaces`、`@nexum/cli` 负责交互 Surface；`@nexum/test` 负责跨层验证。

### 3. 组合示例只使用当前公开入口

示例分别使用：

- `createEmbeddedRuntime({ model })`：默认内存 Persistence，适合嵌入和测试；
- `createLocalRuntime({ dataDirectory })`：文件 Persistence，适合本地运行；
- `createSqliteRuntime({ databasePath })` 与 `startNexumServer({ runtime })`：SQLite 持久化的 HTTP/SSE 服务。

示例会补充 `runtime` 注入和 `Nexum.make({ baseUrl })` 的边界说明，不自行创造不存在的 API。

### 4. 快速开始与详细文档分层

根 README 只保留可复制命令、最小 TypeScript 片段、包选择表和导航。Session 生命周期、事件序列、Question/Permission 细节以及完整 API 继续链接到现有文档，避免根 README 与协议实现重复。

## Verification

- 检查 README 中列出的包目录、文档目标和源码入口均存在。
- 用脚本解析 README 的本地 Markdown 链接，确认目标文件或目录存在。
- 执行 `git diff --check` 和 README/相关 Markdown 的 Prettier 检查。
- 执行仓库根目录 `bun run check`；不从根目录运行测试。
