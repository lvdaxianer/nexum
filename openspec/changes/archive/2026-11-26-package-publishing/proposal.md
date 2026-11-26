# Proposal

## Why

当前 Nexum 是面向仓库开发的 workspace：各 `@nexum/*` 包直接导出 `src`，大多数包仍为 `private`，用户无法只安装一个稳定的编译产物。需要把源码 workspace 与对外消费边界分开，让用户安装唯一的 `nexum` 包，同时保留按模块导入的能力。

## What Changes

- 生成唯一公共 npm 包 `nexum`，不直接发布任何 `@nexum/*` workspace 包。
- 在 `nexum` 内提供 `nexum/core`、`nexum/application`、`nexum/server`、`nexum/client`、`nexum/persistence/file` 等稳定 subpath exports。
- 新增统一构建、打包和仓库外 consumer 验证流程，产物只包含编译后的 JS、`.d.ts`、CSS、README 和 LICENSE。
- 保留源码 workspace 供 Nexum 内部开发；workspace 包名不进入用户安装命令和发布依赖。
- 为每个源码模块补齐对应使用文档，并把文档中的安装方式统一为 `npm install nexum` 与 `nexum/<subpath>` 导入。
- 更新根 README、模块索引和包级 README，区分用户安装路径与仓库源码开发路径。

## Capabilities

### New Capabilities

- `package-publishing`: 生成单一 `nexum` 发布包及其模块化 subpath 入口，并验证用户只依赖编译产物。
- `module-usage-docs`: 为每个 Nexum 模块提供与公共入口对应的安装、使用、组合和开发文档。

### Modified Capabilities

无。本变更不修改 Agent Runtime、Protocol、HTTP/SSE 或 Session 运行语义。

## Impact

- 影响根构建脚本、release artifact 生成、各 workspace package 的源码入口映射、根 README、`packages/*/README.md`、`docs/modules/` 和模块索引。
- 需要处理 `.d.ts` 中的内部 `@nexum/*` 类型引用、Persistence internal 依赖、Chat Surface CSS 和 CLI bin。
- 不直接发布 `@nexum/*` 包，不修改运行时行为，不引入 Changesets；发布命令从生成的 `artifacts/nexum` 目录执行。
