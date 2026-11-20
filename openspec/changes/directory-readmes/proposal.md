# Proposal

## Why

仓库已经包含 Headless Core、服务端、协议、客户端、UI 和项目级 Skill 等多个独立模块，但目录职责分散在代码和根 README 中，新成员进入某个目录后仍需要浏览实现才能判断它的边界。现在补充目录级 README，可以把仓库结构变成可导航、可维护的工程地图。

## What Changes

- 为一级工程目录增加中文 README，说明目录职责、适用场景和边界。
- 为没有现有说明的独立 package 增加 README；保留并补充已有 package README。
- 为 `packages/headless-*`、`packages/protocol`、`packages/client` 和 `skills` 等核心模块标注入口、依赖关系和验证命令。
- 更新根 README 的目录导航，链接到各模块 README。
- 不修改运行时代码、API 行为、构建配置或依赖版本。

## Capabilities

### New Capabilities

无。该变更是纯文档和仓库导航改进，不引入新的运行时行为。

### Modified Capabilities

无。

本变更在 `.openspec.yaml` 中使用 `skip_specs: true`，因为没有可由行为规格描述的系统能力变化。

## Impact

- 影响根 `README.md`、一级目录 README 和缺失 README 的独立 package 目录。
- 不影响 TypeScript、Bun、服务端、客户端和页面运行时。
- 验证重点为目录覆盖率、Markdown 格式、链接目标和敏感信息扫描。
