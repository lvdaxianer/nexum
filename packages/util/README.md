# @opencode/util

`@opencode/util` 提供跨运行时的基础工具，包括文件、路径、进程、编码、并发、锁、可观测性和 Effect Layer 辅助。

## 目录职责

- `src/`：可被多个 package 复用的无业务工具。
- `src/effect/`：Effect 运行时和平台 Layer。
- `docs/`：单项工具的补充说明。
- `script/`：构建和打包脚本。
- `test` 文件：工具行为和平台兼容性测试。

Util 应保持低层、通用和可测试，不反向依赖 UI、Headless Server 或具体业务流程。

## 验证

```bash
bun test --cwd packages/util
bun run --cwd packages/util typecheck:tsc
```
