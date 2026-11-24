# Nexum CLI Surface 设计

## 背景

协议消费链路为 `Surface → 协议适配器 → @nexum/client → @nexum/protocol → HTTP/SSE → Server`。UI 侧已有两个 Surface 消费者：`@nexum/chat-surface`（可嵌入组件）和 `@nexum/surfaces`（Web 工作台）。

问题：Surface 面向协议的契约 `ChatProtocolAdapter`（10 个方法）与默认实现 `createChatProtocolAdapter` 目前长在 `@nexum/chat-surface` 内，而该包依赖 solid-js / dompurify / marked。CLI 直接 import 会把浏览器 UI 依赖拖进终端进程，违反模块边界。

CLI 与 UI 同层：两者都是 Surface，通过同一个协议适配层对接协议层（`nexum.runtime.v1`），不各自实现协议逻辑。

## 目标

- 新增 `@nexum/cli` 包，作为与 UI 同层的终端 Surface，复用同一协议适配契约。
- 抽出 `@nexum/surface-adapter` 包承载契约与默认实现，chat-surface 改为 re-export，公开 API 不破坏。
- 提供 REPL（核心）与一次性命令（可脚本化）两种形态。
- 覆盖完整交互链路：prompt、流式事件、Permission、Question、取消/继续、历史回放与断线恢复。
- 覆盖管理面模块的终端设计：思考（Reasoning）展示、模型配置与探测、角色 Prompt、Skill 查询、MCP 连接管理。
- 零新增运行时三方依赖。

## 非目标

- 全屏 TUI（ink / opentui 等终端 UI 框架）。
- Server 生命周期管理（不自动拉起、不守护进程）。
- Skill 注册源的文件编辑、MCP Server 的部署（CLI 只做协议层管理操作）。
- 二进制编译与发布分发。

## 方案

### 1. 包结构与依赖方向

新增两个包，均匹配根 workspace 的 `packages/nexum-*` 约定：

- `packages/nexum-surface-adapter`（`@nexum/surface-adapter`）：从 chat-surface 平移 `ChatProtocolAdapter`、`ChatProtocolMethod`、`CHAT_PROTOCOL_METHODS`、全部输入类型、`ChatProtocolError`、`normalizeChatProtocolError`、`createChatProtocolAdapter` 及相关 re-export 的协议类型。符号保持原名，不引入重命名；chat-surface 改为 `export ... from "@nexum/surface-adapter"` 的兼容壳，其公开入口不变。
- `packages/nexum-cli`（`@nexum/cli`，bin 名 `nexum`）：只依赖 `@nexum/surface-adapter`（间接 `@nexum/client` → `@nexum/protocol`），不依赖 Core、Server、chat-surface。

依赖方向更新为：

```text
nexum-surface-adapter ──> nexum-client ──> nexum-protocol
nexum-chat-surface ────> nexum-surface-adapter
nexum-surfaces ────────> nexum-client + nexum-chat-surface
nexum-cli ─────────────> nexum-surface-adapter + nexum-client
```

CLI 的聊天链路（REPL、prompt、事件流）走 `@nexum/surface-adapter` 的 `ChatProtocolAdapter`；管理面命令（model / role-prompt / skill / mcp）是简单的请求-响应，直接消费 `@nexum/client` 对应方法组，不新增抽象。

### 2. CLI 组成

```text
packages/nexum-cli/src/
  main.ts       入口：node:util parseArgs 解析 --server/--session 与子命令，分发并约定退出码
  repl.ts       交互式会话循环（核心）
  render.ts     NexumEvent → 终端文本行投影（对应 UI 的 projectChatEvent）
  interact.ts   Permission / Question 的终端问答流
  commands.ts   会话类一次性命令：session list / session create / prompt
  admin.ts      管理面一次性命令：model / role-prompt / skill / mcp
```

入口以 `#!/usr/bin/env bun` shebang 暴露 bin；开发期通过 `bun run --cwd packages/nexum-cli start` 或 `bun packages/nexum-cli/src/main.ts` 运行。

### 3. 连接与恢复

- Server 地址解析顺序：`--server` flag > `NEXUM_API_URL` 环境变量 > 默认 `http://127.0.0.1:4097`。
- 启动先调 `capabilities()` 探测；不可达时打印 Server 启动方式（`bun run --cwd packages/nexum-server dev`）并以非零退出。
- 事件消费与 ChatSurface 一致：`eventID` 去重、`sequence` 单调递增校验、断线后按最后已知 `afterSequence` 重连续传，不假设 SSE 从未中断。
- 打开会话时先 `loadState` + `loadHistory` 打印紧凑 transcript（用户/助手/工具摘要），再进入实时事件流；历史快照失效（`NEXUM_HISTORY_SNAPSHOT_EXPIRED`）时停止向前翻页，与 UI 处理一致。

### 4. 交互语义

