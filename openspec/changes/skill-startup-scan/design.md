# Design

## Context

详见 `proposal.md`。当前 `startNexumServer` 在自行创建 Runtime 时已经提供默认 `resolve(process.cwd(), "skills")`，但独立服务入口先调用 `createLocalRuntime` 再把 Runtime 传入 Server，导致该默认值没有传递到实际 Runtime。

## Goals / Non-Goals

**Goals:**

- 让独立服务入口在启动时扫描当前工作目录下的 `skills/`。
- 保持 Application 层对 `skillRoots` 的显式配置语义，避免库调用方隐式扫描宿主当前目录。
- 保留外部产品通过地址显式注册新增 Skill 的路径。
- 让中英文能力文档与实际生命周期一致。

**Non-Goals:**

- 不实现目录监听、定时扫描或 refresh 自动发现新增目录。
- 不新增批量注册接口或修改现有 HTTP schema。
- 不复制、移动或打包 Skill 源文件。

## Decisions

### 启动配置放在服务主入口

在 `packages/nexum-server/src/main.ts` 创建 Local Runtime 时传入默认 `skillRoots`。这样只有独立服务入口获得项目级默认行为；嵌入式 Runtime 仍由宿主通过 `skillRoots` 明确选择扫描目录。

备选方案是在 `createLocalRuntime` 内设置默认 root，但这会改变所有 Application 调用方的隐式行为，可能扫描测试目录或宿主工作目录，因此不采用。

### 新增 Skill 继续使用显式注册

运行期间新增 Skill 由拥有源目录的产品调用现有 register API。Registry 保存地址和安全元数据，不复制源文件。这样由源目录所有者控制生命周期，避免 Nexum 监听外部目录产生跨平台事件可靠性问题。

### 复用现有独立能力文档

`docs/zh-CN/capabilities/skills.md` 和 `docs/capabilities/skills.md` 已经是独立的 Skill 能力文档，本次直接补充启动扫描与手动注册边界，不再创建重复文档。

## Risks / Trade-offs

- [新增目录不会自动出现] → 外部产品在创建 Skill 后调用 register；文档明确该生命周期。
- [工作目录决定默认 root] → 产品集成内置 Skill 时通过 Runtime 的 `skillRoots` 显式传入产品资源目录。
- [多个来源出现同一 ID] → 沿用现有 `conflict` 状态，不静默选择任一来源。

## Migration Plan

无需数据迁移。升级后服务首次启动会扫描默认 `skills/`；已有 `.nexum/skills.json` 的注册记录继续按原地址恢复。回滚只需恢复服务入口代码，已持久化注册记录仍可由旧版本读取。
