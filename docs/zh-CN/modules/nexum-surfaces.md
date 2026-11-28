# 内部 Workbench 迁移说明

[English](../../modules/nexum-surfaces.md)

原 `nexum-surfaces` 包承载完整 Web 演示工作台。现在它不再是公共包，也
不再提供 `nexum-ai/surfaces` subpath；工作台源码已经迁移到
`packages/nexum-test`，左侧导航、Session、模型、Skill、权限和 MCP 管理
都由 Test Workbench 负责，右侧聊天区通过 `import` 引入公共 ChatSurface。

外部项目只使用：

```tsx
import { ChatSurface } from "nexum-ai/chat-surface"
import "nexum-ai/chat-surface/styles.css"
```

启动内部演示工作台：

```sh
bun run dev:surface
# 或
bun run --cwd packages/nexum-test dev
```

公共 UI 契约请阅读 [ChatSurface 文档](nexum-chat-surface.md)。
