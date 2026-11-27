# Spec Delta

## Purpose

为 Nexum 提供可重复的 npm 发包准备流程，使每个版本都能用显式版本号和 dist-tag 生成、验证可供人工发布的 tarball，同时避免自动改变 npm registry 状态。

## ADDED Requirements

### Requirement: 准备流程接受显式发布参数

准备流程 MUST 接受版本号和 dist-tag，并可接受 registry 地址；缺少必需参数或参数格式无效时 MUST 在生成产物前失败。

#### Scenario: 使用 beta 版本准备产物

- **WHEN** 执行准备命令并传入合法的版本号、`beta` dist-tag 和可选 registry
- **THEN** 流程使用这些值生成 package manifest，并继续执行后续检查

#### Scenario: 缺少或非法参数

- **WHEN** 未传入版本号、dist-tag，或传入不合法的版本号、空 tag 或非 HTTP(S) registry
- **THEN** 流程以非零状态退出，并说明修正参数，不生成可交付 tarball

### Requirement: 准备流程生成可验证的 npm 产物

准备流程 MUST 执行项目检查、文档检查、构建、打包和发布前验证，并在成功时生成包含目标包元数据的 tarball 和可追溯的验证输出。

#### Scenario: 所有检查通过

- **WHEN** 项目检查、文档检查、构建、打包和 consumer/CLI/CSS/types 验证均通过
- **THEN** 流程以零状态退出，并报告包名、版本、dist-tag、tarball 路径及各阶段成功证据

#### Scenario: 任一阶段失败

- **WHEN** 任一检查、构建、打包或产物验证失败
- **THEN** 流程以非零状态退出，标明失败阶段，并不得输出“可发布”结论

### Requirement: 准备流程不得执行发布

准备流程 MUST NOT 执行 `npm publish`、写入 npm registry 或要求 npm 凭据；成功时 MUST 仅输出供人工确认后执行的发布命令。

#### Scenario: 准备成功后的人工交接

- **WHEN** 所有准备阶段完成
- **THEN** 输出包含目标 tarball、dist-tag、registry 和人工发布命令，但流程本身不发包

#### Scenario: 未登录 npm

- **WHEN** 操作者未登录 npm
- **THEN** 只要本地检查和构建成功，准备流程仍可完成，并将登录/发布留给人工操作
