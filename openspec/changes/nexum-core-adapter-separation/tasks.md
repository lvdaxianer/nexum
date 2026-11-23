# Tasks

## 1. Package boundaries

- [ ] 1.1 建立 `@nexum/persistence`、`@nexum/integrations` 和 `@nexum/application` workspace 包及依赖边界测试。
- [ ] 1.2 运行 OpenSpec 严格校验并记录新的 Core、Persistence、Integrations、Application、Server 和 Surface 依赖图。

## 2. Persistence

- [ ] 2.1 将 Session、Message、Interaction、Event、Memory、Model Config、Role Prompt 和 Permission Policy 的文件/内存实现迁移到 `@nexum/persistence`。
- [ ] 2.2 保留原子写入、损坏文件保护、Session 删除、Interaction orphan 恢复和 Event sequence/replay 语义，并迁移对应测试。
- [ ] 2.3 为 Skill Registry 提供独立的注册状态持久化实现，不承载 Skill 业务编排。

## 3. Core boundary

- [ ] 3.1 从 Core 移除 Session、Message、Permission Policy 等具体默认实现和隐藏 fallback，要求显式注入必需 Port。
- [ ] 3.2 保留权限策略规则/匹配/评估、Session、Coding Loop、Skill Invocation 和 Runtime 生命周期语义。
- [ ] 3.3 增加 Core import/export boundary 与 required-Port 测试，修复错误类 canonical identity 问题。

## 4. Integrations

- [ ] 4.1 将 OpenAI-compatible Model、Local Host、目录校验和 MCP 移到 `@nexum/integrations`。
- [ ] 4.2 将文件型 Project Context 和本地 Skill Source 从应用编排中拆出，禁止 Integrations 依赖 Persistence 或 Application。
- [ ] 4.3 迁移模型流式响应、Host 路径边界/取消、MCP 映射、上下文读取和 Skill source 安全测试。

## 5. Application

- [ ] 5.1 将 Skill Registry 编排、Tool Registry、Question Broker 和 configured Coding Loop 移到 `@nexum/application`。
- [ ] 5.2 将 `createEmbeddedRuntime` 和 `createLocalRuntime` 移到 Application，显式组合 Persistence 与 Integrations 并保留 override/lifecycle 语义。
- [ ] 5.3 为 Application 服务和两种 Runtime profile 增加测试。

## 6. Consumer migration

- [ ] 6.1 迁移 Server、Test Workbench、Core tests 和 Surface smoke fixtures 的包依赖与 imports。
- [ ] 6.2 删除 `packages/nexum-adapters`、`@nexum/adapters` 入口和 lockfile 中的旧 workspace 记录，不保留兼容层。
- [ ] 6.3 验证 HTTP/SSE Protocol、Client、Server、POC 和 Surface 行为不变。

## 7. Documentation and verification

- [ ] 7.1 更新 README、packages README、CONTRIBUTING、包 README、OpenSpec 和设计计划中的职责术语。
- [ ] 7.2 增加旧包引用和错误依赖方向的仓库边界检查。
- [ ] 7.3 运行所有包测试、类型检查、root `bun run check`、Surface smoke 和最终 OpenSpec 校验。
