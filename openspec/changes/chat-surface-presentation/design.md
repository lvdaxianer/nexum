# Design

## Context

ChatSurface 已抽取为独立包（见 `openspec/changes/archive/2026-11-24-chat-surface`），当前表现层存在：状态信息两处重复（运行状态条 + 输入栏）、助手消息无身份结构、样式表硬编码色值（约 10 处一次性 hex）、无深色主题、仅一个 620px 媒体查询、思考过程仅一行 details、权限设置入口在宿主侧栏与聊天现场脱节。宿主会把组件嵌入整页、弹窗（920px 内）、抽屉及手机/Pad/PC。设计视觉稿经多轮评审定稿（布局、令牌主题、设备兼容、权限入口、思考生命周期），存放于 `/tmp/nexum-chat-surface-redesign.html`。

## Goals / Non-Goals

**Goals:**

- 对话优先的默认视觉 UI：工具行合并 Tabs 与唯一状态簇；回合制消息结构；执行行卡片化；圆角 prompt box。
- 语义令牌主题：组件 CSS 零硬编码色值；内置深色主题；宿主可逐项覆盖。
- 容器宽度断点（720/480/360 三档 + 平板档 481–719）与 `(pointer: coarse)` 触屏放大，覆盖手机/Pad/PC 与抽屉/弹窗嵌入。
- 思考过程生命周期面板与权限设置扩展点。
- 向后兼容：类名前缀、`--nexum-chat-*` 变量族、`data-testid`、`.nexum-chat-body` 全部保留。

**Non-Goals:**

- 不修改 Protocol/适配器方法集；不改 Session、模型、Skill、权限策略的管理职责边界（策略管理仍在宿主）。
- 不做附件上传、文件拖拽。
- 不做密度调节（`--nexum-chat-density` 仅预留，二期实现）。
- 不替换 Markdown 渲染库。

## Decisions

### 1. 断点用 container query 而非媒体查询

组件是嵌入件，可视宽度由宿主容器决定。组件根节点设 `container-type: inline-size`，内部断点用 `@container`：平板 481–719、紧凑 ≤480、极窄 ≤360。触屏目标另用 `(pointer: coarse)` 叠加（`--tap-min` 32→44px），与宽度正交。备选是保留媒体查询 —— 抽屉/弹窗场景会按屏幕宽度错误收敛，弃用。兼容性基线 Chrome 105+/Safari 16+/Firefox 110+，满足内部演示工作台场景。

### 2. 主题用单一变量族 + data-theme 翻转

全部颜色（含气泡、代码块、待办区、阴影、焦点环等现状硬编码值）收编为 `--nexum-chat-*` 语义令牌；`.nexum-chat-surface[data-theme="dark"]` 整组覆盖实现内置深色；宿主逐项覆盖即换肤。是否跟随 `prefers-color-scheme` 由宿主决定（宿主在容器上加媒体查询翻转变量），组件不自动变色。Web Component 增加 `theme` 属性透传为根节点 `data-theme`。

### 3. 状态簇唯一化并上移工具行

删除独立「运行状态」条与输入栏重复状态；工具行 = Tabs（左）+ 状态簇（上下文 + Session 状态丸，右）。状态语义色：进行中 accent、等待 warning、失败 danger、完成 success，圆点+文字双重信号。

### 4. 思考过程用投影字段驱动生命周期渲染

`ChatItem` 增加可选 `startedAt`/`elapsedMs` 字段：`assistant.reasoning` 首事件建项时记 `startedAt`，`closeReasoning` 完结时算 `elapsedMs`。渲染四态：① transient thinking status 项（`thinking: true`）→ 占位条「正在思考…」；② streaming reasoning → live 面板（字数+预览）；③ 完成 → 折叠摘要（字数·用时·时间）；④ 无内容 → 不渲染。用户手动展开状态在组件内以本地信号记忆，自动折叠仅在用户未触碰时生效。不改协议。

### 5. 权限设置入口用可选插槽 + 事件，不内置策略逻辑

Solid `ChatSurface` 新增可选 `composerExtras` 渲染插槽（位于发送键左侧）；权限/请求条标题行渲染「权限设置」触发，统一调用可选回调 `onOpenPermissionSettings`；同时组件根派发 `permission-settings` CustomEvent 供宿主监听。Web Component 用 light DOM，插槽内容随宿主 HTML 直接传入并在 mount 时作为 `composerExtras` 透传。策略管理（三模式、规则增删）完全留在宿主：宿主在插槽中新增权限模式 chip 作为现场入口，同时保留侧栏管理入口（既有 smoke 锚点与统一管理场景）。备选是组件内置策略面板 —— 需扩适配器与 spec 边界，弃用。

### 6. 布局结构改造保留测试锚点

`.nexum-chat-body`、`data-testid="prompt-permission"`、`data-testid="permission-actions"`、按钮文案（允许一次/始终允许/拒绝）不变；执行行/状态行/气泡等类名延续 `nexum-chat-` 前缀，结构变化集中在新增包裹层（turn/avatar 轨、卡片化执行行）。

## Risks / Trade-offs

- [container query 旧浏览器失效] → 失效时退化为默认宽松布局（无 display 依赖），语义上可接受；受众为内部演示工作台。
- [投影字段变更影响既有测试] → `chat-projection.test.ts` 断言的是既有事件投影；`startedAt`/`elapsedMs` 为增量字段，既有断言用对象包含匹配则更新快照式断言。
- [宿主 Kobalte Popover 移入插槽后锚点失效] → 触发器仍在同一 document 的 light DOM 中，Kobalte 锚定逻辑不变；在 smoke 中验证弹层可开。
- [深色主题对比度不足] → 状态色深浅两套均按 4.5:1 文本对比度选值；视觉稿已对照。
- [smoke 测试依赖旧文案] → 搜索并保留 smoke 中断言的全部文案与类名；`运行状态` 字样被移除前先在测试中检索确认无断言。

## Migration Plan

1. 重写 `styles.css`（令牌层 + 新布局 + 断点 + 深色），保持全部既有类名语义或提供兼容映射。
2. 改造 `chat-surface.tsx` 结构与思考面板/权限扩展点。
3. `web-component.tsx` 增加 `theme` 属性与插槽透传。
4. 宿主 `main.tsx` 将权限策略触发器移入插槽；`example/index.html` 加设备/主题切换器。
5. 包内测试 + `typecheck:tsc` + 宿主 smoke（含 390/768 视口变体）+ 根目录 `bun run check`。
6. 回滚：revert 三个源文件与宿主改动；纯表现层，无数据/协议迁移。
