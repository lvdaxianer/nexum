# Nexum Skill 管理与默认角色提示词设计

## 1. 背景与现状

当前 Nexum 已经能够从配置的 Skill 根目录扫描 `SKILL.md`，并在会话中通过 `@skill-id` 激活 Skill，但注册源不是持久化的一等实体：服务重启后只能重新扫描启动参数，API 的 register 仍然以 `id` 为输入，且没有 unregister 能力。会话侧也没有专门的 Skill 管理工具，因此 Agent 可能退回到 shell 搜索工作区。

当前模型配置已经能够持久化到本地文件，但缺少一个独立的全局默认角色提示词配置。该提示词需要进入模型上下文，而不是由 Nexum 改写模型输出。

## 2. 目标

1. 让 Nexum Registry 成为 Skill 注册、校验、刷新、详情、激活和删除注册的唯一入口。
2. 以地址注册 Skill，支持本地目录地址；保留可扩展的 HTTP(S) 地址类型，但第一阶段只实现安全的本地目录读取。
3. 将注册源和注册状态持久化到 Nexum 数据目录，服务重启后恢复并刷新。
4. 支持幂等注册、重复 Skill ID 冲突检测、删除注册而不删除用户源文件。
5. 暴露 `skill_registry` 会话工具，让 Agent 使用 Nexum 管理能力，不通过 shell 猜测 Skill 所在位置。
6. 增加独立的默认角色提示词配置，并在每次模型调用前以 system message 注入。
7. 明确 Nexum 不翻译、不重写、不后处理模型的思考过程或输出，提示词只作为上下文交给模型理解。
8. 在 Web UI 中提供可观察、可操作的 Skill 管理和默认角色提示词配置入口。

## 3. 非目标

- 不复制、移动、修改或删除用户 Skill 源目录中的文件。
- 不把角色提示词写入 Session 可见消息历史，也不让 Agent 修改该配置。
- 不在 Nexum 中实现思考过程翻译、语言检测、输出重写或隐藏推理强制转换。
- 不在第一阶段引入远程仓库下载、凭据托管或跨机器分布式注册。
- 不改变现有 `@skill-id` 激活协议和 Skill 内容读取安全边界。

## 4. 总体架构

```text
Web UI / Session Agent
          |
          v
Nexum Server API / skill_registry tool
          |
          v
Nexum Core Skill Registry contract
          |
          v
Adapter: address source loader + persistent registry store
          |
          +--> local Skill directory (read-only)
          +--> <dataDirectory>/skills.json

Session execution --> Core assembles model messages
                         |
                         +--> runtime:default-role system message
                         +--> project/skill context
                         +--> user/model-visible history
```

Registry 的持久化记录只保存注册源和可重建的状态元数据；Skill 文件内容仍从地址读取，避免缓存成为第二个事实来源。服务启动时先从 `skills.json` 恢复注册源，再执行一次刷新；单个地址刷新失败只影响该记录，不阻塞其他记录加载。

## 5. 持久化模型

### 5.1 Skill Registry

默认文件：`<dataDirectory>/skills.json`。

每条记录至少包含：

- `address`：注册地址；本地目录使用规范化绝对路径。
- `sourceType`：`local-directory`（为未来 `http`/`https` 保留联合类型）。
- `skillID`：从 `SKILL.md` 元数据解析出的稳定 ID。
- `status`：`ready`、`invalid` 或 `conflict`。
- `digest`：当前源内容摘要，用于刷新变化检测。
- `registeredAt`、`updatedAt`：ISO 时间戳。
- `error`：安全、可展示的校验错误；不得包含凭据。

对外列表和详情响应不得暴露本地绝对路径；可返回安全的 source label、类型、ID、状态、摘要和错误。管理端本地文件可以保存地址，以便服务恢复。

注册同一地址是幂等操作。不同地址解析出同一个 `skillID` 时全部标记为冲突，冲突项不得激活，直到用户删除其中一个注册或修复其 ID。

### 5.2 Default Role Prompt

默认文件：`<dataDirectory>/role-prompt.json`。

文件保存用户配置的文本和更新时间；不存在或内容为空时使用内置默认值。该配置与模型凭据、Skill 注册记录分离，避免权限和生命周期混在一起。

## 6. Registry 能力与 API

能力集合：

- `list`：列出安全摘要。
- `detail`：读取单个 Skill 的安全详情和校验状态。
- `register`：按 `address` 注册并立即校验。
- `refresh`：重新读取一个或全部注册源。
- `validate`：只执行校验，不改变激活上下文。
- `unregister`：删除 Nexum 注册记录和派生缓存，不删除源目录。
- `activate`：保留已有按 ID 激活语义，只有 `ready` Skill 可激活。

建议路由：

| 方法 | 路径 | 输入 | 行为 |
| --- | --- | --- | --- |
| GET | `/api/nexum/skills` | — | 列表 |
| GET | `/api/nexum/skills/:id` | — | 详情 |
| POST | `/api/nexum/skills/register` | `{ address }` | 注册并校验 |
| POST | `/api/nexum/skills/refresh` | `{ id? }` | 刷新单个或全部 |
| POST | `/api/nexum/skills/validate` | `{ id? }` | 校验单个或全部 |
| DELETE | `/api/nexum/skills/:id` | — | 删除注册 |
| POST | `/api/nexum/skills/:id/activate` | `{ sessionID, text }` | 激活 |

### 6.1 地址安全

- 本地地址必须解析为目录并包含合法 `SKILL.md`。
- 拒绝符号链接逃逸、路径遍历、非普通文件和超出文件大小限制的文件。
- HTTP(S) 地址在第一阶段作为明确的未实现/不支持错误处理，不静默当作本地路径。
- 错误响应只描述地址类型、校验阶段和失败原因，不回显 token、用户名密码或请求头。

