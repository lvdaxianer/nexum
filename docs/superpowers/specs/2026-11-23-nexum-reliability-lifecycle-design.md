# Nexum 三层可靠性生命周期设计

## 目标

本变更补齐 Nexum Core、Protocol、Application 三层的模型失败恢复和运行生命周期，不改变现有 ReAct-style Coding Loop、权限边界或工具工作目录限制。

## 三层边界

### Core

Core 负责模型失败分类的稳定消费、RetryPolicy、Attempt、退避、取消、上下文超限恢复、continue 前置条件和最终 settled 判定。Core 不知道 HTTP、SSE、Client 或 UI。

### Protocol

Protocol 负责公开错误结构、模型 Attempt/Retry/Settled 事件、事件顺序和实验性 continue API 的 schema。Protocol 不决定是否重试，也不执行模型或工具。

### Application

Server 负责 HTTP 入参校验、Session 冲突、traceId、错误映射、SSE 透传和 Runtime 装配；Surface 负责显示重试状态、保持运行态、呈现最终失败并触发 continue。Application 不重复实现 retry classifier。

Adapter 是 Core Port 的基础设施实现：OpenAI-compatible Adapter 解析供应商响应，Host/Tool Adapter 执行外部能力并尊重 AbortSignal。

## 关键语义

- 可重试错误限定为网络、超时、限流和上游暂时不可用，并支持 Retry-After 与最大等待上限。
- 已经产生可见模型增量后不透明重放当前步骤。
- 上下文超限走一次压缩恢复，不与普通网络重试混用。
- `session.*` 代表 Session 终态；`run.settled` 代表本次自动工作完全结束。
- `continue` 从已有 user/tool-result 上下文继续，不追加重复用户消息。

## 选择理由

采用垂直切片，每个能力同时贯穿 Core、Protocol、Application，并在每层提供测试。这样可以持续验证真实 SSE 和 Surface 行为，避免先完成一个无法被客户端消费的孤立 Core 重构。
