# Proposal

## Why

`@nexum/chat-surface` 完成抽取后，表现层仍停留在「管理后台」观感：运行状态以调试文本条呈现且与输入栏状态重复、助手消息无身份结构、思考过程只有一行粗糙折叠、样式表硬编码色值且无深色与移动端适配。聊天组件会被宿主嵌入整页、弹窗、抽屉并面向手机/Pad/PC，表现层需要一次系统的视觉与响应式重构。

## What Changes

- 对话优先的布局重构：顶栏精简；Tabs 与运行状态合并为工具行（状态簇唯一化，删除输入栏重复状态）；Agent 回合增加头像轨与回合标签；执行行卡片化；输入区改为圆角 prompt box。
- 语义令牌主题：全部颜色/圆角/字阶收编为 `--nexum-chat-*` CSS 变量，组件 CSS 零硬编码色值；内置 `data-theme="dark"` 深色主题；宿主可逐项覆盖变量完成换肤。
- 响应式：组件内部断点改用 container query（`≥720` 宽松 / `481–719` 平板 / `≤480` 紧凑 / `≤360` 极窄），触控目标经 `(pointer: coarse)` 放大到 44px，兼容手机/Pad/PC 与抽屉、弹窗等嵌入容器。
- 思考过程生命周期展示：占位（尚无文本）、流式（字数+预览）、完成折叠（字数/用时/时间）、展开面板四态；用户手动展开后不被自动收起。
- 权限设置入口：输入栏发送键左侧新增权限模式 chip 锚点与请求条「权限设置」链接，通过可选渲染插槽与 `permission-settings` 事件交给宿主，策略管理职责仍在宿主。
- 更新 example 页：内置 PC/Pad/手机容器宽切换与明暗主题开关，便于三档设备验证。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `chat-surface`: 可嵌入 UI 契约扩展 —— 新增主题令牌与深色主题、容器宽度断点与触屏适配、权限设置入口扩展点、思考过程生命周期展示等表现层需求；布局结构（工具行/回合结构/执行卡片/输入盒）作为默认视觉 UI 的组成部分更新。

## Impact

- 代码：`packages/nexum-chat-surface/src/chat-surface.tsx`（JSX 结构）、`src/styles.css`（重写大部分）、`src/web-component.tsx`（theme 属性与插槽透传）；宿主 `packages/nexum-surfaces/src/main.tsx`（权限策略触发器移入插槽）及其样式。
- 契约：向后兼容 —— 类名前缀 `nexum-chat-` 与 CSS 变量保留，新增插槽/事件/属性均为可选；`data-testid`（`prompt-permission`、`permission-actions` 等）与 `.nexum-chat-body` 不变，现有 smoke 测试不受影响。
- 协议：无变更；思考用时等由现有事件投影得出。
