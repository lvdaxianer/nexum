# Spec Delta

## MODIFIED Requirements

### Requirement: Modular subpath exports

公共 `nexum-ai` 包 MUST 为已支持的模块提供稳定 subpath exports，并且每个 subpath MUST 指向编译后的 JavaScript 和对应 TypeScript 声明；可嵌入聊天 UI 还 MUST 提供 `chat-surface` 配套 CSS subpath，且不得发布完整工作台 `surfaces` subpath。

#### Scenario: Import a runtime module

- **WHEN** 用户从 `nexum-ai/core`、`nexum-ai/application`、`nexum-ai/client` 或 `nexum-ai/server` 导入公开 API
- **THEN** 运行时解析到 `dist` 中的 JavaScript，类型解析到对应的 `.d.ts`，不得解析到 `src`

#### Scenario: Import persistence variants

- **WHEN** 用户从 `nexum-ai/persistence/memory`、`nexum-ai/persistence/file` 或 `nexum-ai/persistence/sqlite` 导入适配器
- **THEN** 对应实现、类型和运行时外部依赖均可从同一个 `nexum-ai` 包安装结果中解析

#### Scenario: Import the embeddable surfaces module

- **WHEN** 用户从历史发布包检查 `surfaces` subpath
- **THEN** 该旧工作台入口不再作为当前发布契约提供，迁移到 `nexum-ai/chat-surface`

#### Scenario: Import the public Chat Surface

- **WHEN** 用户从 `nexum-ai/chat-surface` 及 `nexum-ai/chat-surface/styles.css` 导入组件和样式
- **THEN** 运行时、类型声明和 CSS 均解析到 tarball 内的编译产物，不要求安装或访问任何 `@nexum/*` workspace 包

#### Scenario: Reject the internal workbench subpath

- **WHEN** 用户检查发布 manifest 或尝试解析 `nexum-ai/surfaces`
- **THEN** manifest 不包含该 subpath，发布包不提供完整工作台入口

### Requirement: Compiled artifact boundary

发布 tarball MUST 只包含编译产物、类型声明、必要的 CSS/CLI 资源、README 和 LICENSE，不得包含源码、测试、workspace 配置或本地构建缓存；公共 JavaScript MUST 面向低版本浏览器完成语法降级，并 MUST NOT 保留 `import.meta`、顶层 `await` 或未编译的构建工具运行时表达式。

#### Scenario: Inspect the tarball

- **WHEN** 对生成的 `nexum` tarball 执行内容清单检查
- **THEN** 清单包含 `dist` 和发布文档，且不包含 `src`、`test`、`.turbo`、workspace lockfile 或源码 `package.json`

#### Scenario: Use the tarball outside the repository

- **WHEN** 临时 consumer 只安装 `nexum-ai` tarball 并执行公开 subpath import
- **THEN** import、类型检查和最小运行时调用成功，且不依赖原仓库路径

#### Scenario: Inspect a low-version Chat Surface artifact

- **WHEN** 对生成的 `chat-surface` JavaScript 执行产物扫描
- **THEN** 产物不包含 `import.meta`、顶层 `await`、workspace import 或未降级的目标现代语法，并可作为浏览器 ESM 被导入

### Requirement: Reproducible release verification

仓库 MUST 提供构建、打包和仓库外验证命令；验证失败时 MUST 以非零状态结束并指出缺失产物、错误入口或源码泄漏；验证范围 MUST 覆盖所有可发布模块，明确只发布 `ChatSurface` UI，并排除 `nexum-test` 和内部完整工作台。

#### Scenario: Detect an invalid artifact

- **WHEN** 发布目录缺少某个声明文件、subpath 或包含源码文件
- **THEN** 验证命令失败，并报告对应路径或入口，而不是返回成功

#### Scenario: Exclude only the test module

- **WHEN** 发布构建枚举仓库中的 `packages/nexum-*` 模块
- **THEN** 除 `nexum-test` 外的模块均有可验证的公共入口，`nexum-test` 不出现在发布 manifest 或 tarball 中

#### Scenario: Run the release verification flow

- **WHEN** 在干净 checkout 执行发布构建、tarball 生成和 consumer 验证
- **THEN** 所有公共 subpath、类型声明、CLI bin、Chat Surface CSS 和低版本语法扫描通过，且 `surfaces` 与 `nexum-test` 不出现在发布 manifest 或 tarball 中
