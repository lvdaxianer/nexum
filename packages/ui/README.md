# @opencode/ui

`@opencode/ui` 是共享的 Solid UI 组件、交互、图标、主题和样式包，供 Web 页面及其他可复用控制面使用。

## 目录职责

- `src/actions/`、`src/forms/`、`src/navigation/`、`src/overlays/`：通用交互组件。
- `src/data-display/`、`src/feedback/`：数据展示和反馈组件。
- `src/theme/`、`src/styles/`：主题和样式入口。
- `src/motion/`：动效基础设施。
- `script/`、`test/`、`perf/`：构建、测试和性能工具。

UI 包不拥有模型、Session 或权限业务规则；页面应通过 Client/Server 获取状态。

## 验证

```bash
bun run --cwd packages/ui typecheck:tsc
bun test --cwd packages/ui
```
