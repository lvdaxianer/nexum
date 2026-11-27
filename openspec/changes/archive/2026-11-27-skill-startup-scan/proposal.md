# Proposal

## Why

Nexum 已经具备从配置 Skill root 扫描目录型 Skill 的能力，但独立服务入口创建 Runtime 时没有传入默认 root，导致服务启动后无法按约定发现项目 `skills/` 目录中的内置 Skill。产品仍需要保留通过地址显式注册外部项目 Skill 的能力，因此需要明确两种入口的边界。

## What Changes

- 服务主入口启动 Runtime 时默认配置当前工作目录下的 `skills/` 作为 Skill root。
- 启动时发现 root 下已有的多个 Skill，并沿用现有校验、持久化和冲突处理逻辑。
- 保留现有基于地址的手动注册入口，供外部产品在运行期间新增 Skill 时调用。
- 更新中英文 Skill 能力文档，说明内置 Skill、外部 Skill、注册持久化和不自动监听新增目录的边界。
- 不新增目录监听，不修改 `refresh` 的语义，不改变现有注册 API 契约。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `headless-skill-registry`: 明确服务启动时对配置 root 的初始发现，以及运行期间新增目录需要显式注册。

## Impact

- 代码：`packages/nexum-server/src/main.ts` 及其启动配置测试。
- 文档：`docs/zh-CN/capabilities/skills.md`、`docs/capabilities/skills.md`。
- 运行时：默认服务启动会读取当前工作目录下的 `skills/` 子目录；外部路径仍由显式注册进入 Registry。
- 不新增依赖，不修改 HTTP 请求和响应字段。
