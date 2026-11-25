# Split Persistence Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 将内存、磁盘文件和 SQLite 持久化实现拆成独立 workspace 包，并按场景配置默认 Runtime：测试使用 SQLite、CLI 使用文件、Web/Server 使用 SQLite。

**Architecture:** @nexum/core 继续只提供领域 Store/Port；@nexum/persistence 收敛为公共组合契约；@nexum/persistence-memory、@nexum/persistence-file 和 @nexum/persistence-sqlite 各自实现完整 Persistence 组合。@nexum/application 负责场景选择，Server/Test/CLI 只通过 Application 或显式注入使用适配器。

**Tech Stack:** Bun 1.4、TypeScript、Bun workspace、bun:sqlite、Bun Test、OpenSpec。

---

## Task 1: 建立公共契约与三包 workspace 骨架

**Files:**
- Modify: packages/nexum-persistence/package.json
- Modify: packages/nexum-persistence/src/index.ts
- Modify: packages/nexum-persistence/src/composition.ts
- Create: packages/nexum-persistence-memory/package.json, tsconfig.json, src/index.ts
- Create: packages/nexum-persistence-file/package.json, tsconfig.json, src/index.ts
- Create: packages/nexum-persistence-sqlite/package.json, tsconfig.json, src/index.ts
- Test: packages/nexum-test/test/repository-boundary.test.ts

- [ ] **Step 1: 写包边界失败测试**

在 repository boundary 测试中增加断言：三个新目录存在、package name 分别为 @nexum/persistence-memory、@nexum/persistence-file、@nexum/persistence-sqlite，且三个实现包不依赖 Application 或 Server。

- [ ] **Step 2: 运行 RED 测试**

Run: bun --cwd packages/nexum-test test test/repository-boundary.test.ts

Expected: FAIL，原因是三个新 workspace 包尚不存在。

- [ ] **Step 3: 创建最小包骨架**

每个实现包使用相同的 workspace 基础结构，依赖只指向 Core 和公共 Persistence 契约：

~~~json
{
  "name": "@nexum/persistence-sqlite",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "bun test", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@nexum/core": "workspace:*",
    "@nexum/persistence": "workspace:*"
  }
}
~~~

公共包只导出组合接口和共享事件端口，不再从入口导出内存、文件或 SQLite 的具体工厂。

- [ ] **Step 4: 运行 GREEN 与类型检查**

Run: bun --cwd packages/nexum-test test test/repository-boundary.test.ts && bun run check

Expected: 新包边界测试通过，根目录 lint/typecheck 通过。

- [ ] **Step 5: Commit**

提交标题：✨ feat(persistence): 建立独立适配器包边界；正文说明公共契约与三个实现包的依赖方向；footer 使用 Refs: OpenSpec split-persistence-adapters task 1.1。

## Task 2: 迁移内存适配器

