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
| 模型配置                | `GET/PUT /api/experimental/headless/model`、`POST /api/experimental/headless/model/probe`                              |
| Session                 | `GET/POST /api/experimental/headless/session`                                                                            |
| Prompt                  | `POST /api/experimental/headless/session/:sessionID/prompt`                                                             |
| SSE 事件                | `GET /api/experimental/headless/session/:sessionID/events`                                                              |
| Permission 查询/回答    | `GET/POST /api/experimental/headless/session/:sessionID/permission...`                                                  |
| Question 查询/回答/取消 | `GET /api/experimental/headless/session/:sessionID/question`、`POST .../:requestID/reply`、`POST .../:requestID/cancel` |

模型配置返回 `credentialConfigured`，不会返回 credential 原文。Question 回答按问题顺序提交二维字符串数组；取消不会伪造答案。SSE 会发布工具、Question、上下文压缩、项目上下文来源和 Session 生命周期事件。

## 页面控制台

页面是所有运行时操作的控制面：

1. 在 Model runtime 保存模型配置，并通过 `Probe model` 验证文本与 Function Calling 通道；页面只展示 `pass/skipped`，不展示密钥或模型原文。
2. 在 Session admission 创建、列出和切换 Session；页面使用 `sessionStorage` 恢复最近 Session，并在切换后重新建立事件流。
3. 在 Runtime timeline 查看事件、刷新运行时状态、重连事件流或取消当前运行。
4. 在 Permission queue 处理工具权限，在 Question queue 补充模型所需信息；允许、拒绝、回答和取消都会回到同一个 Session。
5. 在 Context 查看压缩状态、最近消息和项目上下文来源。
6. 在 Skill Registry 管理宿主配置的项目级 Skill；在 Prompt 中输入 `@skill-id` 可触发权限审批，批准后由 Core 注入 `SKILL.md` 系统提示并发布激活事件。

页面只依赖 Headless Client/Server，不导入 Core，也不会把 credential 原文放入 DOM、SSE 或浏览器存储。

## Skill Registry

Skill Registry 是 UI 无关的 Core 能力。它从项目 Skill root 发现目录，校验 manifest、路径边界、摘要和 `SKILL.md` 完整性；Server 暴露 list/detail/register/refresh/validate/activate 管理接口，生成客户端保持同一协议契约。

页面层只负责展示注册状态、验证结果、激活状态和 `@` 自动补全。Prompt 进入 Coding Loop 后，Skill Invocation Port 解析 mention、去重并等待 `skill.use` 权限；获得批准后把 Skill 内容作为带稳定 `sourceID` 的 system message 注入模型上下文，并通过 SSE 发布 `skill.activated` 或 `skill.failed`。因此任何其他 UI 只要实现同一 Headless Client 契约，即可复用 Registry、权限和 Coding Loop。

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
bunx openspec validate headless-skill-registry --strict
```

验收重点：

- 多工具 Function Calling、非法参数和工具历史续跑；
- allow-once、allow-always、deny、取消、跨 Session 审批和凭据脱敏；
- Question pending/reply/cancel，不回答不执行后续工具；
- 阈值压缩、摘要/最近消息保留、压缩失败和压缩后项目上下文恢复；
- UI 允许/拒绝工具、Question 表单、Compaction 状态、项目来源和 secret 不出页面/事件；
- 页面 Probe、Session 恢复/重连、运行时刷新和取消操作均可见且可回归。
