# Spec Delta

## MODIFIED Requirements

### Requirement: Modular subpath exports

公共 `nexum-ai` 包 MUST 为已支持的模块提供稳定 subpath exports，并且每个 subpath MUST 指向编译后的 JavaScript 和对应 TypeScript 声明；可嵌入 Web Surface 还 MUST 提供配套 CSS subpath。

#### Scenario: Import a runtime module

- **WHEN** 用户从 `nexum-ai/core`、`nexum-ai/application`、`nexum-ai/client` 或 `nexum-ai/server` 导入公开 API
- **THEN** 运行时解析到 `dist` 中的 JavaScript，类型解析到对应的 `.d.ts`，不得解析到 `src`

#### Scenario: Import persistence variants

- **WHEN** 用户从 `nexum-ai/persistence/memory`、`nexum-ai/persistence/file` 或 `nexum-ai/persistence/sqlite` 导入适配器
- **THEN** 对应实现、类型和运行时外部依赖均可从同一个 `nexum-ai` 包安装结果中解析

#### Scenario: Import the embeddable surfaces module

- **WHEN** 用户从发布包的 `surfaces` subpath 导入组件，并导入对应的 `surfaces/styles.css`
- **THEN** 运行时、类型声明和 CSS 均解析到 tarball 内的编译产物，不要求安装或访问任何 `@nexum/*` workspace 包

### Requirement: Reproducible release verification

仓库 MUST 提供构建、打包和仓库外验证命令；验证失败时 MUST 以非零状态结束并指出缺失产物、错误入口或源码泄漏；验证范围 MUST 覆盖所有可发布模块并明确排除 `nexum-test`。

#### Scenario: Run the release verification flow

- **WHEN** 在干净 checkout 执行发布构建、tarball 生成和 consumer 验证
- **THEN** 所有 public subpath、类型声明、CLI bin、Chat Surface CSS 和 Surfaces 组件/CSS 检查通过

#### Scenario: Detect an invalid artifact

- **WHEN** 发布目录缺少某个声明文件、subpath 或包含源码文件
- **THEN** 验证命令失败，并报告对应路径或入口，而不是返回成功

#### Scenario: Exclude only the test module

- **WHEN** 发布构建枚举仓库中的 `packages/nexum-*` 模块
- **THEN** 除 `nexum-test` 外的模块均有可验证的公共入口，`nexum-test` 不出现在发布 manifest 或 tarball 中
