# embeddable-surfaces Specification

## Purpose

为外部 Web 应用提供可直接导入和嵌入的完整 Nexum 工作台组件，使宿主能够复用现有会话、模型、Skill、权限和事件交互，而不需要复制仓库源码或触发组件自身的全局启动逻辑。

## Requirements

### Requirement: Surfaces SHALL expose an embeddable public import

发布包 MUST 提供 `nexum-ai/surfaces` 入口，入口 SHALL 导出可挂载的 `NexumSurfaces` 组件及其公开类型，并且导入该入口不得自动查找 DOM 根节点、执行全局渲染或启动第二个应用实例。

#### Scenario: Import the public component

- **WHEN** 外部项目从 `nexum-ai/surfaces` 导入 `NexumSurfaces`
- **THEN** 包管理器解析到发布包内的编译 JavaScript 和 TypeScript 声明，且导入过程不因缺少 `#root` DOM 节点而失败

#### Scenario: Mount inside a host container

- **WHEN** 宿主在自己的容器中渲染 `NexumSurfaces`
- **THEN** 工作台视图只挂载到宿主提供的位置，不替换宿主页面根节点或创建额外的全局渲染入口

### Requirement: Surfaces SHALL expose its stylesheet as a public import

发布包 MUST 提供与组件对应的 `nexum-ai/surfaces/styles.css` 入口，样式 SHALL 覆盖工作台自身和其内置 Chat Surface 所需的公共样式，并且不要求外部项目引用仓库源码路径。

#### Scenario: Import the surface stylesheet

- **WHEN** 外部项目导入 `nexum-ai/surfaces/styles.css`
- **THEN** 包解析到发布 tarball 内的 CSS 文件，且文件不包含仓库源码路径或 `@nexum/*` workspace 引用

### Requirement: Surfaces SHALL support host API configuration

`NexumSurfaces` MUST 接受可选的 API 基地址配置；未提供时 SHALL 保留当前默认地址行为，提供时所有工作台请求和内置 Chat Surface 请求 SHALL 使用该地址。

#### Scenario: Use a host-provided API base URL

- **WHEN** 宿主以自定义 API 基地址挂载 `NexumSurfaces`
- **THEN** 模型、Session、Skill、MCP、权限策略和聊天请求均发送到该基地址

#### Scenario: Preserve the default API base URL

- **WHEN** 宿主未传入 API 基地址
- **THEN** 组件继续使用构建环境配置或当前页面主机上的默认 Nexum API 地址

### Requirement: Local development SHALL retain an explicit bootstrap entry

仓库本地 Vite 开发入口 MUST 继续能启动完整工作台，但启动行为 SHALL 位于独立的应用入口而非公共组件导入副作用中。

#### Scenario: Run the local surface development page

- **WHEN** 贡献者执行 `bun run dev:surface` 或 Surface 的 Vite build
- **THEN** 页面仍能在本地根节点渲染完整工作台，并加载对应样式
