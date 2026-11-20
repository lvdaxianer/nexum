# @opencode/latex

`@opencode/latex` 提供终端和 Markdown 场景下的 LaTeX 解析、布局和渲染支持。

## 目录职责

- `src/parser.ts`、`src/markdown.ts`：解析公式和 Markdown 内容。
- `src/layout.ts`、`src/render.ts`：计算布局并输出可渲染结果。
- `src/plugin.ts`：以插件形式接入 UI/TUI。
- `src/*\.test.ts`：解析、布局和渲染回归测试。

它只负责展示层内容处理，不参与模型、权限或 Session 状态管理。

## 验证

```bash
bun test --cwd packages/latex
bun run --cwd packages/latex typecheck:tsc
```
