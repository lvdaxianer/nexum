# Tasks

## 1. Skill Registry 持久化与安全地址加载

- [x] 1.1 扩展 `nexum-core` 的 Skill registry contract、状态值和注册记录类型，覆盖 address/sourceType/digest/时间戳/安全错误，并保持现有 resolver 的 ready-only 语义；通过 Core 类型检查和 registry contract 单测验证。
- [x] 1.2 在 `nexum-adapters` 实现本地地址规范化、注册/幂等、刷新、冲突聚合和取消注册，复用现有 `SKILL.md`/symlink/文件大小校验；通过单测覆盖有效目录、重复地址、重复 ID、坏源和路径逃逸。
- [x] 1.3 增加原子 JSON registry store、`skills.json` 默认路径、显式文件配置和启动恢复；通过重启模拟测试验证注册状态恢复、单个坏源不阻塞其他源、写入失败不产生假成功。
- [x] 1.4 验证取消注册只移除 Nexum 记录而不修改源目录，并更新 `docs/headless-core-poc.md` 或对应 Nexum 文档说明持久化位置和删除边界；通过文件快照测试和文档命令核验。

## 2. Protocol、Server、Client 与事件

- [x] 2.1 扩展 Nexum Protocol 的 Skill 注册状态、请求/响应、能力操作和安全 registry update event 类型；通过 Protocol 类型检查和事件序列化测试验证不暴露绝对路径/凭据。
- [x] 2.2 实现 detail、按 address register、refresh、validate、DELETE unregister 路由及稳定错误/trace ID，更新能力声明和启动注入；通过 `packages/nexum-server` API 集成测试覆盖幂等、冲突、删除不删源和坏地址。
- [x] 2.3 更新 Nexum Client 的 list/detail/register/refresh/validate/unregister/role-prompt 调用，并从 `packages/client` 执行 `bun run generate`；通过 Client 类型检查和现有客户端测试验证生成结果一致。
- [x] 2.4 更新 `apis/nexum.md` 和相关接口文档，明确 address 注册、`.nexum/skills.json`、DELETE 边界与事件；通过文档中的示例请求与实际路由对照检查。

## 3. 默认角色提示词持久化与模型上下文

- [ ] 3.1 在 Core 定义默认角色提示词 port、内置默认值和 `runtime:default-role` system message 来源约束；通过 Core 类型检查和 prompt assembly 单测验证只生成上下文消息、不写 Session 历史。
- [ ] 3.2 在 Adapter 实现 `role-prompt.json` 原子文件 store、默认数据目录/显式路径/环境变量配置及安全读取；通过单测覆盖保存、重启恢复、空值恢复默认、权限模式和损坏文件诊断。
- [ ] 3.3 在新建、恢复、继续和 compaction 后的每次模型调用组装默认 system message，并保持 OpenAI adapter 原样发送模型输入且不拦截输出；通过模型请求记录测试覆盖中文偏好原文和多次调用最新值。
- [ ] 3.4 暴露 role prompt GET/PUT/DELETE API 并补充接口文档；通过 Server API 测试验证保存/读取/恢复默认和 Agent 不可调用该管理端口。

## 4. Session Agent Skill 管理工具

- [ ] 4.1 在 Core 注册 `skill_registry` builtin tool，定义 list/detail/register/refresh/validate/unregister 输入与安全结果，并在工具描述中禁止 shell 搜索和源文件删除；通过工具 schema 单测验证参数边界。
- [ ] 4.2 在 Adapter 执行 tool operation 到 registry 端口的映射，接入 `skill.manage`/只读权限边界，保留 `skill.use` 激活路径；通过工具执行和权限测试验证允许/拒绝/取消语义。
- [ ] 4.3 为注册、刷新、校验、取消注册发布安全 registry update event，并接入 Session 事件流；通过事件顺序和敏感信息扫描测试验证 Agent/UI 能看到状态但看不到绝对路径和源文件内容。

## 5. Web UI 管理入口

- [ ] 5.1 更新 Skills 抽屉，增加地址输入、注册、详情、刷新、校验、取消注册确认和加载/错误状态，成功后刷新列表与 `@` 建议；通过页面组件测试和 `packages/nexum-surfaces` 类型检查验证交互状态。
- [ ] 5.2 增加独立默认角色提示词配置抽屉，支持编辑、保存、恢复默认，失败时保留未提交文本并禁止 Agent 入口；通过页面组件测试验证保存/恢复和错误恢复。
- [ ] 5.3 接入 `skill.updated` 和 role prompt API，确保 UI 只使用 Client，不直接依赖 Core/Server；通过构建检查和真实事件驱动列表刷新测试验证依赖方向。

## 6. 集成验证与真实浏览器验收

- [ ] 6.1 运行所有受影响 package 的 typecheck/test，并运行 `bunx openspec validate nexum-skill-management-role-prompt --strict`；记录既有基线失败与本变更结果，修复本变更引入的问题。
- [ ] 6.2 启动本地前后端服务，用真实浏览器会话在 Skills 面板注册 `/Users/lvdaxianer/workspace/uino/project/ontomato_enterprise/skills/metric-view-lifecycle`，确认 ready、刷新后仍在、`@metric-view-lifecycle` 可激活。
- [ ] 6.3 在浏览器中取消注册并确认 UI 移除记录、源目录仍存在；配置中文默认角色提示词并发送 Session 请求，确认模型上下文包含原文 system message 且 Nexum 未改写模型响应。
- [ ] 6.4 完成代码审查、工作树验证、提交并合并回 `dev-v0.0.1`，再次检查集成分支状态和验收证据。

## Workflow follow-up

- 完成实现和验收后归档 OpenSpec change，并验证归档后的主规格内容。
