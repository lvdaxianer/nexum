# Design

## Context

当前工作台已提供完整的浅色 CSS，并通过 `html[data-theme]` 选择器提供深色覆盖层。宿主组件在初始化时读取 `prefers-color-scheme: dark`，再将结果同时用于页面根节点和 ChatSurface。

## Goals / Non-Goals

**Goals:**

- 让工作台在所有系统外观设置下固定使用浅色主题。
- 保留现有 `ChatSurface` 的显式主题接口和浅色样式。
- 让主题选择成为一个清晰、可测试的配置值。

**Non-Goals:**

- 不新增主题切换按钮。
- 不删除现有深色 CSS 覆盖层。
- 不改变聊天、Session、模型或权限交互。

## Decisions

- 使用单一的 `workbenchTheme = "light"` 配置值作为宿主主题来源。
- 移除系统媒体查询监听，避免页面运行中被系统外观变化重新切换。
- 继续通过 `html[data-theme]` 设置宿主页面，并把同一个值传给 ChatSurface，避免两个视觉层状态分叉。
- 不采用仅覆盖 CSS 的方案，因为那会让运行时主题状态仍然是 `dark`，容易造成宿主页面与 ChatSurface 语义不一致。

## Risks / Trade-offs

- [Risk] 用户无法通过系统外观自动获得深色工作台 → 通过保留深色 CSS 和 ChatSurface 的显式 `theme` 能力，为后续产品化主题切换保留扩展点。
- [Risk] 固定值改变现有跟随系统的行为 → 该行为是本次需求的明确目标，且不涉及数据或 API 兼容性。

## Migration Plan

无需数据迁移。重新加载开发服务器即可生效；回滚时恢复主题配置并重新启用系统主题监听。
