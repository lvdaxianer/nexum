# Design

## Context

See `proposal.md` for the motivation and public contract. 当前仓库保留多个 `packages/nexum-*` workspace 包；它们的 `exports` 指向 TypeScript 源码，内部代码通过 `@nexum/*` 和 Persistence internal subpath 互相引用。根 `package.json` 已经是 workspace 和开发脚本入口，但不是可直接发布的 production package。Chat Surface 还需要 CSS，CLI 还需要 bin，`surfaces` 和 `test` 属于仓库内应用。

## Goals / Non-Goals

**Goals:**

- 让源码 workspace 与唯一公共 `nexum` release artifact 解耦。
- 通过一个生成的 manifest 提供根入口和稳定的模块 subpath exports。
- 生成可被外部 consumer 安装的 JS、`.d.ts`、CSS 和 CLI 产物。
- 对每个 source package 维护一份用户/贡献者可读的使用文档，并校验文档与 exports 一致。
- 用 tarball consumer 验证，不把 workspace resolution 当成发布成功证据。

**Non-Goals:**

- 不把 `@nexum/*` workspace 包逐个发布到 npm。
- 不改变 Core、Protocol、HTTP/SSE、Session、Permission 或其他运行时语义。
- 不把 `nexum-surfaces` 和 `nexum-test` 变成公共运行时入口；它们继续是仓库内 Demo/Test 应用。
- 不在本次变更引入版本发布自动化、Changesets 或 CI provider 配置。

## Decisions

### 1. 使用生成的 `artifacts/nexum` 作为唯一发布目录

根 workspace package 保持开发用途和 `private` 状态。release builder 创建 `artifacts/nexum/package.json`、`README.md`、`LICENSE` 和 `dist/`，发布操作只从该目录执行。这样不会把 workspace、测试脚本、源码路径和开发依赖泄露到 npm manifest。

替代方案是直接把根 workspace `package.json` 改成可发布包，但会把开发 workspace 与用户 package 的依赖、脚本和文件边界混在一起，且无法安全控制 tarball 内容。

### 2. 使用一个 release facade 加上多个 source entrypoint

release facade 提供根 `nexum` 入口，导出最常用的 Runtime、Server 和 Client 能力；其他 subpath 直接映射到已核对的 workspace source entrypoint：`core`、`protocol`、`application`、`persistence`、`persistence/memory`、`persistence/file`、`persistence/sqlite`、`integrations`、`client`、`server`、`surface-adapter`、`chat-surface` 和 `cli`。

替代方案是只提供一个巨大 root export，会失去用户需要的模块边界；另一方案是继续发布多个 `@nexum/*` 包，与“单一公共包”约束冲突。

### 3. 编译内部 workspace，保留第三方运行时依赖

JS 构建将 `@nexum/*` workspace 依赖编译进对应 subpath，第三方运行时依赖留在生成 manifest 的 `dependencies`。构建后 JS 不得再出现 `@nexum/` import。这样外部 consumer 只需要安装 `nexum`，不会触发隐藏的 workspace 包安装。

Persistence 的 internal subpath 只作为源码构建输入，不作为公共入口；`persistence/file`、`persistence/memory` 和 `persistence/sqlite` 的最终 bundle 将内部实现收进各自产物。

### 4. 声明文件通过 release specifier 重写

TypeScript 声明生成后，release builder 将声明中的 `@nexum/<name>` specifier 转换为 `nexum/<subpath>`，并检查所有相对路径和 public subpath 都指向 `dist` 内文件。构建脚本不会修改源码声明或 workspace package 文件。

替代方案是发布隐藏的 `@nexum/*` 类型依赖，会破坏单包安装边界；手写 `.d.ts` 则容易与源码漂移。

### 5. 文档分为用户入口和源码开发入口

每个 `packages/nexum-*` 保留或补齐 README，统一包含 `npm install nexum`、subpath import、最小示例、组合关系和 workspace 开发命令。`docs/modules/` 记录架构和实现边界；`surfaces`/`test` 明确标记为仓库内应用。一个审计脚本读取 release manifest、文档索引和 README，检查 subpath 一对一覆盖。

### 6. 用仓库外 consumer 作为发布验收

验证流程生成 tarball，在系统临时目录创建独立 consumer，只安装 tarball，再执行 ESM import、TypeScript typecheck、CLI bin、CSS 和关键 Runtime 入口验证。测试不能从当前 workspace 的 `node_modules` 或 package alias 推断发布成功。

## Risks / Trade-offs

- [Bun 版本差异导致 JS 或声明构建行为不同] → 使用仓库声明的 `bun@1.4.4` 作为 release gate，并在构建脚本开头检查版本；声明生成失败时停止构建。
- [声明重写遗漏内部 specifier] → 对所有生成 `.d.ts` 扫描 `@nexum/` 和 `src/`，发现即失败。
- [多入口 bundle 重复第三方代码或产物变大] → 内部 workspace 允许 bundle，第三方保持 external；本次优先保证单包边界和可验证性，后续再优化共享 chunk。
- [CSS 或 CLI bin 漏进 tarball] → 将 CSS、bin 和 exports 纳入独立 consumer smoke 验证。
- [模块文档与 subpath 漂移] → release manifest、README、docs/modules 索引使用同一份入口映射做审计。

## Migration Plan

1. 新增 release builder、入口映射和 artifact 验证脚本，不改变现有 workspace imports。
2. 生成 `artifacts/nexum`，在仓库外 consumer 通过后再把 README 切换为单包安装方式。
3. 将模块 README 与 `docs/modules/` 迁移到 `nexum/<subpath>` 语义。
4. 发布前运行完整构建、tarball、consumer、lint、typecheck 和相关包测试。
5. 回滚时删除生成的 `artifacts/nexum`，恢复 README/文档中的 workspace 开发入口；源码 workspace 不需要迁移。
