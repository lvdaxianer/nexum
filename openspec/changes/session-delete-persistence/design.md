# Design

## Context

See `proposal.md` and `specs/nexum-session-deletion/spec.md` for motivation and observable behavior. 当前 Nexum Runtime 将 Session、消息、交互和事件拆成独立的本地 JSON Store；Server 已经持有这些端口，但它们目前没有统一的按 Session 清理操作。`NexumSessionError` 已有 `session_busy` 错误码，可复用现有运行冲突契约。

## Goals / Non-Goals

**Goals:**

- 让一次 DELETE 请求能够清理 Nexum 拥有的所有目标 Session 数据。
- 让 Store 删除操作具备幂等性，并保持现有 JSON 文件的原子写入和串行写入约束。
- 在删除前拒绝运行中的 Session，避免 Coding Loop 继续写入被删除的历史。
- 让 Client 和 UI 以稳定的资源 ID 完成删除、确认、失败恢复和当前项切换。

**Non-Goals:**

- 不删除、移动、归档或修改用户工作目录中的文件。
- 不删除全局模型配置、权限策略或其它 Session 的数据。
- 不引入软删除、回收站、恢复接口或跨文件数据库事务。
- 不改动主 OpenCode `packages/client` 的生成 SDK；本次对外边界属于手写的 `@nexum/client`。

## Decisions

### 1. 使用 DELETE 资源接口

采用 `DELETE /api/nexum/session/:sessionID`，成功响应继续使用 Nexum JSON Envelope，返回 `{ id, deleted: true }`。资源 ID 放在 path，符合现有 API 约定；请求不需要 body、query、Cookie 或幂等键。重复删除返回稳定 404，调用方可把它视为目标已不存在。

备选方案是 POST `/session/delete`，但会弱化资源语义并与现有 `/session/:sessionID` PUT/状态路由不一致，因此不采用。

### 2. Store 端口提供显式按 Session 清理能力

在 Core 的 SessionStore 增加 `delete(sessionID)`；在 MessageStore 增加删除能力；在 InteractionStore 增加 `deleteSession(sessionID)`；在 EventHub 增加 `delete(sessionID)`。内存和文件实现都按同一语义实现：目标不存在视为成功，其他 Session 保持不变，文件通过同目录临时文件和 rename 原子替换。

将清理能力放在 Store 端口，而不是让 Server 解析 JSON 文件或复制存储细节，保持 Schema/Core/Protocol/Server 的依赖方向和可替换存储边界。Server 只负责编排顺序与 HTTP 错误映射。

### 3. 依赖数据先清理，Session 元数据最后删除

Server 在确认 Session 存在且不是 `running` 后，依次清理消息、交互、事件，再调用 Session Service 删除元数据。多文件 JSON 没有跨文件事务，因此顺序优先保证失败时 Session 元数据仍可见，用户可以针对同一 ID 重试。每一步都只删除目标 Session，且删除过程不触碰工作目录。

若清理过程中发生存储错误，统一返回 caller-safe 的 `NEXUM_SESSION_DELETE_FAILED`；内部错误只进入现有请求边界日志，Session 元数据保留，避免把“看不见但未完成”的状态当成成功。

### 4. UI 复用现有确认组件和局部状态

在“会话操作”抽屉增加独立的红色删除按钮，点击只打开 `ConfirmDialog`，确认按钮在请求结束前保持 loading/disabled。成功响应确认后，UI 才 abort 当前 SSE、移除稳定 ID 对应列表项、清理 `sessionStorage`，并选择列表中的下一个 Session；失败则关闭 pending 状态、保留当前 Session，并通过现有 notice/`aria-live` 提示重试。

不做乐观删除，因为删除是不可逆的本地数据操作；也不重拉整个 Session 列表，成功删除时直接按 ID 进行结构性移除，避免无关 Session 重新挂载。

## Risks / Trade-offs

- [跨文件非事务] 清理某个 Store 后下一个 Store 失败，短暂留下部分历史。→ 先清理依赖数据、最后删除 Session 元数据；失败返回稳定错误并保留 ID 供重试；测试覆盖部分失败路径。
- [运行状态竞争] 删除请求检查后运行状态可能发生变化。→ Server 复用现有按 Session 运行占用约束，并仅允许非 `running` 状态进入清理；UI 同时禁用运行中的删除入口。
- [历史事件订阅] 删除时可能仍有空闲 SSE 订阅。→ 前端成功后主动 abort；EventHub 删除回放历史，后续新连接不会恢复已删除事件。
- [接口实现兼容] Store 端口新增方法会影响注入自定义 Store 的测试实现。→ 在同一变更中更新所有仓库内实现和测试夹具，保持编译期发现遗漏。

## Migration Plan

无需数据迁移。旧版 JSON 文件继续按现有版本格式读取；首次删除时仅移除目标 Session 对应条目。发布顺序先部署支持新方法的 Server/Store，再部署调用 DELETE 的 Client/UI；旧客户端只会继续使用已有接口。回滚代码不会恢复已经删除的数据，因此删除前端入口需要随 Server 一起发布并通过验证后再开放。

## Open Questions

无。删除是否保留工作目录已由用户确认，运行中拒绝删除和完整清理边界已在方案批准时确定。
