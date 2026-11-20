# @opencode/script

`@opencode/script` 是仓库构建、打包和发布流程使用的共享脚本包，不属于生产运行时。

## 目录职责

- `src/index.ts`：通用脚本辅助能力。
- `src/highlights.ts`：代码高亮相关脚本能力。
- `src/pack.ts`：包产物打包辅助。
- `test/`：脚本行为测试。

修改这里时要考虑 CLI、各 package 的构建脚本和 CI 产物；不要把业务逻辑或用户凭据放入脚本包。

## 验证

```bash
bun test --cwd packages/script
```
