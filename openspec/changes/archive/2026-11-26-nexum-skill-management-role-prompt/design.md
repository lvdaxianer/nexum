# Design

## Context

详见 `proposal.md` 的动机和范围。当前 Nexum 已有 Core 的 Skill registry 接口、Adapter 的本地目录扫描器、Server 的基础 Skill 路由、Client 的列表/刷新/校验调用，以及 Surfaces 的 Skill 抽屉。当前 registry 由启动时的 `skillRoots` 驱动，没有注册源存储；Server 的 register 仍按 ID 触发扫描；工具注册只有文件读写、编辑和 shell；模型 prompt 组装已支持 system message，但没有默认角色提示词来源。

项目约束：Schema/Protocol/Core/Server 依赖方向不能反转；公开 Protocol 或 Server `HttpApi` 变更后必须运行 `packages/client` 的 `bun run generate`；运行时插件加载不能在 Server handler 中等待；本地测试必须从对应 package 目录运行。

## Goals / Non-Goals

**Goals:**

- 把 Skill 注册源变成 Nexum 管理的持久化实体，并复用现有安全扫描器读取源内容。
- 让按地址注册、刷新、校验、详情、取消注册在 Core、Adapter、Protocol、Server、Client、Agent 工具和 UI 之间保持一致。
- 保持现有 `@skill-id` 解析、`skill.use` 激活和安全诊断行为兼容。
- 使用独立的本地角色提示词存储，在每一次模型请求构造阶段注入 system message。
- 为真实浏览器验收提供可观察状态和可恢复错误。

**Non-Goals:**

- 第一阶段不实现远程 HTTP(S) 下载、版本锁定、凭据托管或跨进程共享注册。
- 不复制或修改 Skill 源目录，不将完整 Skill 内容写入 registry JSON。
- 不持久化或重放默认角色提示词为 Session 可见消息。
- 不对模型隐藏推理、工具参数、文本输出做翻译、过滤或二次改写。

## Decisions

### 1. Registry contract 与持久化职责分层

在 `nexum-core` 扩展 registry contract：保留安全摘要和 `read` 能力，增加 `register(address)`、`refresh(id?)`、`unregister(id)`，并让注册源元数据成为可查询状态。Core 只定义值对象、状态和端口，不直接访问文件系统。

在 `nexum-adapters` 实现两个相邻职责：

1. 地址加载器把本地地址规范化为目录，复用现有 `SKILL.md` frontmatter、文件清单、digest、symlink 和大小限制校验。
2. JSON registry store 用原子临时文件写入后 rename，文件模式使用 `0600`；启动时读取坏文件时返回安全诊断，并以空注册集继续启动。

选择 registry JSON 而不是数据库，是因为当前 Nexum 的模型、Session、策略和事件存储已经采用同样的本地文件模式，且注册源数量小、事务需求有限。若未来需要多进程写入，store 可替换为数据库而不改变 Core contract。

### 2. 注册记录和冲突模型

持久化记录保存 `address`、`sourceType`、`skillID`、`registeredAt`、`updatedAt`、最新 `digest`、状态和安全错误摘要；不保存完整文件内容。对外响应通过 safe summary 隐去本地绝对路径，内部 store 保留规范化地址以支持重启恢复。

注册同一规范化地址时执行幂等更新，不创建第二条记录。刷新或注册后按 `skillID` 聚合；同 ID 的不同地址全部成为 `conflict`，只有移除冲突源后才可激活。`get`/resolver 只返回 `ready` 条目，避免现有激活路径误用 invalid/conflict 内容。

取消注册先从内存索引和持久化记录移除，再发布更新事件；绝不调用源目录删除 API。若持久化写失败，内存状态不得假装成功，返回带 trace ID 的稳定错误。

### 3. 启动恢复和刷新语义

`createLocalRuntime` 在既有 `dataDirectory` 下默认使用 `skills.json`，支持显式 `skillRegistryFile` 和对应环境变量，和现有模型/Session 文件配置保持同一覆盖优先级。运行时创建后从 store 恢复记录，再执行一次非阻塞式全量 refresh；单个源失败仅更新自身 invalid 状态。

保留 `skillRoots` 作为向后兼容的初始发现来源：启动时可把根目录下一层的合法 Skill 视为可注册候选，但新的持久化注册表仍是激活事实来源。显式 address 注册不依赖猜测根目录；所有来源都经过同一安全加载器。

### 4. HTTP API、Protocol 和 Client 一致性

在现有 `/api/nexum/skills` 路由下增加 detail、按 address register、refresh、validate、DELETE unregister；使用统一输入/错误 schema，拒绝空地址和不支持的远程地址。能力声明的 Skill operations 更新为 `list/detail/register/refresh/validate/unregister/activate`。

