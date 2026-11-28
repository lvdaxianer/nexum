# Proposal

## Why

ChatSurface 已经作为独立组件被其他项目引入，但宿主无法关闭组件自带的顶部标题栏，导致嵌入页面出现重复标题或额外占位。组件放入侧栏、抽屉和窄卡片时，输入栏中的多个操作控件共享一行空间，按钮会被挤压，影响聊天提交和文件上传。

## What Changes

- 为 ChatSurface 增加默认开启的 `showHeader` 配置，允许宿主关闭顶部标题栏。
- 为 Web Component 增加对应的 `show-header` 属性映射。
- 将输入栏底部拆分为信息行和操作行；窄容器下操作行允许继续换行，保留全部操作控件。
- 增加公共组件契约测试、窄布局回归检查和 README 使用说明。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `chat-surface`: 修改可嵌入 UI 契约，增加顶部栏可见性配置，并明确窄容器下操作控件必须保持可用。

## Impact

- 修改 `packages/nexum-chat-surface/src/chat-surface.tsx`、`src/web-component.tsx` 和 `src/styles.css`。
- 修改 ChatSurface 的公共 README 与契约测试。
- 不修改 Protocol、Adapter、Session API 或运行时请求行为。
