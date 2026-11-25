# Nexum Runtime-first 能力建设设计

## 目标

以 OpenCode issues 归并出的高频运行时问题为输入，把 Nexum 建设为可恢复、可观测、安全隔离、可扩展的 Agent Runtime。实现顺序优先保证 Core、Persistence、Integrations、Protocol 和 Server 的稳定性，再扩展 Automation、Plugin、ACP 与产品 Surface。

## 范围

本次路线包含四个阶段：

1. 执行可靠性与安全边界；
2. Provider 与 Session 持久化演进；
3. Automation、Plugin、MCP 和 ACP 扩展；
4. Service、诊断和产品 Surface。

Desktop、Mobile 和完整浏览器工作区不是第一阶段交付物，但协议和 Runtime 必须为它们保留可组合边界。

## 架构决策

### 1. Core 只拥有运行语义

Core 负责 Session、Coding Loop、Admission、Permission、Question、Context、事件和领域错误。它不直接创建文件、网络、数据库、进程或 UI。需要持久化执行 claim、沙箱、Provider、调度器或插件宿主时，先定义 Port，再由 Application/Integrations 提供实现。

### 2. Durable state 与 advisory state 分离

用户 Prompt、任务 Admission、运行 claim、消息历史和终态必须可恢复；思考动画、连接状态、重试倒计时和 UI loading 只作为投影或 advisory state。恢复时以 canonical history、运行 claim 和事件 cursor 为事实来源，不用最后一段文本推断状态。

### 3. 安全策略在运行时边界执行

Permission 负责“是否允许”，Host/Sandbox 负责“在哪里执行”和“能使用哪些资源”。文件、Shell、网络、MCP 和插件都必须经过同一套资源归一化、风险分类、脱敏和审计边界。

### 4. Provider 差异收敛在 Integrations

Core 只消费统一的 ModelPort、ModelError、ModelCapability 和 Usage 语义。Provider-specific 的参数、finish reason、reasoning、限额、重试、成本和模型目录不能泄漏到 Core 或 Surface。

### 5. Protocol 是唯一跨 Surface 边界

Server 只负责 HTTP/SSE 映射和错误边界；Client 只消费 Protocol；CLI、Web、Desktop、ACP 和未来 Mobile 都通过 Client/Adapter 接入，不直接依赖 Core 或 Server。

## 阶段验收标准

### 阶段一：运行可靠性与安全

- 运行中的 Session、子任务和工具调用可取消、可超时、可观测；
- 进程重启后可识别未完成运行，并按明确策略恢复或安全终止；
- Shell、文件、网络和 MCP 不得越出资源边界；
- 密钥、授权码、Headers、绝对路径和原始异常不进入普通事件、响应和日志；
- 所有高风险操作都有稳定错误码、traceId 和可审计结果。

### 阶段二：Provider 与持久化

- 新增 Provider 不需要修改 Core；
- 模型能力、错误、重试、Token 和成本可被统一消费；
- Session 数据有版本、迁移、归档、分页和损坏恢复策略；
- History 与 Event replay 可以在断线、迁移和重启后重建一致投影。

### 阶段三：扩展协议

- Automation、Plugin、MCP、ACP 的后台操作有明确所有权、取消、恢复和权限边界；
- 扩展不能绕过 Core Permission 或直接写入不可追溯的 Session 状态；
- 外部协议事件保持顺序、cursor 和终态语义。

### 阶段四：产品化

- Service 可健康检查、认证、重连和远程接入；
- Surface 只负责投影和交互，不复制运行逻辑；
- Desktop/Mobile/TUI 的平台差异通过 Host/Adapter 隔离。

## 非目标

- 第一阶段不复刻 OpenCode Desktop 的全部交互；
- 不在 Core 内嵌某个具体 Provider SDK；
- 不把 Plugin、Automation、MCP 和 Skill 混成一个无边界的“万能工具”；
- 不为理论上的分布式集群引入跨节点所有权，直到本地恢复语义稳定。

## 风险与控制

| 风险                            | 控制措施                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------- |
| 现有 Headless/OpenCode 命名残留 | 以 `packages/nexum-*` 和 `nexum.runtime.v1` 为事实边界，旧 OpenSpec 只做迁移参考 |
| 运行 claim 与消息历史不一致     | 先定义恢复矩阵和幂等规则，再实现存储；所有恢复场景写集成测试                     |
| Provider 特殊逻辑污染 Core      | 只扩展 ModelPort/ModelError/Usage 契约，Provider 适配留在 Integrations           |
| 安全策略被某个 Surface 绕过     | API、CLI、Plugin、MCP 都进入同一 Tool/Permission/Host 路径                       |
| 大范围 UI 任务拖慢 Runtime      | Surface 任务必须以后端契约和状态投影完成为前置条件                               |
