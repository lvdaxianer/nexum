# Nexum 单包发布与模块文档设计

## 目标

把 Nexum 从“多个源码 workspace 包”整理成“一个公共 `nexum` 包 + 多个模块 subpath”。用户只安装 `nexum`，源码仓库内部仍可使用 `@nexum/*` workspace 进行开发和测试。

## 核心方案

保留现有 `packages/nexum-*` 作为源码模块，不逐个发布。新增 release builder，把已核对的 source entrypoint 编译到 `artifacts/nexum/dist`，并生成仅用于发布的 package manifest。发布 manifest 对外暴露根入口和模块 subpath，例如 `nexum/core`、`nexum/application`、`nexum/server`、`nexum/persistence/file`、`nexum/chat-surface`。

内部 `@nexum/*` 依赖在 JS bundle 中被编译进对应产物；第三方依赖进入生成 manifest 的 dependencies。声明文件中的内部 package specifier 被改写为 `nexum/<subpath>`，再通过仓库外 tarball consumer 验证真实安装边界。

每个源码模块对应一份使用文档。公共模块文档以 `npm install nexum` 和 `nexum/<subpath>` 为用户入口，同时保留单独的 workspace 开发命令。`nexum-surfaces` 和 `nexum-test` 标记为仓库内 Demo/Test，不进入公共运行时 subpath。

## 验收

- 只生成并发布一个 `nexum` package manifest。
- 所有公共 subpath 都有 JS、`.d.ts` 和对应文档。
- tarball 不含源码、测试或 workspace 配置。
- 仓库外 consumer 可以只安装 tarball 并导入核心、Application、Server、Client、Persistence、Chat Surface 和 CLI 能力。
- 根 README、模块 README、模块索引和发布 manifest 的入口名称一致。
