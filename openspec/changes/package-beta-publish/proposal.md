# Proposal

## Why

当前发布构建已经能够生成并验证单包产物，但公开包名仍为已被占用的 `nexum`，无法进行 npm 发布。现在需要使用可用的产品包名 `nexum-ai` 发布第一个 beta 版本，先建立可安装、可验证的公开入口。

## What Changes

- 将生成的公开 npm 包名从 `nexum` 改为 `nexum-ai`。
- 将公开 subpath、README、模块文档和仓库外 consumer 示例同步为 `nexum-ai/<subpath>`。
- 支持生成 `0.1.0-beta.0` 内测版本，并使用 `beta` dist-tag 发布，不覆盖 `latest`。
- 保留仓库内部 `@nexum/*` workspace 包和私有 root workspace 不变。
- 为发布产物补充 Bun 运行时约束和正式包元数据，继续禁止源码、测试和 workspace 依赖进入 tarball。
- 在真实 npm 发布前执行构建、tarball、仓库外 consumer、类型、CLI、CSS 和完整检查。

## Capabilities

### New Capabilities

- `package-beta-release`: 生成并发布名为 `nexum-ai` 的可验证 beta npm 包。

### Modified Capabilities

- `package-publishing`: 将既有单包发布契约的公开包名、安装入口和版本发布规则改为 `nexum-ai`。

## Impact

- 影响 `script/build-nexum.ts`、`script/nexum-package.ts`、`script/verify-nexum.ts`、发布脚本、根 README、模块 README 和 `docs/modules/` 文档。
- 影响生成 manifest 的 `name`、`version`、`exports`、运行时元数据和外部 consumer 依赖声明。
- 影响 npm registry：发布 `nexum-ai@0.1.0-beta.0`，使用 `beta` dist-tag。
- 不修改 Runtime、Protocol 或业务运行行为；该变更只调整公开打包、文档和发布边界。
