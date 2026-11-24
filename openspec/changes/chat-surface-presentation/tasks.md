# Tasks

## 1. 主题令牌与样式层重构

- [x] 1.1 重写 `packages/nexum-chat-surface/src/styles.css`：建立 `--nexum-chat-*` 语义令牌层（含状态色、气泡/代码块/待办区、阴影、圆角、字阶、`--tap-min`），清除全部硬编码色值；增加 `[data-theme="dark"]` 深色令牌组；组件根节点加 `container-type: inline-size`。
- [x] 1.2 新增容器断点（481–719 平板、≤480 紧凑、≤360 极窄）与 `(pointer: coarse)` 触屏放大规则；紧凑档补 iOS 输入框 16px 防聚焦缩放。

## 2. 布局结构改造（chat-surface.tsx）

- [x] 2.1 合并工具行：Tabs 左移、状态簇右置（上下文 + Session 状态丸），删除 `nexum-chat-runtime-summary` 条与输入栏重复状态；Agent 回合加头像轨与回合标签，执行行卡片化，状态行改分隔线样式。
- [x] 2.2 输入区改圆角 prompt box + 提示语 flex 撑开；权限/提问请求条卡片化（标题行 + 操作区），保持 `prompt-permission`、`permission-actions` testid 与按钮文案不变。

## 3. 思考过程生命周期

- [x] 3.1 `ChatItem` 增加 `startedAt`/`elapsedMs` 投影字段，reasoning 建项记时、完结算时长；更新/补充 `chat-projection.test.ts`。
- [x] 3.2 实现思考面板四态组件（占位/live/折叠/展开），用户手动展开记忆；transient thinking 状态项渲染为占位条。

## 4. 权限设置扩展点与宿主接入

- [x] 4.1 `ChatSurface` 增加可选 `composerExtras` 插槽与 `onOpenPermissionSettings` 回调，请求条加「权限设置」触发，组件根派发 `permission-settings` CustomEvent；`web-component.tsx` 增加 `theme` 属性与插槽透传，补 web-component 契约测试。
- [x] 4.2 宿主 `main.tsx` 在 `composerExtras` 注入权限模式 chip（保留侧栏管理入口），点击打开现有权限策略 Popover；`example/index.html` 增加 PC/Pad/手机容器宽与明暗主题切换器。

## 5. 验证

- [x] 5.1 运行 `nexum-chat-surface` 包内全部测试与 `typecheck:tsc`；宿主 `permission.smoke.spec.ts` 通过，并新增/复用 390×844、768×1024 视口跑 permission 主流程。
- [x] 5.2 根目录 `bun run check` 通过；`openspec validate chat-surface-presentation --strict` 通过；按仓库提交规范分任务提交。
