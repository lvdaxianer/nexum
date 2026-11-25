# Tasks

## 1. 组合端口与工厂

- [x] 1.1 新增持久化组合类型，覆盖 Runtime 必需的 Session、Message、ModelConfig、RolePrompt、Interaction、EventHub、PermissionPolicy、Memory、Skill 注册和 MCP Store，并通过类型检查验证字段完整性
- [x] 1.2 实现 FilePersistenceAdapter 和 MemoryPersistenceAdapter 工厂，验证默认路径、内存隔离和自定义 Store 覆盖行为

## 2. Runtime 接入

- [x] 2.1 修改 Local/Embedded Runtime 使用组合工厂，同时保持现有创建函数和单项注入参数兼容；运行 application 包测试验证既有行为
- [x] 2.2 为 File/Memory 组合增加契约测试，覆盖 Session 删除关联状态、事件历史回放、凭据安全返回和不写入错误目录

## 3. 文档与集成验证

- [x] 3.1 更新 persistence/application README，说明 CLI、Web 和测试的适配器边界，并验证示例路径与代码一致
- [x] 3.2 运行持久化包、应用包及根目录 `bun run check`，确认 OpenSpec 校验通过且未修改既有未跟踪文件

## Workflow follow-up

- 完成代码审查、逐任务审计和提交后，将变更合并回 `SOURCE_BRANCH`。
- 数据库具体实现另开任务，复用本次组合端口，不在本任务内引入数据库驱动。
