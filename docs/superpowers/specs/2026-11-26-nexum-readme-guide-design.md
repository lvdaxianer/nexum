# Nexum README 使用者导向重组设计

## 目标

把根 README 从“架构资料汇总”整理成使用者和集成方可以顺序阅读的项目入口，回答 Nexum 是什么、能做什么、模块怎么划分、怎么使用以及如何组合。

## 设计

README 采用“定位 → 能力 → 快速开始 → 组合方式 → 模块地图 → 文档导航 → 项目状态”的顺序。定位部分明确 Nexum 是 UI 无关、协议优先、可组合的 Agent Runtime，不是绑定 UI 的完整产品；能力部分列出 Session、Coding Loop、工具与权限、Question、Context、Skill、MCP、事件和恢复等当前能力。

架构部分不再用容易造成误解的“三层架构”，而是按七类边界解释：Core、Persistence、Integrations、Application、Protocol/Client/Server、Surface 和 Test。Persistence 单独列出 memory、file、sqlite 三个实现包，并依据 workspace manifest 说明适用场景。

使用部分保留 Test Workbench、Server/CLI 两条命令路径，并新增三种以当前导出函数为依据的组合示例：进程内的 `createEmbeddedRuntime`、本地文件的 `createLocalRuntime`、SQLite + HTTP/SSE 的 `createSqliteRuntime`/`startNexumServer`。示例同时说明 Model、Persistence、Host 等端口可被注入替换。

## 范围

只修改根 README 的说明、示例、包地图、依赖图和文档导航；不修改运行时代码、协议、API、依赖或生成文件。详细 API 和能力说明继续链接已有 `docs/`、`apis/` 和模块文档。

## 验收

- 新读者可以只看 README 说明 Nexum 的定位、能力和适用场景。
- README 中的模块职责、依赖方向和 Runtime 函数与当前源码/manifest 一致。
- README 提供三条可复制使用路径，并能链接到全部当前一级 `nexum-*` 包。
- 本地 Markdown 链接、格式检查和 `bun run check` 通过。
