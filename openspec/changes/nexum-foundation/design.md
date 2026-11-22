# Design

## Context

当前 Headless POC 已经将 Session、Coding Loop、Tool、Permission、Question、Context、Skill 和事件流抽取到 `packages/headless-*`，但默认实现仍与 Core 入口、Server 装配和旧的 OpenCode/Headless 命名交织。现有 `packages/protocol`、`packages/client` 和 `packages/headless-server` 已形成协议绑定基础；本设计在保留已验证行为的前提下建立 Nexum 的公开边界。

## Goals / Non-Goals

**Goals:**

- 让 Nexum Core 只承载运行语义和替换端口，不直接依赖文件、HTTP、UI 或可选 SDK。
- 提供官方默认适配器和统一 Runtime Composer，支持 embedded、local 两种默认配置。
- 让 Protocol/Client/Server/UI 形成单向依赖，UI 只通过公开 Client 接入。
- 让 Nexum 成为包名、协议名、事件名、配置路径和默认环境变量的唯一公开身份。
- 保留现有 Headless 行为和测试语义，按任务逐步迁移，不重写已验证的 Agent Loop。

**Non-Goals:**

- 本变更不改完整 OpenCode Core、CLI、TUI、Desktop 的既有产品包名。
- 本变更不一次性实现所有企业认证、生产沙箱、向量数据库或远程 Worker。
- 本变更不把每个 Core 内部模块拆成独立 npm 包。
- 本变更不在协议层暴露 UI 框架组件或 Core 内部对象。

## Decisions

### 1. 使用六个稳定分发边界，避免按文件过度拆包

第一阶段将新包边界定义为：

```text
@nexum/core       # 纯 Core 语义和端口
@nexum/adapters   # 官方默认本地适配器与 Runtime Composer
@nexum/protocol   # 公开协议 Schema 与 API 描述
@nexum/client     # 协议客户端
@nexum/server     # HTTP/SSE 绑定与服务装配
@nexum/ui         # 默认参考应用
```

MCP 和 Memory 初期作为 `@nexum/adapters` 的可选子路径提供；当它们引入独立 SDK、存储驱动或发布节奏时，再拆成 `@nexum/mcp`、`@nexum/memory`。这样可以先建立替换边界，又避免在行为尚未稳定时创建过多包。

### 2. Core 与默认实现单向依赖

依赖方向固定为：

```text
@nexum/schema → @nexum/core
@nexum/schema → @nexum/protocol → @nexum/client
@nexum/core + @nexum/adapters + @nexum/protocol → @nexum/server
@nexum/client → @nexum/ui
```

Core 中保留 `ModelPort`、`SessionStore`、`MessageStore`、`EventSink`、`Host`、`MemoryPort` 和 `McpProvider` 等端口；OpenAI-compatible Model、文件/SQLite Store、本地 Host、MCP Client 和事件 Hub 放入 Adapters。协议包不得导入 Core，Client 不得导入 Core 或 Server。

### 3. 以默认 Runtime Composer 作为唯一装配入口

`@nexum/adapters` 提供 `createEmbeddedRuntime`、`createLocalRuntime` 和 `createDefaultRuntime`。Server 调用 Composer 获得 Runtime，再只负责传输、错误映射、认证边界和事件绑定。这样嵌入式测试、CLI、HTTP 服务和参考 UI 使用相同 Core 组合，而不是各自复制一份装配规则。

### 4. 复用现有 Protocol/Client 生成链路，但迁移公开命名

仓库现有 `packages/protocol` 是公共协议权威，`packages/client` 由协议生成客户端。第一阶段沿用这条生成链路，把 Headless API 纳入 Nexum 的协议命名和包出口，避免另建平行生成系统。公共 HttpApi 变更后继续从 Protocol 生成 Client，禁止手改 generated 文件。

### 5. 兼容策略只存在于迁移边界

旧的 `@opencode/headless-*`、`headless.v1`、`.headless` 和 `OPENCODE_HEADLESS_*` 只作为迁移输入或显式兼容读取，不作为新的默认输出。Nexum 默认只生成 `@nexum/*`、`nexum.runtime.v1`、`.nexum` 和 `NEXUM_*`。完整 OpenCode 产品包不在本变更中重命名，避免破坏上游产品链路。

### 6. 先迁移包身份，再拆默认实现

迁移顺序为：先为 Nexum 建立包与协议命名入口，再把当前已验证实现移动到默认适配器，最后接入 MCP/Memory 和生产级持久化。每一步都保持旧 Headless 测试可运行，直到新入口有等价契约测试后再删除旧入口。

## Risks / Trade-offs

- [包名迁移涉及生成客户端和大量文档] → 先更新 Protocol 源和 package metadata，再运行生成检查；不直接编辑生成文件。
- [当前工作树存在未跟踪临时脚本] → 原始集成工作树只读，所有迁移在任务 worktree 中进行，不清理用户文件。
- [Core 与默认适配器拆分时可能改变默认行为] → 为 `createDefaultRuntime` 增加组合契约测试，并复用现有 Headless Core/Server 测试矩阵。
- [MCP 和 Memory 依赖可能扩大安装体积] → 作为 Adapters 的可选子路径，未配置时能力发现明确标记未启用。
- [OpenCode 兼容入口长期残留] → 只允许在迁移适配层读取旧名称；新文档、事件、默认路径和 package exports 全部使用 Nexum。

## Migration Plan

1. 在 Nexum 任务 worktree 中创建 OpenSpec 规格和迁移检查清单。
2. 新增 Nexum 包入口和适配器组合骨架，先用契约测试锁定依赖方向。
3. 迁移 Headless Core/Server/UI 的公开包名、import、协议版本、环境变量和默认目录。
4. 将默认 Model、Store、Host、Event、Skill 实现移入 Adapters，并由 Runtime Composer 装配。
5. 加入 Memory 和 MCP 的端口、可选默认适配器与能力发现标识。
6. 重新生成 Protocol Client，运行包级测试、类型检查和根级 `bun run check`。
7. 验证旧 OpenCode 产品包没有被误改，完成文档/路径/事件的 Nexum 搜索审计。
8. 通过审计后合并任务分支；若需要兼容旧 Headless 调用，保留明确的迁移层而非继续扩大旧公开入口。

