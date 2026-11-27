# Proposal

## Why

当前 Nexum 已能构建和验证 npm 产物，但发布步骤分散在多个脚本中，版本号和 dist-tag 仍有固定值。每个版本都依赖人工或 AI 重新组织命令，容易漏检，也容易把“准备产物”和“发布 npm”混在一起。

## What Changes

- 新增参数化的 `release:nexum:prepare` 入口，统一执行检查、构建、打包和 consumer 验证。
- 将版本号和 dist-tag 作为准备流程的显式输入并传递给 manifest 生成器和验证器；registry 作为校验输入和人工交接目标。
- 新增根目录 `nexum-package-release-checklist.md`，规定 AI 的执行顺序、停止条件和人工交接内容。
- 明确准备脚本不执行 `npm publish`，只输出人工发布命令。
- 保留现有底层构建、打包、文档和发布验证脚本，支持单独调试。

## Capabilities

### New Capabilities

- `package-release-preparation`: 参数化生成和验证可供人工发布的 npm tarball。
- `release-checklist`: 面向 AI 的发包准备清单、证据和交接规则。

### Modified Capabilities

- 无。现有 Runtime、Protocol、Server 和 npm 公共入口行为不变。

## Impact

- 影响根 `package.json` scripts、`script/` 下的发布准备脚本、发布验证测试和根目录发布文档。
- 生成的 `artifacts/nexum` 仍为忽略产物，不进入 Git。
- 不需要 npm 凭据，不修改 registry 状态。