**Files:**
- Move/Modify: packages/nexum-persistence/src/in-memory-memory.ts、interaction-store.ts、message-store.ts、session-store.ts、permission-policy-store.ts、skill-registration-store.ts、mcp-store.ts
- Create/Modify: packages/nexum-persistence-memory/src/*.ts
- Test: packages/nexum-persistence-memory/test/*.test.ts

- [ ] **Step 1: 写内存组合隔离的失败测试**

创建两个 createMemoryPersistence() 结果，向第一个写入 Session、Message、Memory 和 Permission Policy，第二个必须读取为空；同时断言没有生成文件或数据库路径。

- [ ] **Step 2: 运行 RED 测试**

Run: bun --cwd packages/nexum-persistence-memory test

Expected: FAIL，原因是内存包尚未导出组合工厂。

- [ ] **Step 3: 迁移实现并保持端口语义**

内存包导出完整 NexumPersistence 组合，组合字段必须分别由 createInMemorySessionStore、createInMemoryMessageStore、createInMemoryInteractionStore、createNexumModelConfigStore、createNexumRolePromptStore、createNexumEventHub、createInMemoryPermissionPolicyStore、createInMemoryMemory、createInMemorySkillRegistrationStore、createInMemoryMcpServerConfigStore 和 createInMemoryMcpCredentialStore 创建。

具体 Store 实现移动到内存包；公共包只保留端口类型，不能让内存包反向依赖 Application。

- [ ] **Step 4: 运行内存包测试、类型检查和 Application 测试**

Run: bun --cwd packages/nexum-persistence-memory test && bun --cwd packages/nexum-persistence-memory run typecheck && bun --cwd packages/nexum-application test

Expected: 全部通过，且 Application 的嵌入式 Runtime 仍默认使用内存。

- [ ] **Step 5: Commit**

提交标题：♻️ refactor(persistence): 拆出内存适配器；footer：Refs: OpenSpec split-persistence-adapters task 2.1。

## Task 3: 迁移磁盘文件适配器

**Files:**
- Create/Modify: packages/nexum-persistence-file/src/*.ts
- Test: packages/nexum-persistence-file/test/*.test.ts
- Modify: packages/nexum-application/src/index.ts
- Modify: packages/nexum-test/test/persistent-poc.test.ts

- [ ] **Step 1: 写文件适配器重启恢复失败测试**

使用临时目录创建文件 Persistence，写入 Session、Message、Memory、Interaction 和 Event，关闭后重新创建组合并断言全部恢复；测试必须不依赖固定仓库目录。

- [ ] **Step 2: 运行 RED 测试**

Run: bun --cwd packages/nexum-persistence-file test

Expected: FAIL，原因是文件包尚未导出实现。

- [ ] **Step 3: 迁移文件实现**

保留现有 JSON 文件名、目录创建、原子临时文件写入、坏文件稳定错误和逐文件覆盖选项。文件包导出 createFilePersistence(options: FilePersistenceOptions): NexumPersistence。Application 的 createLocalRuntime 改为从 @nexum/persistence-file 导入工厂，默认仍使用 .nexum/*.json。

- [ ] **Step 4: 更新 POC 与测试断言**

将现有文件 POC 保留为文件适配器专用测试，断言通过公共 Store 接口验证恢复；不再由 SQLite 任务复用文件路径断言。

- [ ] **Step 5: 运行 GREEN 与提交**

Run: bun --cwd packages/nexum-persistence-file test && bun --cwd packages/nexum-application test && bun --cwd packages/nexum-test test test/persistent-poc.test.ts

提交标题：♻️ refactor(persistence): 拆出磁盘文件适配器；footer：Refs: OpenSpec split-persistence-adapters task 2.2。

## Task 4: 实现 SQLite 数据库适配器

**Files:**
- Create: packages/nexum-persistence-sqlite/src/database.ts、schema.ts、store.ts、events.ts、composition.ts
- Test: packages/nexum-persistence-sqlite/test/*.test.ts

- [ ] **Step 1: 写首次启动与重复初始化 RED 测试**

使用不存在的临时数据库路径创建两次 SQLite Persistence，断言目录和数据库文件被创建、schema 初始化只产生预期表，并能正常关闭连接。

- [ ] **Step 2: 运行 RED 测试**

Run: bun --cwd packages/nexum-persistence-sqlite test test/database.test.ts

Expected: FAIL，原因是 SQLite 工厂尚不存在。

- [ ] **Step 3: 实现数据库生命周期和 schema**

使用 Bun 原生 API Database from bun:sqlite。createSqlitePersistence(options) 打开 options.databasePath 或 .nexum/nexum.db，执行幂等 schema 初始化并返回完整 NexumPersistence。schema 至少包含统一 JSON Store 表、事件表和 schema version 表；写入使用短事务，关闭 Runtime 时关闭数据库连接。

- [ ] **Step 4: 为各 Core Store 实现真实 SQLite 集成测试**

先覆盖 Session、Message、Interaction、ModelConfig、RolePrompt、PermissionPolicy、Memory、Skill、MCP Config/Credential 的新增、读取、列表、删除、幂等和重启恢复，再实现最小查询索引。测试必须使用真实 SQLite，不使用 mock。

- [ ] **Step 5: 实现事件回放和订阅**

为 Event Hub 添加发布、Session 内 sequence、eventID 游标、历史回放、实时订阅和 Session 删除测试；确认重启后历史仍可回放，订阅者不会收到重复事件。

- [ ] **Step 6: 验证事务、并发和凭据边界**

添加失败写入回滚、并发写入不丢失、不同数据库路径隔离、凭据读取只返回脱敏状态、数据库关闭后不能继续写入的测试。

- [ ] **Step 7: 运行 SQLite 包完整验证与提交**

Run: bun --cwd packages/nexum-persistence-sqlite test && bun --cwd packages/nexum-persistence-sqlite run typecheck

提交标题：✨ feat(persistence): 增加 SQLite 持久化适配器；footer：Refs: OpenSpec split-persistence-adapters task 3.1。

## Task 5: 接入 Runtime 默认矩阵

**Files:**
- Modify: packages/nexum-application/package.json、src/index.ts
- Modify: packages/nexum-server/package.json、src/index.ts、src/main.ts
- Modify: packages/nexum-test/package.json、src/dev.ts、test/persistent-poc.test.ts
- Modify: packages/nexum-cli README or existing CLI runtime documentation

- [ ] **Step 1: 写默认矩阵失败测试**

增加 Application/Server/Test 测试，分别断言 Embedded 使用 memory、Local 使用 file、Server 默认使用 SQLite、Test factory 使用临时 SQLite；在实现切换前运行并确认 RED。

- [ ] **Step 2: 接入三种工厂**

Application 导入三个适配器包，保留显式 persistence 优先级，并提供清晰的 SQLite 工厂或 persistenceBackend: "sqlite" 选项。Server 默认调用 SQLite，Test 使用独立临时数据库，CLI 通过本地 Server 使用文件 Runtime。

- [ ] **Step 3: 验证重启行为**

Test Workbench/Persistent POC 写入 Session、消息、事件、权限和 Memory，关闭 Runtime 后用同一 SQLite 文件重启并断言恢复；两个测试实例使用不同路径。

- [ ] **Step 4: 运行受影响包测试与提交**

Run: bun --cwd packages/nexum-application test && bun --cwd packages/nexum-server test && bun --cwd packages/nexum-test test && bun --cwd packages/nexum-cli test

提交标题：✨ feat(runtime): 按场景配置持久化默认适配器；footer：Refs: OpenSpec split-persistence-adapters task 4.1。

## Task 6: 文档、边界审计与集成验证

**Files:**
- Modify: packages/nexum-test/README.md、packages/nexum-persistence/README.md
- Create/Modify: three adapter package READMEs
- Modify: openspec/changes/split-persistence-adapters/tasks.md

- [ ] **Step 1: 更新文档**

文档明确三种包、默认矩阵、SQLite 路径、文件适配器的数据目录、测试临时数据库清理规则和不自动迁移 JSON 数据的边界；逐条执行文档中的命令。

- [ ] **Step 2: 运行完整验证**

Run from package directories: affected package bun test and bun run typecheck:tsc; run from repository root: bun run check; run openspec validate split-persistence-adapters --strict.

- [ ] **Step 3: 做代码审查和项目卫生检查**

审查依赖方向、SQLite 事务/连接生命周期、凭据脱敏、文件权限、错误语义和测试隔离；确认 packages/nexum-cli/review-demo.ts 未被修改，新增数据库产物不会进入 Git。

- [ ] **Step 4: 完成任务标记与集成**

更新 OpenSpec tasks 勾选项，按项目提交规范逐任务提交，合并到 dev-v0.0.1，验证集成分支包含所有提交且工作树干净。

- [ ] **Step 5: 归档变更**

Run: openspec archive split-persistence-adapters；再运行 openspec validate --archived --strict，确认归档主规格保留 CLI 文件、Test SQLite、Server SQLite 和显式 Memory 四种行为。

