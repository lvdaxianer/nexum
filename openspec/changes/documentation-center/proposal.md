# Proposal

## Why

Nexum 的公开文档目前分散在根 README、能力文档、模块文档和 HTTP API 文档中。内容本身存在，但初次使用者无法判断应该从哪里开始，也无法在一个位置查询 Session 操作和模块 API 参数。

## What Changes

- 将 `docs/README.md` 改造成面向使用者的唯一文档中心。
- 让根 README 只保留简短介绍和文档中心入口。
- 将 Session、事件、权限、Question 和 Prompt 的使用路径聚合到能力导航中。
- 为模块文档统一增加公开导入路径、核心 API、参数说明、返回值和最小示例的查询入口。
- 保留 `apis/nexum.md` 作为 HTTP/SSE 协议的详细参考，避免复制协议契约。

## Non-Goals

- 不修改运行时代码、Protocol、HTTP 路由或发布产物。
- 不在公开文档中增加 workspace 安装、源码启动或仓库测试流程。

## Acceptance Criteria

- 用户从根 README 进入一个唯一的文档中心后，可以按入门、能力、模块 API、HTTP/SSE 和架构继续查阅。
- Session 的创建、查询、Prompt、事件、历史、权限、Question、继续、取消和删除入口在同一条导航中可达。
- 模块文档中的公共导入路径使用 `nexum/<subpath>`，并说明参数含义和使用场景。
