# @opencode/tui

`@opencode/tui` 是 OpenCode 的终端用户界面，负责键盘交互、Session 展示、编辑器集成、命令选择和终端渲染。

## 目录职责

- `src/index.tsx`、`src/app.tsx`：TUI 启动和应用装配。
- `src/component/`、`src/panel/`：终端组件和面板。
- `src/editor*.ts`：外部编辑器和平台适配。
- `src/config/`：TUI 配置与快捷键。
- `test/`：交互、生命周期、配置和渲染回归测试。

TUI 是可替换控制面，核心权限和工具规则仍由 Core/Server 提供；共享视觉能力来自 [`ui`](../ui/README.md) 和 [`theme`](../theme/README.md)。

## 验证

```bash
bun test --cwd packages/tui
bun run --cwd packages/tui typecheck:tsc
```
