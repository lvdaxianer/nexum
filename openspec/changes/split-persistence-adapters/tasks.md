# Tasks

## 1. 拆分公共契约与 workspace 包

- [x] 1.1 建立 `@nexum/persistence-memory`、`@nexum/persistence-file`、`@nexum/persistence-sqlite` 的 package.json、tsconfig 和 workspace 依赖，并用边界测试固定依赖方向；通过 `bun run check` 验证 workspace 解析和依赖方向。
- [x] 1.2 为新包建立独立测试入口和 README，明确各包职责、默认使用场景与不暴露凭据明文的约束；通过 `bun --cwd packages/<package> test` 与文档命令核对验证。

## 2. 迁移内存与文件适配器

- [x] 2.1 将现有内存 Store 和事件 Hub 迁移到 `packages/nexum-persistence-memory`，保持每个组合实例隔离且不触碰文件或数据库；先添加隔离测试使其在迁移前失败，再实现并运行内存包测试。
- [x] 2.2 将现有 JSON 文件 Store 和事件 Hub 迁移到 `packages/nexum-persistence-file`，保持数据目录、逐文件覆盖和文件错误语义；先添加文件恢复测试使其在迁移前失败，再实现并运行文件包测试。
- [ ] 2.3 删除旧聚合包中的具体实现导出，更新 Application、Server 和现有测试的导入路径；通过 repository boundary 测试、受影响包测试和类型检查确认没有残留旧路径。

## 3. 实现 SQLite 适配器

- [ ] 3.1 在 `packages/nexum-persistence-sqlite` 增加 Bun SQLite 数据库打开、幂等 schema 初始化、数据库路径选项、连接关闭和受控事务工具；先写首次启动与重复初始化测试并确认 RED，再实现到 GREEN。
- [ ] 3.2 为 Session、Message、Interaction、ModelConfig、RolePrompt、PermissionPolicy、Memory、Skill、MCP Config/Credential 实现 SQLite Store，保持现有 Core 端口的校验、幂等、删除和查询语义；为每类 Store 添加真实 SQLite 集成测试并验证重启恢复。
- [ ] 3.3 实现 SQLite Event Hub，支持发布、按 Session 回放、eventID/sequence 游标、订阅通知和 Session 删除；先写回放与重启测试确认 RED，再实现并运行事件包测试。
- [ ] 3.4 验证 SQLite 并发写入、失败事务不产生半写入、凭据读取脱敏、数据库文件权限和连接关闭行为；通过专门的可靠性测试以及 `bun --cwd packages/nexum-persistence-sqlite test` 验证。

## 4. 接入运行时默认策略

- [ ] 4.1 更新 `@nexum/application` 的 Runtime 组装，保留显式 `persistence` 注入，嵌入式默认内存，Local Runtime 默认文件，并增加 SQLite Runtime/选项入口；通过 Application runtime 测试验证三种工厂返回的组合类型和数据目录。
- [ ] 4.2 更新 `@nexum/server` 默认启动入口使用 SQLite，同时保留传入 Runtime 时的调用方选择；通过 Server 启动、重启恢复和 HTTP API 测试验证。
- [ ] 4.3 更新 `@nexum/test` 的 Test Workbench 与持久化 POC 默认使用临时 SQLite，测试结束清理数据库；通过 `bun --cwd packages/nexum-test test` 和 Workbench 启动检查验证。
- [ ] 4.4 确认 `@nexum/cli` 继续通过 Server 访问运行时，CLI 对应的本地服务默认使用文件适配器；通过 CLI 连接诊断/Session 命令测试和文档核对验证。

## 5. 集成验证与交付

- [ ] 5.1 更新 README、运行配置和架构说明，记录三种包、默认矩阵、SQLite 数据路径、文件数据边界和迁移限制；通过文档中的命令逐条执行核对。
- [ ] 5.2 运行受影响包的单测、`bun run check`、必要的 `typecheck:tsc` 和 `openspec validate --change split-persistence-adapters --strict`，修复全部失败后记录输出。
- [ ] 5.3 进行需求-实现一致性审计、代码审查和项目卫生检查，确认未修改 `packages/nexum-cli/review-demo.ts`，再完成每个任务的提交与集成分支合并。

## Workflow follow-up

- 归档 OpenSpec change `split-persistence-adapters` 并验证归档后的主规格包含 SQLite 默认行为。
- 删除任务工作树前读取 `.source_branch`，确认任务分支、集成分支和工作树均满足关闭门禁。

