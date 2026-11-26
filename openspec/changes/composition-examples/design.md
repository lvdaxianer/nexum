# Design

## 案例分层

案例按部署边界组织，而不是按源码目录组织：进程内、文件持久化、SQLite 服务和聊天 UI。每个案例独立解释“适合谁、组合关系、代码、参数和相关文档”。

## 文档导航

- `docs/examples/README.md`：案例选择入口。
- `docs/examples/*.md`：具体组合案例。
- `README.md`：只保留案例选择表和链接。
- `docs/README.md`：文档中心聚合案例、能力、API 和模块入口。

## 公共边界

案例只使用 `nexum/<subpath>` 公共导入路径和用户可调用的 API。案例不展示仓库安装、源码启动或包级测试命令。HTTP/SSE 的详细契约继续由 `apis/nexum.md` 维护。

## Verification

- 检查所有案例 Markdown 链接和模块链接。
- 检查示例使用的导出和字段与当前源码一致。
- `git diff --check` 和相关 Markdown Prettier 检查。
- 运行 `bun run verify:docs` 和 `bun run check`。
