# Proposal

## Why

截图中的 `nexum-surfaces` 是可复用的前端工作台组件，但当前源码把本地 Vite 启动逻辑和组件实现放在一起，发布脚本也没有注册该模块，因此用户安装发布包后无法通过 `import` 使用它。现在需要把它纳入统一 `nexum-ai` 包的公共 subpath，使除 `nexum-test` 外的模块都能按设计被外部项目消费。

## What Changes

- 将 `nexum-surfaces` 拆分为无副作用的可导入 Solid 组件和仅供本地开发使用的启动入口。
- 新增 `nexum-ai/surfaces` JavaScript、TypeScript 声明和配套 CSS 公共入口。
- 更新统一发布构建、manifest、consumer 验证和 tarball 检查，确保 `surfaces` 与其他公开模块一起发布。
- 更新模块索引、Surface 文档和最小导入示例，明确 `nexum-surfaces` 的公共使用边界。
- 保持 `nexum-test` 为测试模块，不进入发布包。

## Capabilities

### New Capabilities

- `embeddable-surfaces`: 提供可通过 `nexum-ai/surfaces` 导入并嵌入宿主前端的完整 Web Surface 组件及样式。

### Modified Capabilities

- `package-publishing`: 发布包新增 `surfaces` subpath、声明文件和 CSS，并要求仓库外 consumer 能导入它。
- `module-usage-docs`: `nexum-surfaces` 从内部模块调整为公共模块，索引、示例和发布入口必须保持一致。

## Impact

- 影响 `packages/nexum-surfaces/src` 的组件/启动边界、类型检查和本地 Vite 入口。
- 影响 `script/nexum-package.ts`、`script/build-nexum.ts`、`script/verify-nexum.ts` 及生成的发布 manifest。
- 影响发布包中的 CSS 资源和仓库外 consumer 验证。
- 影响中英文模块文档；不改变 Core、Protocol、Server 的运行时依赖方向。
