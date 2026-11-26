# `@nexum/cli`

状态：现状基线

权威来源：[`packages/nexum-cli/src/main.ts`](../../packages/nexum-cli/src/main.ts)、[`packages/nexum-cli/src/repl.ts`](../../packages/nexum-cli/src/repl.ts)

最后核对：2026-11-25

## 职责

`@nexum/cli` 是 Nexum 的终端 Surface，与 Web UI（[`@nexum/surfaces`](./nexum-surfaces.md)）同级。它复用与聊天类 Surface 相同的协议适配层（[`@nexum/surface-adapter`](./nexum-surface-adapter.md)），把 Session 历史、SSE 事件、思考过程、Permission/Question 交互投影为终端文本，并提供 REPL 与一次性管理面命令。

它不负责 Core 执行语义、协议实现或业务决策；这些由 Server/Application/Core 负责。CLI 只消费协议并投影状态。

## 公开入口与接入

包通过 `bin` 暴露 `nexum` 命令，入口为 [`src/main.ts`](../../packages/nexum-cli/src/main.ts)：

```bash
# 仓库根目录(推荐)
bun run cli -- --help

# 开发环境直接运行
bun packages/nexum-cli/src/main.ts --help

# 或通过 package script
bun run --cwd packages/nexum-cli start -- --help
```

连接地址按 `--server` 标志 > `$NEXUM_API_URL` > `http://127.0.0.1:4097` 顺序解析。启动时先做 capabilities 探测，连接失败会提示启动 Server 的方式并以退出码 1 结束；`theme` 是纯本地命令，在探测前短路，不要求 Server 可达。退出码约定：`0` 成功、`1` 失败、`2` 用法错误、`130` 用户取消。

## 命令

以 `src/main.ts` 的 `USAGE` 为准：

| 命令 | 作用 |
| ---- | ---- |
| `nexum`（无命令） | 进入 REPL，新会话（首条消息时懒创建） |
| `nexum resume` | 交互式选择会话恢复；`-c`/`--continue` 跳过选择直接恢复最近 |
| `nexum session list` / `session create [--dir <路径>] [--name <名称>]` / `session delete <id>` | 列出、创建或删除会话 |
| `nexum prompt <文本> [--session <id>]` | 一次性流式执行，退出码 0/1/130 |
| `nexum status` | 连接与配置总览 |
| `nexum doctor` | 逐项诊断，存在失败项时退出码 1 |
| `nexum theme [dark\|light\|auto]` | 查看/切换主题，写入 `~/.nexum/cli.json`，下次启动生效 |
| `nexum model get \| set \| probe` | 读取、交互式更新和探测模型配置 |
| `nexum role-prompt get \| set <文件> \| reset` | 读取、更新和重置角色提示 |
| `nexum skill list \| detail <id> \| validate [id] \| refresh [id] \| register <地址> \| unregister <id>` | Skill 发现、校验和管理 |
| `nexum mcp list \| add \| connect <id> \| disconnect <id> \| remove <id> \| tools <id> \| resources <id> \| prompts <id>` | MCP 服务器与能力管理 |
| `nexum permission list \| allow <动作> [范围] \| deny <动作> [范围] \| remove <id> \| mode ask\|allow` | 权限规则与模式管理：规则表效果着色（allow 绿 / ask 黄 / deny 红），通配规则标注 `← 当前模式`；`mode allow` 写通配规则（危险操作仍会询问），`mode ask` 移除它 |

全局选项：`--server`、`--session`、`-c`/`--continue`、`--theme`、`--no-anim`、`--version`、`--help`。

## REPL

