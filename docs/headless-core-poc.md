# Headless Core POC

本 POC 将 Coding Loop、Function Calling、Permission、Question、上下文压缩和项目上下文抽成 UI 无关能力。UI 只调用 Headless Server/Client，不直接依赖 App、TUI 或 Desktop。

## 启动

```bash
bun install
bun run --cwd packages/headless-server dev
bun run --cwd packages/headless-ui dev
```

默认服务地址是 `http://127.0.0.1:4097`，UI 默认访问该地址。也可以通过 `VITE_HEADLESS_API_URL` 指定 Headless Server 地址。

## API 入口

| 能力                    | HTTP 入口                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 模型配置                | `GET/PUT /api/experimental/headless/model`                                                                              |
| Session                 | `POST /api/experimental/headless/session`                                                                               |
| Prompt                  | `POST /api/experimental/headless/session/:sessionID/prompt`                                                             |
| SSE 事件                | `GET /api/experimental/headless/session/:sessionID/events`                                                              |
| Permission 查询/回答    | `GET/POST /api/experimental/headless/session/:sessionID/permission...`                                                  |
| Question 查询/回答/取消 | `GET /api/experimental/headless/session/:sessionID/question`、`POST .../:requestID/reply`、`POST .../:requestID/cancel` |

模型配置返回 `credentialConfigured`，不会返回 credential 原文。Question 回答按问题顺序提交二维字符串数组；取消不会伪造答案。SSE 会发布工具、Question、上下文压缩、项目上下文来源和 Session 生命周期事件。

## 真实模型 Smoke

凭据只从进程环境变量读取，不写入仓库、配置文件或日志：

```bash
HEADLESS_MODEL_BASE_URL='https://provider.example/v1' \
HEADLESS_MODEL='coding-model' \
HEADLESS_MODEL_API_KEY="$YOUR_API_KEY" \
bun run --cwd packages/headless-core smoke:real
```

可选 `HEADLESS_MODEL_SMOKE_MODE=text|tool|both`，默认 `both`。命令只输出 `pass/skipped` 状态和请求次数，不输出模型内容、请求头或 API Key。真实验证要求供应商支持 OpenAI-compatible `/chat/completions`，并能在 tool 模式返回 Function Calling。

## 验收命令

```bash
bun test --cwd packages/headless-core
bun test --cwd packages/headless-server
bun test --cwd packages/protocol --no-cache
bun test --cwd packages/client test/headless-generated.test.ts
bun run --cwd packages/headless-ui typecheck:tsc
bun run --cwd packages/headless-ui build
bun run --cwd packages/headless-ui test:smoke
bunx openspec validate headless-core-capability-coverage --strict
```

验收重点：

- 多工具 Function Calling、非法参数和工具历史续跑；
- allow-once、allow-always、deny、取消、跨 Session 审批和凭据脱敏；
- Question pending/reply/cancel，不回答不执行后续工具；
- 阈值压缩、摘要/最近消息保留、压缩失败和压缩后项目上下文恢复；
- UI 允许/拒绝工具、Question 表单、Compaction 状态、项目来源和 secret 不出页面/事件。
