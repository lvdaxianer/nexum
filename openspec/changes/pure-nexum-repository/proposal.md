# Proposal

## Why

当前分支已经承载完整的 Nexum Runtime，但根 workspace、构建脚本、安装脚本和大量包仍然属于 OpenCode 产品。继续保留这两套产品会让依赖解析、启动入口和维护边界产生歧义；本次将 `dev-v0.0.1` 收敛为可独立运行的 Nexum 仓库，而 `dev` 保持原 OpenCode 基线不变。

## What Changes

- **BREAKING** 将根包身份、开发入口、workspace 范围和构建配置改为 Nexum。
- **BREAKING** 保留 `packages/nexum-*` 及 Nexum API/设计资料，移除未被 Nexum 使用的 OpenCode 产品包、数据包、插件包、旧服务和旧构建补丁。
- 删除根配置中所有 `@opencode/*` 依赖、OpenCode 专用脚本、环境变量和 Turbo 任务。
- 保留 `.nexum-test/` 本地数据目录规则，并将根验证入口收敛到 Nexum 包的 lint、typecheck、测试和 Surface 构建。
- 增加仓库边界回归验证，确保 workspace 只解析 Nexum 包，源码与活动配置不再引用 `@opencode/*`。
- 保留历史 OpenSpec、设计和审查记录作为不可执行的项目历史，不把它们纳入运行时 workspace。

## Capabilities

### New Capabilities

无。本次不改变 Nexum 的运行时行为或公开 API 能力。

### Modified Capabilities

无。本次是仓库身份、依赖边界和开发入口的结构性迁移，已通过 `skip_specs: true` 标记。

## Impact

- 受影响代码：根 `package.json`、`turbo.json`、`bunfig.toml`、Oxlint 配置、包说明和启动脚本。
- 受影响目录：只保留 `packages/nexum-*` 作为 workspace 包，删除不被 Nexum 引用的 OpenCode 包和工具目录。
- 受影响依赖：重新生成 `bun.lock`，移除 OpenCode workspace 依赖及其专属补丁依赖。
- 兼容性：`dev` 分支不修改；当前分支上的旧 OpenCode 包路径和根启动命令属于有意移除的 breaking change。
