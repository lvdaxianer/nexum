# @opencode/theme

`@opencode/theme` 提供 TUI 使用的主题、颜色和样式定义，让终端界面与运行时逻辑解耦。

## 目录职责

- `src/tui/index.ts`：主题入口。
- `src/tui/v1.ts`：兼容版本主题定义。
- `script/`：构建和打包脚本。
- `test/`：主题结构和颜色回归测试。

主题包不处理 API、Session、模型或权限状态；状态展示由 UI/TUI 自己决定。

## 验证

```bash
bun test --cwd packages/theme
bun run --cwd packages/theme typecheck:tsc
```
