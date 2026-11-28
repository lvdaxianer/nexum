# module-usage-docs Specification

## Purpose
让使用者可以不阅读源码就理解每个 Nexum 模块的安装入口、公开能力、组合方式和运行约束，同时让贡献者能够从模块文档追溯到源码、测试和架构边界。

## Requirements

### Requirement: One usage document per module

每个 `packages/nexum-*` 模块 MUST 有一个可从模块索引到达的使用文档；文档 MUST 标明该模块是公共 `nexum-ai/<subpath>` 入口、内部模块还是 Demo/Test 模块。

#### Scenario: Find a module document

- **WHEN** 用户从根 README 或模块索引选择任意 Nexum 模块
- **THEN** 可以进入唯一对应文档，并看到该模块的公共安装/开发边界

#### Scenario: Document an internal module

- **WHEN** 模块不作为独立 npm 包发布
- **THEN** 文档 MUST 明确说明用户安装 `nexum-ai`，并使用对应 subpath 或仅在仓库 workspace 内使用

### Requirement: Document the public usage contract

公共模块文档 MUST 包含 `npm install nexum-ai`、subpath import、最小使用示例、组合关系、运行时依赖和验证命令；示例 MUST 不引用源码相对路径或 `@nexum/*` 用户安装命令；可嵌入 UI 模块还 MUST 展示组件和样式的导入方式。

#### Scenario: Follow a public module example

- **WHEN** 用户只安装 `nexum` 并复制模块文档中的最小示例
- **THEN** 示例使用 `nexum-ai` 或 `nexum-ai/<subpath>` 导入，并能在发布包边界内解析

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
