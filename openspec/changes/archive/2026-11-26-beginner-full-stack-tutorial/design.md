# Design

## 教程路径

教程按用户可观察的结果推进：先安装公共包，再创建后端 Runtime，配置模型和角色，绑定 Server，创建 Session，最后把 Session 交给 Chat Surface。每一步都说明“这一步解决什么问题”和“参数从哪里来”。

## 组合边界

```text
前端 Chat Surface → Client → HTTP/SSE Server
                              ↓
                Application + Core + SQLite Persistence
                              ↓
                         Model Provider
```

SQLite 保存 Runtime 状态；Server 只提供协议边界；Client 负责请求和事件；Chat Surface 负责展示，不复制 Agent 执行逻辑。

## 文档分层

- README：五到七步的入门主线。
- `docs/examples/full-stack-chat.md`：完整代码、参数解释、数据流和排错入口。
- 现有模块文档：查询每个模块的 API 参数和边界。

## Verification

- 检查教程和 README 的本地链接。
- 检查示例使用的导出、字段和公开 subpath。
- `git diff --check` 和相关 Markdown Prettier 检查。
- 运行 `bun run verify:docs` 和 `bun run check`。
