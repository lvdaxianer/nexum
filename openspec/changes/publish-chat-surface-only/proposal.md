# Proposal

## Why

当前发布构建把完整演示工作台误暴露为公共 `surfaces` 入口，外部项目无法明确只复用右侧聊天能力；同时现有编译产物仍可能携带现代浏览器语法或构建运行时表达式，降低了低版本宿主的可用性。现在需要收紧公共边界并把编译兼容性变成可验证的发布契约。

## What Changes

- **BREAKING**：公共 `nexum-ai` 包只发布 `chat-surface` UI 入口，不再发布 `surfaces` 工作台入口及其 CSS。
- 将完整演示工作台归入 `nexum-test`，由它通过 `import` 引入 `ChatSurface`。
- 为 `ChatSurface` 提供受限的 `theme: "light" | "dark"` 强制主题 API，覆盖宿主或系统主题影响。
- 发布构建统一生成面向低版本浏览器的编译 JavaScript，并禁止 `import.meta`、顶层 `await` 等构建运行时语法残留。
- 更新发布验证、模块文档、示例和测试，保证公共入口、类型声明、CSS 与 tarball 内容一致。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `embeddable-surfaces`：完整工作台不再作为公共可嵌入组件，改由内部测试平台组合公共聊天组件。
- `package-publishing`：公共 UI subpath 收敛为 `chat-surface`，并增加低版本编译和无构建运行时语法约束。
- `module-usage-docs`：文档和索引区分公共聊天组件、内部工作台和测试模块。
- `chat-surface`：增加显式 light/dark 主题覆盖能力。

## Impact

- 影响 `packages/nexum-chat-surface`、`packages/nexum-surfaces`、`packages/nexum-test` 及发布脚本、发布验证脚本和中英文文档。
- 外部使用方从 `nexum-ai/surfaces` 迁移到 `nexum-ai/chat-surface`。
- 这是公共导出边界变化，但不改变 Protocol、Core 或 Server API。