## 7. 会话 Agent 工具

新增 `skill_registry` 工具，操作字段为：`list`、`detail`、`register`、`refresh`、`validate`、`unregister`，参数按操作要求使用 `id` 或 `address`。

工具描述必须明确：

- Nexum 是 Skill 注册事实来源；
- 需要新增或管理 Skill 时调用该工具；
- 不要用 shell 搜索工作区、读取未知目录或猜测注册位置；
- `unregister` 只删除 Nexum 注册，不删除源文件。

权限边界：

- `list`、`detail`、`validate`：只读能力。
- `register`、`refresh`、`unregister`：使用 `skill.manage` 权限。
- `@skill-id` 激活继续使用 `skill.use` 权限。
- 默认角色提示词 API 不加入 Agent 工具集合。

## 8. 默认角色提示词注入

Core 在每次发起模型调用时，将当前默认角色提示词放在模型消息的 system 区域，使用固定来源标识 `runtime:default-role`。它必须在新会话、恢复会话、继续执行和压缩上下文后的模型调用中重新参与组装，但不写入 Session 的用户/助手消息历史。

角色提示词可以表达“使用中文回答”“思考和解释尽量使用中文”等偏好，但 Nexum 只负责注入原文。模型供应商决定最终是否遵循；Nexum 不读取隐藏推理、不翻译思考、不替换输出、不做二次过滤。

建议提供：

- `GET /api/nexum/role-prompt`：读取当前值和来源信息。
- `PUT /api/nexum/role-prompt`：保存文本。
- `DELETE /api/nexum/role-prompt`：恢复内置默认值。

Web UI 将其作为独立配置抽屉，保存/恢复成功后刷新当前状态；保存失败不得覆盖页面上的未提交文本。

## 9. UI 行为

Skills 抽屉增加：

- 地址输入框与“注册 Skill”按钮；
- 列表中的状态、摘要、校验错误和最后刷新时间；
- 单项刷新、校验和取消注册操作；
- 取消注册前的确认提示，明确“不会删除源目录”；
- 注册/刷新完成后自动刷新列表，并更新 `@` Skill 建议。

模型配置旁增加“默认角色提示词”入口，支持查看、编辑、保存和恢复默认值。UI 不展示凭据，不把角色提示词当作 Skill 内容。

## 10. 事件与可观察性

Skill 注册状态变化应发送 `skill.updated`（或等价的 registry update event），携带 Skill ID、变更类型和安全摘要，让长连接 UI 在注册、刷新、校验、取消注册后更新；事件不得携带绝对路径或敏感地址信息。

已有 `skill.activated` / `skill.failed` 事件保持兼容。

生产日志只记录操作类型、Skill ID、状态和耗时；地址使用脱敏 label，错误使用结构化字段，不输出完整本地路径、凭据或 Skill 文件内容。

## 11. 测试与验收

### 单元/集成测试

- 注册本地 `SKILL.md` 目录并在重启后恢复。
- 同地址重复注册幂等。
- 不同地址同 ID 进入 conflict，不能激活。
- 删除注册后列表消失，源目录和文件仍存在。
- 刷新能反映 `SKILL.md` 或其他文件变化；坏源只标记自身。
- 路径遍历、符号链接、非法 frontmatter、超限文件被拒绝。
- Agent 工具正确映射操作和权限；不使用 shell 搜索。
- 默认角色提示词持久化、读取、恢复默认，并在每次模型调用的 system message 中出现一次。
- 模型请求体保持模型输入原文，Nexum 不做输出后处理。
- API 与客户端类型、能力声明、事件和 UI 状态一致。

### 浏览器验收

使用真实本地服务和会话：

1. 打开 Skills 管理面板。
2. 输入 `/Users/lvdaxianer/workspace/uino/project/ontomato_enterprise/skills/metric-view-lifecycle` 并注册。
3. 确认列表出现 `metric-view-lifecycle` 且状态为 `ready`。
4. 创建或选择 Session，发送一个需要该 Skill 的需求，确认 Agent 通过 Nexum Skill 管理/激活链路使用它。
5. 刷新页面或重启服务后确认注册仍在。
6. 取消注册，确认 UI 移除记录但本地 Skill 源目录仍可读取。
7. 在默认角色提示词中设置中文偏好，发送模型请求，确认请求上下文包含该 system message；确认 Nexum 没有改写模型返回内容。

## 12. 实施顺序

1. Core/Adapter：注册实体、地址加载、安全校验、持久化和恢复。
2. Protocol/Server/Client：详情、按地址注册、刷新、校验、取消注册、能力声明和事件。
3. Core/Adapter：默认角色提示词存储与模型上下文注入。
4. Agent 工具：`skill_registry` 操作和权限映射。
5. Surfaces：Skill 管理 UI 和角色提示词 UI。
6. 测试、类型生成、聚焦验证、浏览器验收，再合并回 `dev-v0.0.1`。

## 13. 风险与取舍

- 只保存注册地址而不复制内容，减少数据重复，但源目录移动后会进入 invalid；UI 应提供明确的错误和重新注册入口。
- 默认角色提示词不持久化到 Session，避免污染会话历史，但每次模型请求都必须重新组装，测试需要覆盖 resume/continuation/compaction。
- 初期不实现远程地址，避免引入下载、缓存、SSRF 和凭据问题；协议预留类型，后续单独评审。
- 取消注册不删除文件，用户需要自行管理源目录；这是防止误删和保护工作区的必要边界。
