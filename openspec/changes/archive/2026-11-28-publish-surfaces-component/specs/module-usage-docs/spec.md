# Spec Delta

## MODIFIED Requirements

### Requirement: Document the public usage contract

公共模块文档 MUST 包含 `npm install nexum`、subpath import、最小使用示例、组合关系、运行时依赖和验证命令；示例 MUST 不引用源码相对路径或 `@nexum/*` 用户安装命令；可嵌入 UI 模块还 MUST 展示组件和样式的导入方式。

#### Scenario: Follow a public module example

- **WHEN** 用户只安装 `nexum` 并复制模块文档中的最小示例
- **THEN** 示例使用 `nexum` 或 `nexum/<subpath>` 导入，并能在发布包边界内解析

#### Scenario: Read a source development example

- **WHEN** 贡献者需要修改模块源码或运行测试
- **THEN** 文档单独提供仓库 workspace 命令，并明确该命令不是用户安装方式

#### Scenario: Embed the Surfaces component

- **WHEN** 用户阅读 Surfaces 模块文档并复制最小示例
- **THEN** 示例通过 `nexum-ai/surfaces` 和 `nexum-ai/surfaces/styles.css` 导入可嵌入组件及样式，不要求复制 Vite 启动代码

### Requirement: Keep documentation and exports aligned

模块文档、根 README、模块索引和发布 manifest MUST 使用同一套 subpath 名称；新增、删除或重命名入口时 MUST 同步更新这些文档；除测试模块外，每个 `packages/nexum-*` 模块的公共边界 MUST 在索引中明确标记。

#### Scenario: Audit documented subpaths

- **WHEN** 运行文档/发布入口审计
- **THEN** 每个文档中的公共 subpath 都存在于发布 manifest，每个发布 subpath 都有对应文档或明确标记为内部入口

#### Scenario: Find the Surfaces module

- **WHEN** 用户从模块索引查找 `nexum-surfaces`
- **THEN** 索引将其列为 `nexum-ai/surfaces` 公共模块，并链接到包含 import、样式和验证命令的文档
