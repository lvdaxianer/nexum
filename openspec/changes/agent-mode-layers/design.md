# Design

## Context

See `proposal.md` for the motivation. 当前 Core 已经保存 Session 模式并在 Coding Loop 中执行 Plan 限制，Protocol 也已有创建和切换模式的基础接口；但 Application Runtime 没有向 Core 传递默认模式，Surface 的新建 Session 表单没有提交 mode，且页面的模式信息不够突出。现有持久化数据可能缺少 mode，因此兼容默认必须继续是 Build。

## Goals / Non-Goals

**Goals:**

- 让 Application、Protocol、Core 对同一套 `plan | build` 模式拥有一致的类型、默认值和覆盖优先级。
- 让 `createEmbeddedRuntime({ defaultAgentMode })` 影响未显式指定模式的 Session，同时允许 `session.create({ mode })` 覆盖它。
- 让页面在创建、列表、当前会话和 Composer 控制区中清楚展示模式，并保持失败回滚和运行中禁用。
- 通过 Core 的真实 Session 和 Coding Loop 路径验证行为，而不是在 UI 内复制模式规则。

**Non-Goals:**

- 不改变 Plan 模式已经定义的工具白名单和计划目录边界。
- 不让 `defaultAgentMode` 覆盖调用方显式传入的 Session mode。
- 不把权限策略 `ask`、`balanced`、`full` 与 Agent 模式合并为一个枚举。
- 不在 ChatSurface 内创建或管理 Session；模式仍由宿主页面和 Protocol 控制。

## Decisions

### 1. 模式默认值放在 Core，Application 只负责注入

在 Core 的 `NexumSessionServiceOptions` 增加可选 `defaultAgentMode`，创建 Session 时按“显式输入 > Service 默认 > build”解析。Application 的 `NexumRuntimeOptions` 暴露同名配置，并在自动创建 Session Service 时传递；如果调用方注入自定义 Session Service，则由该 Service 自己负责默认值。

选择 Core 作为默认值的唯一归属，是为了保证 CLI、Server、嵌入式 Runtime 和测试都经过同一个领域边界。只在 Application 里填充默认值会让直接使用 Core 的调用方得到不同结果；只在 Protocol 里填充则会让非 HTTP 调用绕过规则。

替代方案是让 Runtime 保存一个全局可变 mode，再由每次请求读取；该方式会把不同 Session 的实例配置混在一起，并且无法正确表达单 Session 覆盖，因此不采用。

### 2. Protocol 使用创建请求显式传值，响应始终返回规范化值

保留现有 Session 创建路径，在 JSON body 中接受可选 `mode`，服务端做边界校验后传给 Core。公共 Session 投影统一输出 `mode`，旧记录由 Core 和持久化适配器规范化为 `build`。Client SDK 的 create 输入和返回类型与 Protocol 对齐。

这样既兼容未传 mode 的旧客户端，也让页面不需要猜测缺失值。非法模式在 HTTP 边界返回稳定参数错误，不进入 Core 写入。

### 3. Surface 采用“创建时选择 + 当前状态常驻展示”

新建 Session Drawer 增加 Plan/Build 单选控件，默认显示 Build，并在提交成功后使用响应中的 mode 更新 Session 列表和当前 Session。Session 列表在状态标签旁显示模式徽标；当前标题或 Composer 控制区再显示一个常驻模式标签/切换组。已有权限策略控件保持独立，避免把“能否执行”误解为“当前 Agent 模式”。

模式切换沿用现有的局部 busy 状态和 `mergeSessionSnapshot`，只合并目标 Session，不重新拉取或重建整个列表。请求失败时不做乐观模式变更，保留旧值并显示可重试提示；running 时禁用控件并提供原因。

### 4. 测试从三层契约到页面状态逐层覆盖

Core 测试覆盖 Service 默认、显式覆盖和持久化后的执行模式；Application 测试覆盖 Runtime 默认配置传递；Protocol/Client 测试覆盖创建请求、响应和错误；Surface 单元测试覆盖创建 payload 和模式快照合并，必要时补充组件级页面断言。每层测试调用真实实现，避免复制模式解析逻辑。

## Risks / Trade-offs

- [旧数据缺少 mode] → 持久化读取和公共投影都将缺失或非法值规范化为 `build`，并增加回归测试。
- [自定义 Session Service 不接受 Application 默认值] → 只有 Application 自动创建的 Service 注入该配置；自定义 Service 仍由其公开的 Core 契约负责默认值，类型检查保证参数可见。
- [页面模式标签与后端状态短暂不一致] → 创建和切换只在成功响应后合并 Session 快照，失败不乐观更新；当前 Session 选择时重新使用服务端状态。
- [用户混淆 Agent 模式和权限策略] → 使用独立标签、文案和 `aria-label`，并在控件说明中分别解释 Plan/Build 与权限策略。

## Migration Plan

1. 先发布兼容的 Core/Application/Protocol/Surface 代码，未传 mode 的调用继续创建 Build Session。
2. 现有持久化记录在读取时规范化为 Build，不需要一次性数据库迁移；新写入记录带上明确 mode。
3. 部署后验证 API 创建、列表恢复和页面新建流程；如需回滚，旧客户端仍可不传 mode，旧记录的 Build 兼容路径保持可读。