- 状态机完全复用协议事实：`idle / running / retrying / awaiting permission / awaiting question / completed / failed / cancelled`；终态只认 `run.settled` 与 `session.*` 事件，不从文本猜测。
- 运行中输入锁定；`Ctrl+C` 在运行中触发 `cancelRun`，空闲时退出 REPL。
- Permission：事件到达即打印 `action / resource / reason`，提示 `允许一次 / 始终允许 / 拒绝` 三选一，调用 `replyPermission`。
- Question：按题号渲染编号选项，单选输入序号、多选逗号分隔，按问题顺序提交二维字符串数组；支持取消，取消不伪造答案——与 UI 的 `questionAnswers` 语义一致。
- REPL slash 命令：`/help`、`/new`、`/use <sessionID>`、`/sessions`、`/cancel`、`/continue`、`/skills`、`/events`、`/thinking [summary|full]`、`/expand`、`/quit`。

### 5. 渲染约定与终端样式

样式设计稿（已确认前不进入实现）：

- 高保真 demo：深色 [`artifacts/nexum-cli-demo.png`](../../../artifacts/nexum-cli-demo.png)、浅色 [`artifacts/nexum-cli-demo-light.png`](../../../artifacts/nexum-cli-demo-light.png)（源文件 `artifacts/nexum-cli-demo.html`，URL 参数 `?theme=light` 切换，Playwright 截图，可直接改 HTML 重新出图）。
- 主题策略：CLI 只使用 ANSI 语义色（green/yellow/cyan/red/magenta/bright-black 等 16 色），不写死 RGB，由用户终端自身的配色方案决定深浅表现；深浅两套 demo 仅用于评审视觉语言。
- 视觉语言：用户输入用 `nexum ▸` 提示符；assistant 洋红 `Agent` 标签 + 流式原文直出（终端不做 HTML/Markdown 渲染）；reasoning 暗色单行摘要（默认折叠）；工具调用 `●` / 结果 `✓` 单行状态。
- Permission 用黄色左边线卡片：`action · resource · reason` + `[1] 允许一次 [2] 始终允许 [3] 拒绝`；Question 用青色左边线卡片：按题号编号选项，回答按题序、多选逗号分隔。
- 底部状态栏：左段 `sessionID · 状态 · 上下文`，右段键位提示（`Enter 发送 · @ 引用 Skill · Ctrl+C 取消 · /help 命令`）。
- 颜色遵循语义：绿=成功/完成，黄=等待权限，青=信息/提问，红=失败/取消，暗灰=历史与次要信息；尊重 `NO_COLOR`。

动画系统（全部用 ANSI 转义 + 光标控制实现，零依赖；演示见 `artifacts/nexum-cli-thinking.gif` / `nexum-cli-thinking-light.gif`，源文件 `nexum-cli-thinking.html`，demo 主页面所有 spinner 实时转动）：

- spinner：braille 10 帧 `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`，80ms/帧，用于思考中、工具执行中、MCP 连接中。
- 呼吸：「正在思考」文字 dim ↔ 正常色交替，1.2s 周期。
- 光标：流式输出末尾块光标 `▍`，530ms 闪烁，跟随 assistant 文本与思考摘要。
- 收敛：工具行 spinner → `✓`/`✗`；运行行 spinner → `✓ 运行完成` / `✗ 失败` / `— 已取消`，瞬时行不留在滚动历史。
- 降级：非 TTY（CI、管道）、`TERM=dumb` 或 `--no-anim` 时全部静态输出，不刷帧。

实现约束：

- 零新增依赖：`node:readline/promises` 做输入，`node:util` 的 `parseArgs` 做参数解析，ANSI 转义做颜色并尊重 `NO_COLOR`。
- 同一 run 的瞬时状态在 `run.settled` 时收敛，语义等价于 UI 的 `settleRunItems`。

### 6. 思考（Reasoning）展示

三种形态，对应 UI 的 ReasoningView 生命周期：

- 流式中：单行 spinner `⠋ 正在思考 · 已 N 字` + 暗色滚动摘要行（同一块原地刷新，不刷屏）。
- 完成收敛：折叠为 `✓ 思考过程 · N 字 · 用时 Xs`，不占用滚动历史；`/expand` 重新完整打印最近一次思考。
- `/thinking full` 切换后，新运行的思考全文以暗色直接输出；`/thinking summary` 恢复默认折叠。

### 7. 管理面命令

管理面为一次性子命令，直接消费 `@nexum/client` 方法组；状态文案与协议枚举一一对应：

