# Spec Delta

## ADDED Requirements

### Requirement: ChatSurface SHALL support explicit theme override

ChatSurface MUST accept an optional `theme` value of `light` or `dark`; when provided, the component MUST apply that theme to its own visual surface regardless of the host document or system color-scheme preference. When omitted, it MUST keep the component's default light theme.

#### Scenario: Force the light theme inside a dark host

- **WHEN** 宿主文档或系统偏好为深色，且 ChatSurface 接收 `theme="light"`
- **THEN** 聊天背景、文字、边框和控件使用浅色主题，不被宿主暗色选择器覆盖

#### Scenario: Force the dark theme inside a light host

- **WHEN** 宿主文档或系统偏好为浅色，且 ChatSurface 接收 `theme="dark"`
- **THEN** 聊天表面使用深色主题，不修改宿主页面的全局主题状态

#### Scenario: Use the default theme

- **WHEN** 宿主不传 `theme`
- **THEN** ChatSurface 使用默认浅色主题，并保持既有聊天交互行为