每次启动默认进入新会话的待创建状态：不恢复任何会话，首条非 slash 消息到达时才创建会话（空启动零垃圾）；`resume`、`-c`/`--continue`、`--session <id>` 为显式恢复入口，`/new [名称]` 随时回到待创建状态（名称留给创建时使用）。打开会话时回放最近 50 条历史，随后从 `lastSequence` 起订阅事件并按 `eventID` 去重。运行期间输入锁定（`/cancel` 可取消）；Permission/Question 请求进入顺序交互队列逐个询问。输入 `@` 触发 Skill 自动补全，只列出 `ready` 状态的 Skill。输入 `/` 后 Tab 列出全部 slash 命令，继续输入按前缀过滤（无命中时退回子串模糊匹配）补全命令名，`/permissions` 与 `/thinking` 还支持子命令补全（`mode/allow/deny/remove` 与 `live/summary/full`）；命令清单是 HELP 与补全共用的单一数据源。`/skills` 只逐行列出 `@id`（描述过长不换行展示），`/skill list` 一次性命令才带描述。运行进入终态（completed/failed/cancelled）后事件流结束属正常关闭，静默续订；仅非终态掉线才打印重连提示。

输入框仅在空闲时绘制，为五行闭合框（顶边 / 提示行 `输入任务,Enter 发送 · @ 引用 Skill · /help 命令` / `›` 输入行 / 留白行 / 底边），宽度随终端（上限 110 列），光标归位框内输入行；提交后光标移至框外，运行中不显示提示符，事件输出不与输入行粘连；运行结束输入框自动重画。提示行右侧常驻状态段 `<模型> · <权限>`：模型段为当前模型名（青色），未配置模型时显示黄色 `未配置模型` 提醒；权限段为当前权限模式（`权限:ask/allow/deny`，有规则时追加 `· N 规则`；存在 `* *` 通配规则时取它的效果，否则为 ask）。启动时并行拉取，`/model`、`/permissions` 变更与权限卡片回复（allow_always 会写规则）后即时刷新，任一段拉取失败静默留空该段；框宽放不下状态段时退回纯提示行。非 TTY 或无色终端降级为普通 `nexum ▸ ` 提示符（无状态段）。视觉参照 `artifacts/nexum-cli-input-box.png`（`artifacts/` 不入库，仅作视觉参照）。slash 命令以 `src/repl.ts` 的 `HELP` 为准：

| 命令 | 作用 | 命令 | 作用 |
| ---- | ---- | ---- | ---- |
| `/help` | 显示帮助 | `/new [名称]` | 新会话（首条消息时创建） |
| `/sessions` | 列出会话 | `/use <id>` | 切换会话 |
| `/resume` | 交互式恢复会话 | `/status` | 连接与配置总览 |
| `/skills` | 列出可用 Skill（仅 `@id`） | `/mcp` | MCP 列表 |
| `/model` | 当前模型 | `/theme` | 查看/切换主题 |
| `/permissions` | 查看/切换权限（子命令同 `nexum permission`，与一次性命令共享实现） | | |
| `/events` | 最近事件 | `/clear` | 清屏 |
| `/cancel` | 取消当前运行 | `/continue` | 继续上次运行 |
| `/thinking live\|summary\|full` | 思考展示模式（默认 live） | `/expand` | 展开最近思考 |
| `/quit` | 退出 | | |

## 思考展示

思考（reasoning）有三种展示模式，`/thinking live|summary|full` 切换，默认 `live`：

- `live`（默认）：思考中 spinner 行在底部动画（⠋ + `正在思考` shimmer/呼吸 + `已 N 字` + 用时 + 短摘要尾），完成的推理行以暗色两空格缩进逐行流式输出在其上方（`LiveLine.writeAbove`）；思考结束整块擦除（光标上移 + `\x1b[0J` 清到屏尾，`LiveLine.collapse`），收敛为单行 `✓ 思考过程 · N 字 · 用时 Xs(默认折叠,/expand 查看)`。未完成的半行不进流式区，字符数照常累计。
- `summary`：单行 spinner `⠋ 正在思考 · 已 N 字` + 暗色滚动摘要尾原地刷新，完成收敛为同一摘要行。
- `full`：思考全文暗色直接输出不折叠，完成后追加摘要行。
- `/expand` 重新完整打印最近一次思考，三种模式通用（`lastReasoning` 始终保留全文）。
- 静态终端（非 TTY、`NO_COLOR`、`--no-anim`）：`live` 降级为 `summary` 行为——不流式、不擦除，只打印摘要行。

## 渲染约定

assistant 文本与历史回放经流式 markdown 渲染（[`src/markdown.ts`](../../packages/nexum-cli/src/markdown.ts)）：

