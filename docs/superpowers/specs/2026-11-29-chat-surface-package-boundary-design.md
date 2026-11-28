# ChatSurface 公共打包边界设计

## 目标

公共包只提供右侧 `ChatSurface`，完整演示平台只存在于 `nexum-test`。外部项目通过 `nexum-ai/chat-surface` 和 `nexum-ai/chat-surface/styles.css` 引入聊天区域，并可用 `theme="light"` 或 `theme="dark"` 固定主题。

## 设计

- `packages/nexum-chat-surface`：唯一公共 UI 模块，提供 Solid 组件、Web Component、类型和 CSS。
- `packages/nexum-test`：内部演示平台，持有左侧导航、Session、模型、Skill、权限和 MCP 等页面；右侧通过 `import { ChatSurface } from "@nexum/chat-surface"` 渲染。
- `packages/nexum-surfaces`：不再作为公共 package 或 public subpath；工作台源码迁移到 `nexum-test`，避免发布脚本继续枚举它。
- `script/build-nexum.ts`：只构建 `chat-surface` 公共入口，生成低版本浏览器 ESM，并在写入前检查/拒绝 `import.meta`、顶层 `await` 和 workspace specifier。
- `script/verify-nexum.ts`：验证 tarball 只有 ChatSurface UI 入口、声明和 CSS，且低版本产物扫描通过。

## 主题契约

`ChatSurfaceProps.theme` 只接受 `"light" | "dark"`。主题变量定义在组件根节点，显式传入时只影响组件自身，不修改宿主文档的全局主题；不传时使用浅色默认值。

## 验收

- 发布 manifest 不出现 `surfaces`。
- 外部 consumer 能够直接 import `nexum-ai/chat-surface` 和 CSS。
- `nexum-test` 能本地启动完整演示平台并组合 ChatSurface。
- 发布 JS 不包含构建运行时语法，低版本语法扫描、类型检查、构建、打包和文档审计全部通过。