Protocol 新增安全注册状态、注册请求、角色提示词请求/响应和 registry update event 类型。Server 只返回安全摘要和 trace ID；错误中不回显绝对路径、环境变量、请求头、凭据或原始命令输出。Client 通过现有生成流程更新，不手写生成文件；变更后从 `packages/client` 执行 `bun run generate`。

Server handler 只调用当前已加载的 registry，不等待插件激活；registry 是本地内置能力，不以插件加载时序为前提。

### 5. Agent 工具与权限

在 `nexum-core` 的 builtin tool registry 增加 `skill_registry`，输入为受限 operation union 和 `id/address` 字段。Adapter 将操作映射到 registry 端口，返回安全结果，不返回文件正文。`register`、`refresh`、`unregister` 使用 `skill.manage`；`list`、`detail`、`validate` 是只读操作；`@skill-id` 激活继续走 `skill.use`。

工具描述直接告诉模型：Skill 必须通过 Nexum 注册表管理，不能使用 shell 搜索工作区，也不能自行删除源文件。默认角色提示词的管理端口不进入工具表，避免 Agent 改变全局行为。

### 6. 默认角色提示词的存储和注入

新增 Core role-prompt port 与 Adapter file store，默认文件为 `<dataDirectory>/role-prompt.json`，支持显式文件路径和环境变量覆盖。文件保存 prompt 文本与更新时间；空值或文件缺失时返回内置默认 prompt。写入采用原子替换和 `0600`。

在 Core 的模型请求组装点读取当前 prompt，并将一个 `ModelMessage` system item 放在模型可见上下文的固定位置，`sourceID` 固定为 `runtime:default-role`。该 item 不写入 durable Session message；resume、continuation 和 compaction 后的每次 `llm.stream` 都重新组装，以使用最新配置。

OpenAI adapter 继续序列化 Core 生成的 messages，不增加输出拦截层。角色提示词即使包含“使用中文思考/回答”，也只是原文指令；Nexum 不读取隐藏推理、不翻译、不重写、不过滤模型响应。

### 7. 事件和 UI 更新

Protocol 增加 `skill.updated`（或同等命名）的安全事件，事件只包含 Skill ID、变化类型、状态和摘要。注册、刷新、校验、取消注册后发送；已有 `skill.activated`/`skill.failed` 不变。长连接 UI 处理该事件后刷新 Skill 列表和 `@` 建议。

Skills 抽屉增加 address 输入、register、refresh、validate、unregister；取消注册必须确认且文案明确不会删除源文件。角色提示词使用独立配置抽屉，保存/恢复成功后刷新服务值；网络错误保留用户未提交文本。UI 只依赖 Client API，不直接导入 Core。

### 8. 兼容与错误策略

- 旧的 `register({ id })` 请求不再猜测来源，返回明确的缺少 address 错误；不保留会产生歧义的隐式注册别名。
- 旧的 `skillRoots` 仅作为兼容性发现输入，不会绕过持久化注册表的安全检查。
- 注册、刷新和取消注册的写入错误都是可恢复的 Server error，内存索引和磁盘记录必须保持一致。
- invalid Skill 保留在列表中显示诊断，但不能被 resolver 激活；冲突项同样不可激活。

## Risks / Trade-offs

- [源目录移动或删除] → 注册记录保留为 invalid，UI 显示安全诊断，用户可重新注册新地址；不会自动删除记录或文件。
- [多个进程同时写 JSON] → 第一阶段以单进程 Nexum 为前提，原子 rename 防止半文件；多进程需求出现时迁移到现有数据库存储。
- [默认 prompt 每次重新注入增加少量 token] → 只注入短文本并在统一 prompt 组装点处理，优先保证 resume/compaction 一致性。
- [旧 API 调用方按 ID 注册] → 返回稳定的 address-required 错误，并在 Client 类型和 UI 中统一使用 address，避免静默猜测。
- [不支持远程地址造成用户预期落差] → 明确返回 unsupported-source-type，并在后续单独评审远程下载和 SSRF 防护。

## Migration Plan

1. 先发布 Core/Adapter registry contract、`skills.json` store 和 role-prompt store；没有旧注册文件时从现有 `skillRoots` 做兼容性发现。
2. 发布 Protocol/Server/Client API 与事件，运行 `packages/client` 的 code generation，并保留现有 list/activate 路径。
3. 发布 Agent tool 和 UI；UI 通过 address 注册现有 `metric-view-lifecycle`，验证持久化后再取消注册。
4. 若回滚，停止使用新 API/UI，保留 JSON 文件；旧版本忽略这些文件但不触碰 Skill 源目录。

## Open Questions

无。远程 HTTP(S) 注册、跨进程一致性和版本锁定会作为后续独立能力，不影响本次规格或任务拆分。
