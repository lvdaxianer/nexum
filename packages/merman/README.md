# @opencode/merman

`@opencode/merman` 提供 Markdown 中 Mermaid/图表内容的识别、调色板、诊断和布局支持。

## 目录职责

- `src/detect.ts`、`src/markdown.ts`：识别并解析图表代码块。
- `src/palette.ts`、`src/diagnostics.ts`：颜色和错误诊断。
- `src/plugin.ts`：接入 UI/TUI 的插件入口。
- `script/layout-audit.ts`：布局审查脚本。

它属于内容渲染能力，不拥有 Core 的工具执行、权限或 API 契约。

## 验证

```bash
bun test --cwd packages/merman
bun run --cwd packages/merman audit:layouts
```
