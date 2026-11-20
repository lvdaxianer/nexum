# @opencode/simulation

`@opencode/simulation` 提供可控的前后端模拟、网络录制和协议场景，用于测试 Agent、Server 与 UI 的行为，不连接真实生产服务。

## 目录职责

- `src/control-server.ts`：模拟控制服务。
- `src/manifest.ts`：场景和资源清单。
- `src/recording.ts`：录制数据读写。
- `src/backend/`、`src/frontend/`、`src/protocol/`：各侧模拟适配。
- `test/`：动作、网络、Provider 和协议测试。

它用于确定性验证，不应成为生产请求链路的依赖。

## 验证

```bash
bun test --cwd packages/simulation
bun run --cwd packages/simulation typecheck:tsc
```
