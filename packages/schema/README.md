# @opencode/schema

`@opencode/schema` 提供跨包共享的领域 Schema、标识符、配置、事件、Session 和数据结构。它是轻量数据契约层，不负责网络传输或运行时编排。

## 目录职责

- `src/`：共享 Schema 和类型定义。
- `script/`：Schema 构建、配置生成和打包脚本。
- `test/`：Schema 行为和兼容性测试。

Protocol 依赖 Schema 表达公共数据；Core、Server 和 Client 应复用这里的类型，避免重复定义。

## 验证

```bash
bun test --cwd packages/schema
bun run --cwd packages/schema typecheck:tsc
```
