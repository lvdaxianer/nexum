# Tasks

## 1. Nexum 包与依赖边界

- [x] 1.1 建立 Nexum 基础包入口和包命名映射，确保 Core、Adapters、Server、Client、Protocol、UI 的公开 metadata 使用 Nexum 命名，并通过 workspace 依赖检查验证没有新的 `@opencode/*` 依赖进入 Nexum 包。
- [x] 1.2 将默认 Model、Session/Message/Interaction Store、Event Hub、Skill 文件注册和本地 Host 的具体实现迁移到默认适配器入口，保留 Core 端口并通过 Runtime 组合契约测试验证可替换性。
- [x] 1.3 增加 `createEmbeddedRuntime`、`createLocalRuntime` 和 `createDefaultRuntime`，验证默认配置可以启动、发现能力、创建 Session、执行 Prompt 并发布事件。

## 2. Nexum 协议与默认路径

- [x] 2.1 将 Headless 协议源、能力发现、事件命名和错误标识迁移为 `nexum.runtime.v1` 及 `nexum.*` 子命名空间，并先添加协议契约测试确认旧标识不会成为默认输出。
- [x] 2.2 将服务默认数据目录、配置文件、环境变量和服务标识迁移为 `.nexum`、`NEXUM_*` 和 Nexum 名称，验证未配置环境变量时不会创建旧 Headless 默认路径。
- [x] 2.3 从 Protocol 源重新生成 Client，验证生成文件与协议源一致，并验证 Client 不依赖 Core、Server 或 UI。

## 3. Memory 与 MCP 适配器

- [x] 3.1 在 Core 增加 MemoryPort 和能力发现契约，添加 InMemory 与文件型默认 Memory Adapter 的测试，验证跨 Prompt/Session 的读写和脱敏边界。
- [x] 3.2 增加可选 MCP Adapter 入口，覆盖 stdio/HTTP 能力注册、Tool/Resource/Prompt 映射和未启用时的能力发现，验证未安装 MCP 时默认 Runtime 仍可启动。
- [x] 3.3 将本地文件/Shell 工具通过 Host Adapter 接入，验证工作目录边界、权限检查、取消和工具结果事件保持原有行为。

## 4. 文档与集成验证

- [x] 4.1 更新 Nexum 包 README、Headless API 文档、架构说明和默认启动命令，验证文档中的公开安装入口、路径、环境变量和协议版本均使用 Nexum。
- [x] 4.2 执行 Nexum 包级测试、协议生成检查、类型检查和 UI 构建/Smoke，记录所有失败并修复迁移回归。
- [x] 4.3 执行根级 `bun run check` 和 OpenSpec 严格校验，完成依赖方向、公开命名、旧标识搜索和任务实现一致性审计。根级检查已执行；当前稀疏工作树中既有 `@opencode/util` 与 `@opencode/codemode` 的 `typecheck` 脚本调用 `bun check` 但未提供对应脚本，失败属于原有 OpenCode 基线，Nexum 包级验证全部通过。

## Workflow follow-up

- 通过代码审查、逐任务审计和提交门禁后，将本变更合并回 `SOURCE_BRANCH`。
- 所有任务完成后归档 `nexum-foundation` OpenSpec 变更。