| 命令 | 协议方法 | 输出要点 |
| --- | --- | --- |
| `model get` | `model.get` | baseUrl / model / `credentialConfigured`（凭据只显示已配置与 credentialRef，永不回显原文） |
| `model set` | `model.update` | 交互式逐项输入，API Key 仅写入不回显 |
| `model probe` | `model.probe` | 文本 / Function Calling 两通道，只显示 `pass / skipped` |
| `role-prompt get` | `rolePrompt.get` | 来源 default/custom、updatedAt、内容摘要（前 60 字） |
| `role-prompt set <file>` | `rolePrompt.update` | 从文件读入，避免 shell 转义问题 |
| `role-prompt reset` | `rolePrompt.reset` | 重置为默认 |
| `skill list` | `skill.list` | ID / 状态（ready 绿、invalid 黄、conflict 红）/ 文件数 / 描述 |
| `skill detail <id>` | `skill.detail` | 版本、文件清单、digest、注册时间 |
| `skill validate [id]` | `skill.validate` | valid 结果与诊断 |
| `skill refresh [id]` | `skill.refresh` | 刷新注册状态 |
| `skill register <address>` / `skill unregister <id>` | `skill.register` / `skill.unregister` | 注册本地目录源；注销只移除注册记录，不动源目录 |
| `mcp list` | `mcp.list` | 状态映射：connected 绿、needs_auth 黄、retrying 青（含第 N 次与下次时间）、failed 红（含 error.code）、disabled/pending 灰 |
| `mcp add` | `mcp.add` | 交互式录入 id/name/url 等 |
| `mcp connect <id>` | `mcp.connect` + `mcp.authorize` 系列 | needs_auth 时进入 OAuth：打印授权地址并尝试打开浏览器，支持粘贴回调 URL（`completeAuthorization`），轮询 `authorizationStatus` 直到 authorized/failed/expired |
| `mcp disconnect <id>` / `mcp remove <id>` | `mcp.disconnect` / `mcp.remove` | 断开与移除 |
| `mcp tools/resources/prompts <id>` | `mcp.tools` 等 | 名称 + 描述列表 |

REPL 内 `/skills` 列出 ready Skill 供 `@` 引用；`@` 补全只列 `status === "ready"` 的 Skill，与 UI 一致。

### 8. 一次性命令与退出码

- `nexum session list`、`nexum session create --dir <path> [--name <name>]`：JSON 或紧凑表格输出，供脚本消费。
- `nexum prompt "..."`（可带 `--session <id>` 复用已有会话；不带时以当前工作目录为 `directory` 隐式创建新会话）：流式输出到 stdout，`run.settled` 后按结果退出：completed → 0，failed → 1，cancelled → 130；协议错误输出到 stderr 并非零退出。

### 9. 错误处理

- `ChatProtocolError` 透传 `code / message / traceId`，REPL 显示为 notice 行，不中断会话。
- 事件流断开且非用户主动断开时提示重连；重连复用 `afterSequence` 游标。
- 参数错误、Server 不可达、协议版本不匹配（`NEXUM_INVALID_RESPONSE`）直接非零退出并给出修复提示。

### 10. 测试策略

- `render.ts`：事件序列 → 输出行断言，覆盖流式文本合并、reasoning 三形态收敛、run.settled 终态收敛；动画帧序列与降级（非 TTY 静态输出）可断言。
- `repl.ts`：脚本化假 `ChatProtocolAdapter`（接口天然可注入，不 mock 全局对象）+ 注入 input/output 流，驱动 prompt、permission、question、取消全流程。
- `commands.ts` / `admin.ts`：参数解析、输出格式与退出码；管理面状态文案与协议枚举（MCP status、Skill status、probe pass/skipped）一一对应。
- 验收命令：`cd packages/nexum-cli && bun test && bun run typecheck:tsc`；`packages/nexum-chat-surface` 回归测试与类型检查；根目录 `bun run check`。

## 文档同步

- `packages/README.md`：包表格与依赖方向图新增两个包。
- `docs/architecture/module-boundaries.md`：模块地图、依赖方向与变更边界同步。
- 新增 `docs/modules/nexum-cli.md`；更新 `docs/modules/nexum-chat-surface.md`（适配器迁出说明）。
- 根 `README.md` 文档导航补充 CLI 入口。
- 协议无变更，`apis/nexum.md` 不需要改动。

## 验收

- 终端样式与 `artifacts/nexum-cli-demo.png` / `nexum-cli-demo-light.png` 设计稿一致，思考动画与 `nexum-cli-thinking.gif` 一致，经确认后才进入实现。
- CLI 与 UI 同层复用同一 `@nexum/surface-adapter` 契约；chat-surface 公开 API 不破坏，现有测试通过。
- REPL 完成一轮包含 Permission 与 Question 的运行，`Ctrl+C` 取消生效，断线重连后事件不丢不重。
- 思考展示覆盖流式、折叠、`/thinking full` 三形态。
- 管理面命令覆盖 model / role-prompt / skill / mcp，状态文案与协议枚举一致，凭据不出的边界不破坏。
- 一次性命令可脚本化，退出码符合约定。
- 零新增运行时三方依赖（`packages/nexum-cli/package.json` 仅含 workspace 依赖）。
- 受影响包测试、类型检查与根目录 `bun run check` 通过。
