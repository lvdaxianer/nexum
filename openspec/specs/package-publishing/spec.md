# package-publishing Specification

## Purpose
为 Nexum 提供唯一、可安装、可验证的编译发布包，同时保留内部 workspace 的模块化开发方式，使用户无需下载源码即可按稳定 subpath 使用 Nexum 能力。

## Requirements

### Requirement: Single public package

对外发布 MUST 只有一个名为 `nexum` 的包；`@nexum/*` workspace 包 MUST NOT 作为用户安装入口或独立公共发布包。

#### Scenario: Install the public package

- **WHEN** 用户在仓库外执行 `npm install nexum` 或等价的包管理器安装命令
- **THEN** 安装结果只需要公共 `nexum` 包及其声明的外部运行时依赖，不要求访问 Nexum 源码 workspace

#### Scenario: Workspace packages remain internal

- **WHEN** 发布包被打包或检查依赖清单
- **THEN** 用户可见的 package manifest 不得要求安装 `@nexum/core`、`@nexum/application` 或其他 `@nexum/*` 包

### Requirement: Modular subpath exports

公共 `nexum` 包 MUST 为已支持的模块提供稳定 subpath exports，并且每个 subpath MUST 指向编译后的 JavaScript 和对应 TypeScript 声明。

#### Scenario: Import a runtime module

- **WHEN** 用户从 `nexum/core`、`nexum/application`、`nexum/client` 或 `nexum/server` 导入公开 API
- **THEN** 运行时解析到 `dist` 中的 JavaScript，类型解析到对应的 `.d.ts`，不得解析到 `src`

#### Scenario: Import persistence variants

- **WHEN** 用户从 `nexum/persistence/memory`、`nexum/persistence/file` 或 `nexum/persistence/sqlite` 导入适配器
- **THEN** 对应实现、类型和运行时外部依赖均可从同一个 `nexum` 包安装结果中解析

### Requirement: Compiled artifact boundary

发布 tarball MUST 只包含编译产物、类型声明、必要的 CSS/CLI 资源、README 和 LICENSE，不得包含源码、测试、workspace 配置或本地构建缓存。

#### Scenario: Inspect the tarball

- **WHEN** 对生成的 `nexum` tarball 执行内容清单检查
- **THEN** 清单包含 `dist` 和发布文档，且不包含 `src`、`test`、`.turbo`、workspace lockfile 或源码 `package.json`

#### Scenario: Use the tarball outside the repository

- **WHEN** 临时 consumer 只安装 `nexum` tarball 并执行公开 subpath import
- **THEN** import、类型检查和最小运行时调用成功，且不依赖原仓库路径

### Requirement: Reproducible release verification

仓库 MUST 提供构建、打包和仓库外验证命令；验证失败时 MUST 以非零状态结束并指出缺失产物、错误入口或源码泄漏。

#### Scenario: Run the release verification flow

- **WHEN** 在干净 checkout 执行发布构建、tarball 生成和 consumer 验证
- **THEN** 所有 public subpath、类型声明、CLI bin 和 Chat Surface CSS 检查通过

#### Scenario: Detect an invalid artifact

- **WHEN** 发布目录缺少某个声明文件、subpath 或包含源码文件
- **THEN** 验证命令失败，并报告对应路径或入口，而不是返回成功
