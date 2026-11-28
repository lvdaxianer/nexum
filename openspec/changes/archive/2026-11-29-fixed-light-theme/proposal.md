# Proposal

## Why

当前工作台会跟随操作系统的深色模式，导致用户在系统为深色时进入深色界面。产品需要在演示和日常使用中保持稳定的白色视觉，避免系统外观设置改变工作台可读性和截图结果。

## What Changes

- 工作台主题固定为浅色。
- 停止根据系统 `prefers-color-scheme` 自动切换宿主页面主题。
- 保持现有 ChatSurface 的浅色主题传递和业务交互不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-surface`: 宿主工作台固定使用浅色主题，不再把系统深色偏好传递为宿主页面主题。

## Impact

- 影响 `packages/nexum-test/src/main.tsx` 的主题初始化和系统主题监听。
- 不修改 Protocol、Server、Client、API 或运行时数据。
- 现有浅色 CSS 和 ChatSurface 主题接口继续复用。
