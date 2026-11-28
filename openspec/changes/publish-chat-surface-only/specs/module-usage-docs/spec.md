# Spec Delta

## MODIFIED Requirements

### Requirement: Document the public usage contract

公共模块文档 MUST 包含 `npm install nexum-ai`、subpath import、最小使用示例、组合关系、运行时依赖和验证命令；可嵌入 UI 模块还 MUST 展示 `ChatSurface` 和样式的导入方式，并说明 `theme="light" | "dark"` 可覆盖宿主主题。

#### Scenario: Follow a public module example

- **WHEN** 用户只安装 `nexum` 并复制模块文档中的最小示例
- **THEN** 示例使用 `nexum-ai` 或 `nexum-ai/<subpath>` 导入，并能在发布包边界内解析

#### Scenario: Read a source development example

- **WHEN** 贡献者需要修改模块源码或运行测试
- **THEN** 文档单独提供仓库 workspace 命令，并明确该命令不是用户安装方式

#### Scenario: Embed the Surfaces component

- **WHEN** 用户阅读旧工作台文档
- **THEN** 文档明确说明完整工作台仅供 `nexum-test` 内部使用，并指向 `nexum-ai/chat-surface`

#### Scenario: Embed only the Chat Surface

- **WHEN** 用户阅读聊天组件文档并复制最小示例
- **THEN** 示例只从 `nexum-ai/chat-surface` 和 `nexum-ai/chat-surface/styles.css` 导入，不引入完整工作台，并展示强制浅色或深色主题的用法

### Requirement: Keep documentation and exports aligned

模块文档、根 README、模块索引和发布 manifest MUST 使用同一套 subpath 名称；新增、删除或重命名入口时 MUST 同步更新这些文档；完整工作台和 `nexum-test` MUST 明确标记为内部 Demo/Test 模块。

#### Scenario: Audit documented subpaths

- **WHEN** 运行文档/发布入口审计
- **THEN** 每个文档中的公共 subpath 都存在于发布 manifest，每个内部模块均标记为非公共入口，且不存在将 `nexum-ai/surfaces` 当作公共用法的文档

#### Scenario: Find the Surfaces module

- **WHEN** 用户从模块索引查找 `nexum-surfaces`
- **THEN** 索引将其标记为内部工作台，并链接到 `nexum-test` 的开发说明，而不是公共安装入口
