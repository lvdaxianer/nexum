# Headless Session 工作台重设计

## 背景

当前 `packages/headless-ui` 把“项目上下文”“工作目录”“Session 创建”和“全局模型配置”放在同一条初始化路径上。用户看到的是一个需要先填目录、再创建 Session 的技术演示页，但看不出以下关系：

- Session 是实际执行任务的一级对象；
- 模型服务配置是全局配置，可以被所有 Session 使用；
- 工作目录属于具体 Session，不同 Session 可以指向不同目录；
- Session 关闭或服务重启后，已配置的目录仍然应该被保留。

本次重设计面向单机 POC，不引入多用户、权限体系或完整对话历史持久化。

## 目标

1. 让用户打开页面后首先理解并管理 Session，而不是先理解内部 API 状态。
2. 把模型配置明确标记为全局配置，并与当前 Session 解耦。
3. 支持创建多个带名称和工作目录的 Session，并在服务重启后恢复 Session 列表和目录。
4. 保留当前执行、事件、Permission、Question、Skill 等能力的入口，不改变已有 Headless 执行语义。
5. 用简单的服务端 JSON 文件实现 POC 持久化，避免把数据放进浏览器或引入数据库。

## 非目标

- 不持久化完整事件流、Prompt 内容、模型响应或上下文快照。
- 不实现跨机器共享、并发写入协调、用户登录和多租户隔离。
- 不把模型 Credential 明文写入 Session 文件；现有 credential/credentialRef 约束保持不变。
- 不新增稳定 API；新增或调整的 HTTP 能力继续位于 `/api/experimental/headless/...`。

## 核心概念

### 全局模型配置

模型配置独立于 Session，服务进程内只有一份当前配置：

```text
GlobalModelConfig
├── baseUrl
├── model
├── credentialConfigured
└── credentialRef?
```

页面中的“模型配置”作为独立导航项或独立抽屉入口。Session 详情只展示当前 Session 使用全局模型配置，不复制一份模型配置到每个 Session。

### Session

Session 是页面的主对象。每个 Session 至少包含：

```text
SessionRecord
├── sessionID
├── name
├── directory
├── status
├── createdAt
└── updatedAt
```

规则：

- `directory` 必须是运行服务可读写的绝对路径。
- `name` 创建时可选；未填写时使用目录最后一段作为默认名称。
- 用户可以编辑 Session 名称，但名称不改变 Session ID 或工作目录。
- `directory` 在创建 Session 时保存，并在后续选择 Session 时恢复到当前上下文。
- `status` 是运行时投影；服务重启后不把 `running` 伪装成仍在执行，启动时应将非终态运行状态恢复为可继续使用的空闲状态。
- `updatedAt` 在名称、目录或运行状态发生变化时更新，用于列表排序和显示最近使用信息。

## 页面信息架构

### 左侧导航

左侧区域按以下顺序组织：

1. 产品/工作台标识。
2. `Session` 列表：显示名称、目录短路径和状态；当前 Session 高亮。
3. `新建 Session`：打开创建表单。
4. `模型配置`：打开全局模型配置抽屉或页面。
5. `Skills`：保留现有入口。

Session 列表为空时，列表区域显示“创建第一个 Session”，而不是把目录输入长期固定在“项目上下文”卡片中。

### 主工作区

主区域顶部显示：

- 当前 Session 名称；
- 当前工作目录；
- 当前 Session 状态；
- 全局模型摘要；
- 重连、刷新和取消执行等与当前 Session 相关的操作。

未选择 Session 时，显示明确的空状态：先创建或选择 Session；模型未配置时，再提示去配置全局模型。

选择 Session 后，Coding Loop、事件明细和运行监控全部绑定到该 Session。切换 Session 时清空仅属于当前页面的瞬时事件展示，重新读取目标 Session 的状态，不修改目标 Session 的历史执行事实。

### 新建 Session 表单

表单字段：

- `Session 名称`：可选；为空时由目录名生成。
- `工作目录`：必填，绝对路径。

提交后服务端生成 Session ID 并持久化记录，前端将新 Session 设为当前 Session。表单错误必须指出是名称还是目录问题；目录校验失败时不创建部分记录。

### 全局模型配置

模型配置表单独立于 Session 创建流程，继续支持：

- 服务地址；
- 模型名称；
- Credential 引用或当前运行时 Credential；
- 保存和探测连接。

保存模型配置不会创建、切换或修改 Session。未配置模型时，Session 仍然可以创建和保存，但执行 Prompt 前需要提示完成全局模型配置。

## 服务端持久化

### 存储位置

新增文件型 `SessionStore` 实现，数据文件放在 Headless 服务的数据目录中，例如：

```text
<headless-data-dir>/sessions.json
```

数据文件只包含 Session 元数据：

