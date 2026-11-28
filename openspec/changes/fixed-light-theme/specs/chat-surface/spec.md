# Spec Delta

## ADDED Requirements

### Requirement: 宿主工作台 SHALL 固定使用浅色主题

承载 ChatSurface 的 Nexum 工作台 SHALL 使用浅色页面主题，不得因操作系统的深色偏好自动切换为深色。

#### Scenario: 系统偏好为深色

- **WHEN** 用户的操作系统启用深色模式并打开工作台
- **THEN** 工作台页面和 ChatSurface 仍使用浅色主题

#### Scenario: 系统主题发生变化

- **WHEN** 用户在工作台打开后切换操作系统的浅色或深色模式
- **THEN** 工作台主题保持浅色，不重新绑定系统主题变化
