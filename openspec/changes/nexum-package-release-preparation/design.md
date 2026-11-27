# Design

## Context

现有 Nexum 发布链路已经拆分为检查、构建、打包、验证和文档检查脚本，但包版本和 dist-tag 仍由共享模块中的固定值提供，操作者需要手工组合命令。此次设计遵循 proposal.md 和规格文件：复用现有脚本，把参数化和流程编排放在根级入口，并让人工保留最终 registry 写操作。

## Goals / Non-Goals

**Goals:**

- 提供一个显式接收 `--version`、`--tag` 和可选 `--registry` 的准备入口。
- 将发布参数通过受控环境变量传递给 manifest 生成器和验证器，不修改仓库内 package.json 的版本。
- 保持现有底层命令可单独运行，并让统一入口按固定顺序执行检查、文档检查、构建、打包和验证。
- 在根目录提供 AI 可直接执行的清单，包含停止条件、证据和人工交接格式。

**Non-Goals:**

- 不实现 npm 登录、发布、撤回、registry 写入或 token 管理。
- 不引入 Changesets、版本自动推断或 workspace 全量版本升级。
- 不改变 Runtime、Protocol、Server 或 SDK 的运行时依赖方向。

## Decisions

### 1. 使用单一准备入口编排已有命令

新增 `release:nexum:prepare`，顺序调用根级 `check`、`verify:docs`、`build:packages`、`pack:nexum` 和 `verify:nexum`。这样可以沿用已有验证边界和输出，避免复制构建逻辑。相比新增一套独立发布实现，编排入口的维护面更小；相比直接把所有逻辑塞进 package.json，TypeScript 脚本更容易做参数校验、错误归因和交接输出。

### 2. 使用显式参数和进程环境传递版本信息

入口强制要求合法 semver 版本和非空 dist-tag，registry 默认为 npm 官方 HTTPS 地址。入口把版本和 tag 放入专用 `NEXUM_RELEASE_*` 环境变量供 manifest 生成器和验证器读取，把 registry 用于输入校验和人工交接输出，并保留当前 beta 版本作为底层脚本单独运行时的兼容默认值。相比修改 workspace package.json，环境传递不会污染源码版本，也能让一次准备过程的所有阶段使用同一组值。

### 3. 产物与发布动作严格分离

入口只生成 `artifacts/nexum` 下的临时 manifest、dist 文件和 tarball，最后打印人工执行的 `npm publish` 命令及核验命令。代码中不提供 `--publish` 分支，也不调用 npm publish。这样即使操作者未登录 npm，也可以完成本地准备并复核产物；registry 参数只用于交接信息，不触发网络写入。

### 4. 清单作为 AI 的唯一操作指引

根目录 `nexum-package-release-checklist.md` 使用版本和 tag 占位符，明确前置检查、标准命令、每一步证据、失败即停规则和最终报告模板。它不复制实现细节，而是把 AI 需要执行的边界和验收条件写成可复用契约。

## Risks / Trade-offs

- [Risk] 版本格式校验只覆盖发布准备入口，底层脚本仍可被直接调用并使用兼容默认值 → 清单要求所有正式准备使用统一入口，并保留底层脚本供定位问题。
- [Risk] 构建成功但人工发布前 registry 状态发生变化 → 交接命令包含明确的 tarball、tag 和 registry，发布仍由人工在发布前确认。
- [Risk] 入口重复运行会覆盖 ignored 的 `artifacts/nexum` → 产物目录是可重建的临时输出，清单要求以本次命令输出和 tarball 校验为准，不把产物纳入 Git。

## Migration Plan

1. 增加参数化入口、根级 script、AI 清单和针对入口的 focused test。
2. 运行严格 OpenSpec 校验、focused test、文档检查、统一准备命令和完整 `bun run check`。
3. 合并后使用目标版本和 tag 再准备一次产物；人工根据脚本输出执行 `npm publish`。
4. 若入口有问题，继续使用现有底层 `build:packages`、`pack:nexum` 和 `verify:nexum` 定位；无需回滚仓库版本，因为准备流程不修改源码 package.json。