```json
{
  "version": 1,
  "sessions": [
    {
      "sessionID": "...",
      "name": "project",
      "directory": "/workspace/project",
      "status": "idle",
      "createdAt": "2026-11-21T00:00:00.000Z",
      "updatedAt": "2026-11-21T00:00:00.000Z"
    }
  ]
}
```

实现要求：

- 服务启动时读取文件；文件不存在时使用空列表并创建目录/文件的时机保持惰性。
- 写入使用临时文件加原子替换，避免进程中断留下半个 JSON 文件。
- 读取到旧版本记录时进行一次边界迁移：缺少 `name` 时从目录名推导，缺少时间字段时使用当前时间；不在业务层重复做兼容判断。
- JSON 损坏时服务不得静默覆盖原文件；记录错误并以明确的不可用状态启动，或按现有服务错误约定拒绝读取。
- 列表返回稳定排序，优先按 `updatedAt` 倒序，确保最近使用的 Session 在前。
- 内存中的执行状态仍然属于运行时，不把完整执行过程写入文件。

全局模型配置继续使用现有配置存储语义。若本次实现需要持久化模型 URL、模型名或 credentialRef，应沿用现有安全输出模型，Credential 明文不得写入文件；若 POC 当前只要求 Session 持久化，则保持模型配置的现有生命周期并在规格实现中明确这一点。

## API 与客户端契约

保持实验性路由前缀：

```text
POST /api/experimental/headless/session
GET  /api/experimental/headless/session
GET  /api/experimental/headless/session/:sessionID
```

创建请求从仅包含目录扩展为：

```json
{
  "name": "可选的 Session 名称",
  "directory": "/workspace/project"
}
```

响应和列表项统一返回 `id/sessionID` 的现有客户端约定、`name`、`directory`、`status`、`createdAt` 和 `updatedAt`。不在 UI 中拼接或推测服务端生成的 ID。

如果公共 `Server HttpApi` 或 Protocol 类型发生变化，必须在 `packages/client` 执行 `bun run generate`，禁止手工编辑生成客户端文件。

## 状态与错误处理

- 创建 Session 请求进行中时禁用重复提交。
- Session 列表加载失败时保留已选 Session 的本地显示，但提示服务端状态不可用；不要把失败误显示为空列表。
- 选择已不存在的 Session 时清除当前 Session，并显示可恢复的刷新/重新选择入口。
- 服务重启后如果某条记录原状态为 `running`，前端显示为可继续使用的 `idle` 或明确的“需要恢复”状态，不能显示虚假的运行中。
- Session 目录存在但不可读写时，创建和更新都拒绝并给出绝对路径错误。
- 模型未配置只阻止执行 Prompt，不阻止 Session 创建、切换或持久化。

## 测试与验收

### Core

- 文件不存在时 `list()` 返回空列表。
- 创建并保存多个 Session 后，重新实例化 Store 仍能读出名称、目录和时间字段。
- 更新一个 Session 不会覆盖或改变其他 Session 的目录。
- 旧记录缺少名称时能从目录名迁移出默认名称。
- 持久化写失败或 JSON 损坏时返回可识别错误，不静默丢弃数据。

### Server/Protocol

- 创建接口接受可选 `name`，未提供时返回目录名默认值。
- 列表接口返回多个 Session 的独立目录和名称。
- 服务重启模拟后列表仍然包含之前创建的 Session。
- 模型配置接口仍保持全局语义，保存模型不会创建 Session。

### UI

- 空列表时能从 Session 入口创建第一个 Session。
- 创建两个不同目录的 Session 后，列表能看到两个名称，切换后工作目录随 Session 改变。
- 编辑名称不改变 Session ID 和目录。
- 全局模型配置入口与 Session 创建入口视觉上分离。
- 刷新页面或重启服务后，Session 列表和目录仍可恢复。
- 现有 Prompt、事件流、Permission、Question、Skill 和连接状态路径不回归。

验收命令以仓库实际脚本为准，至少包括：

```bash
bun run --cwd packages/headless-core typecheck
bun run --cwd packages/headless-server typecheck
bun run --cwd packages/headless-ui typecheck:tsc
bun run --cwd packages/headless-ui build
bun run --cwd packages/headless-ui test:smoke
```

根目录 `bun run check` 作为补充验证；若基线或环境问题导致失败，必须记录具体失败命令和输出，不得用局部通过替代根检查结论。

## 分阶段实现顺序

1. Core：扩展 Session 元数据、文件型 Store、迁移和持久化测试。
2. Server/Protocol：扩展创建和列表契约，接入持久化 Store，补服务端测试并生成客户端类型。
3. UI：重排 Session-first 信息架构，增加名称字段、Session 列表和全局模型入口，补切换/刷新 smoke 测试。
4. 集成验证：按工作流执行代码审查、完整检查、提交并合并回 `dev-v0.0.1`。
