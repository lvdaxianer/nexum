# Spec Delta

## REMOVED Requirements

### Requirement: Surfaces SHALL expose an embeddable public import

**Reason**: 完整演示工作台不是公共组件；外部项目只应复用右侧 `ChatSurface`。

**Migration**: 使用 `nexum-ai/chat-surface` 导入 `ChatSurface`，由宿主项目自行提供 Session、布局和其他页面能力。

### Requirement: Surfaces SHALL expose its stylesheet as a public import

**Reason**: 工作台样式属于内部演示平台，不应进入公共 tarball。

**Migration**: 使用 `nexum-ai/chat-surface/styles.css` 导入聊天组件样式。

### Requirement: Surfaces SHALL support host API configuration

**Reason**: 该配置属于内部工作台组合逻辑，不是公共 `ChatSurface` 的职责。

**Migration**: 宿主通过 `ChatSurface` 的 `client` 或 `adapter` 传入聊天协议访问方式。

### Requirement: Local development SHALL retain an explicit bootstrap entry

**Reason**: 本地完整工作台继续保留，但其入口应归属 `nexum-test`，不再以 `nexum-surfaces` 公共模块存在。

**Migration**: 执行 `bun run dev:surface` 或 `packages/nexum-test` 的开发命令启动内部演示平台。