- 标题 `#`/`##`/`###` 去掉 `#`，h1 洋红加粗、h2/h3 青色加粗；`**粗体**` 加粗、`*斜体*` 斜体、`` `行内代码` `` 黄色、`[文字](url)` 青色下划线且隐藏 url；表格行原样透传（行内样式仍生效）。
- 围栏代码块：truecolor/256 色下淡底色（深色 `#1e2230`/256 色 234，浅色 `#eef1f6`/256 色 254）+ 青色 `▎` 左边线，16 色降级为暗色文字 + 青色 `▎`；``` 标记行不输出。
- `-`/`*`/`+` 列表保留缩进并替换为青色 `•`；`>` 引用为暗色文字 + 暗色 `▎` 前缀。
- 流式按行缓冲：完整行即时渲染；未完成的半行先原样显示（带暗色 `▍`），行完成或其他事件到达时擦除重渲（`\r\x1b[2K`），工具/权限/终态等行不会与半行交织。
- 非 TTY、`NO_COLOR` 或 `TERM=dumb` 时完全原样透传，不做任何渲染。

## 终端能力分层

语义内容恒为 ANSI 16 色（`green`/`yellow`/`cyan`/`red`/`magenta`/`blue`/`dim`/`bold`），装饰元素（渐变色板、动画）按终端能力沿 `truecolor → ansi256 → ansi16 → 静态` 降级：

- `COLORTERM=truecolor/24bit` 启用 truecolor；`TERM` 含 `256color` 启用 256 色；其余 TTY 退回 16 色。
- `NO_COLOR`、`TERM=dumb` 或非 TTY 输出关闭全部颜色与动画；`--no-anim` 或 `NEXUM_NO_ANIM` 只关闭动画。
- 主题（dark/light/auto）按 `--theme` 标志 > `~/.nexum/cli.json` > `COLORFGBG` 推断 > 默认 dark 解析；`caps` 在启动时定型，切换主题下次启动生效。

样式与动画基准见本地工件 `artifacts/nexum-cli-demo.png` 与 `artifacts/nexum-cli-cool.gif`（`artifacts/` 不入库，仅作视觉参照）。

## 依赖边界

该包只依赖 [`@nexum/surface-adapter`](./nexum-surface-adapter.md) 和 [`@nexum/client`](./nexum-client.md)，不依赖 Core、Application、Server 或 UI 组件包。协议交互全部经过 `ChatProtocolAdapter`；管理面命令直接使用 `@nexum/client`。

## 能力映射

- 事件流：复用 [`docs/capabilities/events.md`](../capabilities/events.md) 的序列与恢复游标，思考展示对应 `assistant.thinking`/`assistant.reasoning` 事件。
- Permission/Question：终端问答实现 [`docs/ui/permission.md`](../ui/permission.md) 与 [`docs/ui/question.md`](../ui/question.md) 的交互语义；非 TTY 环境自动拒绝权限、自动取消问题。
- 管理面：model、role-prompt、skill、mcp 命令一一对应 [`apis/nexum.md`](../../apis/nexum.md) 的能力分组。

## 测试与验证

```sh
cd packages/nexum-cli
bun test
bun run typecheck:tsc
```

测试位于 [`packages/nexum-cli/test/`](../../packages/nexum-cli/test/)，按模块拆分（`term`/`anim`/`io`/`markdown`/`render`/`interact`/`commands`/`admin`/`repl`/`config`/`main`），通过注入内存 IO、数组行源和假适配器覆盖真实交互路径。

## 修改同步清单

- 增加或修改命令：同步 `src/main.ts` 的 `USAGE`、`src/repl.ts` 的 `HELP`、本文档命令表和 [`packages/nexum-cli/README.md`](../../packages/nexum-cli/README.md)。
- 修改终端能力或主题解析：同步本文档"终端能力分层"和 `term`/`config` 测试。
- 修改协议消费方式：同步 [`@nexum/surface-adapter`](./nexum-surface-adapter.md) 文档与 [`docs/capabilities/events.md`](../capabilities/events.md)。
