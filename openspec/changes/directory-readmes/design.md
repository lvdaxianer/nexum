# Design

## Context

仓库当前包含协议、客户端、服务端、Headless Core、UI、通用 package 和项目级 Skill。已有 README 的覆盖不完整，根 README 的目录结构也只列出了部分 Headless 目录。此次变更只补充文档，不改变任何运行时行为。

## Goals / Non-Goals

### Goals

- 建立从根目录到 package 的可导航文档层级。
- 让读者在不阅读源码的情况下知道目录用途、边界、入口和验证方式。
- 对 Headless 链路明确依赖方向和职责分工。
- 避免为构建产物、依赖目录和测试夹具产生文档噪音。

### Non-Goals

- 不重构目录，不移动文件，不修改 package 名称。
- 不修改 API、协议、配置、依赖和构建脚本。
- 不为本地不存在的目录创建占位 README。

## Decisions

### 1. 以 README 作为目录入口

每个可独立理解的目录使用该目录下的 `README.md` 作为入口；根 README 只保留项目级内容和导航，避免把所有 package 细节堆到根文件。

### 2. 统一说明结构

新增 README 至少包含“职责、关键内容、边界、验证”四类信息。对于极小目录可以使用短文档，但必须能回答“这里放什么、什么时候改、如何检查”。

### 3. 保留已有专业文档

已有 README 可能包含完整 API 或安装说明，不进行大规模重写，只补充缺失的目录定位和与 Headless Core 的关系。这样可以降低文档冲突和无意义 diff。

### 4. 目录覆盖以当前仓库为准

截图中出现但当前 checkout 不存在的目录不创建空壳文档。目录新增时由对应贡献者补充 README，并更新根目录导航。

## Alternatives Considered

- 只在根 README 增加一张目录表：改动最小，但进入子目录后仍缺少上下文，不满足目录自解释目标。
- 为所有嵌套目录都创建 README：覆盖最彻底，但会产生大量重复文档，且测试夹具、脚本和源代码子目录不需要独立入口。
- 推荐方案：一级目录 + 独立 package + 项目 Skill 目录分层说明，兼顾可发现性和维护成本。

## Risks / Trade-offs

- package 数量较多，README 可能随模块演进滞后；通过统一模板和验证清单降低风险。
- 根 README 与子 README 可能重复；根 README 只保留摘要和链接，详细内容放在子目录。
- 文档变更不能自动保证代码架构正确，因此只声明目录职责，不把 README 当作运行时契约。

## Migration Plan

1. 先补齐一级目录和缺失 package README。
2. 更新根目录导航并链接到子 README。
3. 使用脚本检查目标目录覆盖率、相对链接和 Markdown 格式。
4. 后续新增独立目录时沿用模板并在根 README 增加入口。

## Open Questions

无。本次范围已经按当前 checkout 的实际目录确定。
