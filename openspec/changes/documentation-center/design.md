# Design

## Information architecture

`docs/README.md` 是唯一文档中心，按读者任务分组：新手入门、按能力使用、API 查询、HTTP/SSE 协议、模块选择和深入架构。根 README 不再列出所有子文档，只引导用户进入文档中心。

## Source of truth

- TypeScript 公共入口和参数：对应模块源码与模块文档。
- HTTP/SSE 请求、响应和错误：`apis/nexum.md`。
- Session 和事件语义：`docs/capabilities/session.md` 与 `docs/capabilities/events.md`。
- 模块公共导入路径：发布 manifest 和 `docs/modules/README.md`。

## Documentation contract

每个模块文档的 API 区域至少说明：导入路径、核心 API、参数类型/必填性/含义/默认值、返回值、最小示例、组合关系和常见错误。仓库内部包名与用户安装后的 `nexum/<subpath>` 必须明确区分。

## Verification

- 检查根 README、文档中心和模块索引的本地链接。
- `git diff --check`。
- `bunx prettier --check "README.md" "docs/**/*.md"`。
- 运行已有文档入口审计脚本（如可用）。
