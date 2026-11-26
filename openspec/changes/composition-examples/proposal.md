# Proposal

## Why

根 README 直接展开多个 Runtime 组合和架构细节，第一次使用 Nexum 的读者无法判断从哪一段开始，也无法把模块职责和实际使用场景对应起来。

## What Changes

- 将 Runtime 组合拆成独立的、可点击的案例文档。
- 增加进程内嵌入、本地文件持久化、SQLite + HTTP/SSE 和聊天 UI 四个案例。
- 根 README 只保留组合选择表，并链接到案例和模块文档。
- 文档中心增加组合案例入口；每个案例链接相关模块、协议和 API 参数说明。

## Non-Goals

- 不修改运行时实现、Protocol 路由或发布产物。
- 不把仓库 workspace 启动和测试流程加入公共案例。

## Acceptance Criteria

- 新用户可以从 README 选择一个场景并进入独立案例。
- 每个案例说明适用场景、模块组合、完整示例、关键参数和下一步文档。
- 公共模块和 Protocol 在 README、案例和文档中心中均可点击到对应文档。
