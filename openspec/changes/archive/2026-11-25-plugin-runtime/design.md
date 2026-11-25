# Design

## Context

当前 Core 已经有 Session、Skill Registry、Skill 显式激活、Permission、Tool Registry 和事件流。独立 Skill 的 `@<skill-id>` 解析会读取 `SKILL.md` 并将内容附着到当前 Prompt，但没有一个可以同时挂载多个 Skill、Function、Workflow 和 Hook 的运行时扩展边界。

本设计遵循现有依赖方向：Core 只定义 Plugin 的类型和端口；Application 负责本地来源、Manifest 扫描、运行时加载和组合；Server/Protocol 只负责公开稳定的控制面。Plugin 的激活必须复用现有 Session、Permission、Tool 和 Event 边界。

## Goals / Non-Goals

**Goals:**

- 让 Plugin 成为与独立 Skill 平级的顶层可激活能力。
- 支持 `@<plugin-id>` 的确定性激活和自然语言自动激活。
- 让 Plugin 内部的 Skill、Function、Workflow 和 Hook 在激活后进入当前 Session 的作用域。
- 使用渐进式加载：先注册安全描述，命中后再加载实现和完整内容。
- 让激活、挂载、失败、停用和清理具有可测试的生命周期边界。

**Non-Goals:**

- 本变更不实现客服 Case、人工任务、SLA 或完整业务 Workflow 引擎。
- 本变更不支持 `@plugin/internal-capability` 形式的用户直接调用。
- 本变更不引入远程进程沙箱或 Plugin 市场。
- 本变更不允许 Plugin 绕过已有 Tool、Permission 或 Session 执行路径。

## Decisions

### 1. Core 定义端口，Application 提供实现

Core 新增 `PluginManifest`、`PluginRegistry`、`PluginActivationPort` 和 `PluginRuntime` 相关类型，但不依赖文件系统、动态导入或 Server。Application 提供本地 Plugin Source、Manifest Validator、Loader 和 Runtime Composer。

这样可以保持 Schema/Core/Protocol/Server 的依赖方向，并允许未来替换成本地目录、npm 包或远程协议来源。把 Loader 放进 Core 会让核心运行时绑定宿主环境，也会使测试和后续远程插件实现变复杂。

### 2. 顶层 Plugin 与内部能力分离

Registry 维护两种不同视图：

- 顶层视图：独立 Skill 和 Plugin，供用户 `@`、页面发现和自然语言路由使用。
- 激活作用域视图：某个 Session 已激活的 Plugin 所提供的 Skill、Function、Workflow 和 Hook。

Plugin 内部能力使用 `pluginId` 命名空间保存，但不进入顶层 `@` 解析器。这样 Plugin 可以自由重组内部实现，而不会改变用户入口。

### 3. 两种触发方式汇聚到同一个激活端口

显式 `@plugin` 在 Prompt admission 阶段解析并直接调用 `PluginActivationPort`。自然语言路由通过一个模型可见的内部控制能力选择 Plugin；该控制能力只负责根据已注册的 Plugin 描述请求激活，不执行领域副作用。两条路径最终都经过相同的状态校验、Permission、Loader、Mount 和事件发布流程。

自然语言路由的第一版只向模型提供启用 Plugin 的安全摘要，包括 ID、描述、意图和示例；命中后再加载完整 Plugin 内容和内部工具定义。没有唯一合适 Plugin 时，不自动激活，继续普通 Agent 处理或请求澄清。

选择模型可见控制能力而不是为每个 Plugin 预先注册一个独立工具，原因是它避免把大量未激活 Plugin 的内部 Function 暴露给模型，并保持 Plugin 的加载边界。未来 Plugin 数量增大时，可以在同一端口前增加索引检索，而不改变激活契约。

### 4. 激活与执行分离

`@crm` 或自然语言命中只会使 `crm` 进入当前 Session 的 active scope；它不会自动执行退款、发消息或修改订单。激活成功后，下一次模型请求才能看到 Plugin 的内部 Skill 和 Function，由模型或 Workflow 决定具体动作。

这避免了激活行为携带不可预期的业务副作用，也使 Permission 能够继续在具体工具调用处做细粒度审批。若未来某个 Plugin 需要默认流程，应通过显式 Workflow 或用户请求触发，而不是改变基础 `@plugin` 语义。

### 5. 生命周期与作用域

Plugin 状态采用：`registered`、`activating`、`active`、`failed`、`disabled`。Manifest 注册是进程或 Runtime 级的；内部能力挂载默认是 Session 级的。停用时先阻止新调用，再撤销注册，最后等待或取消 Plugin 自己拥有的后台工作。

Plugin 只通过宿主提供的 Context API 访问 Session、Tool、Permission、Event 和配置。宿主记录激活、失败、停用和内部能力变更，避免 Plugin 自己写入不可回放的运行时状态。

### 6. Manifest 只暴露路由所需的安全信息

Manifest 的公开摘要包含稳定 ID、版本、描述、路由意图、示例、导出能力摘要和状态；不包含宿主绝对路径、密钥、环境变量值或运行时实现细节。完整 Skill 指令、Function Schema 和 Workflow 定义只在激活后读取。

这延续现有 Skill Registry 的安全元数据边界，也让自然语言路由的上下文成本与插件实现大小解耦。

## Risks / Trade-offs

- [自然语言路由误激活] → 只有模型明确选择可用 Plugin 控制能力时才激活；显式 `@` 优先；低置信或多候选时保持未激活并走澄清/普通 Agent。
- [Plugin 描述污染模型上下文] → 第一版只注入短摘要和有限示例；内部内容和工具 Schema 在激活后按 Session 作用域注入。
- [激活失败导致部分注册] → Mount 使用可回滚的注册批次；任一内部能力注册失败，撤销本批次并将 Plugin 标记为 `failed`。
- [Plugin 卸载存在后台任务] → Plugin Context 记录所有拥有的任务，停用先撤销新调用资格，再等待或取消任务并发布终态事件。
- [公共协议扩大] → Core/Application 先完成内部端口和测试，Server/Protocol 只在稳定的生命周期和错误契约确定后增加 API；任何公开 HttpApi 变更都执行客户端生成和协议检查。

## Migration Plan

1. 在任务分支中先提交 Core Plugin Manifest、Registry、激活和路由端口，以及对应的纯契约测试。
2. 在后续任务中加入 Application 本地来源、Loader、Session 作用域挂载和一个测试 Plugin fixture。
3. 接入显式 `@plugin` 和自然语言控制能力，验证未激活 Plugin 的内部能力不会进入模型工具集。
4. 最后增加 Server/Protocol/Client 的 Plugin 管理接口和事件；若运行时默认没有 Plugin，现有独立 Skill 和 Coding 流程保持不变。
5. 回滚时关闭 Plugin 注册来源并移除激活入口；已存在的 Session 只保留可回放的 Plugin 生命周期事件，不伪造成功执行结果。
