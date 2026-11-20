# Headless Skill Registry 设计

## 背景

目录型 Skill 可以包含 `SKILL.md`、references、scripts 和 evals。现有 OpenCode 原生 Core 已有 Skill discovery、Skill service、Prompt attachment 和 `session.skill`，但当前 Headless POC 没有把这些能力迁移到 UI 无关的 Core，也没有让页面控制台使用 `@skill`。

## 目标

- 让项目可复现地注册完整 Skill 包，而不是依赖某台机器的全局目录。
- 让任何 UI 通过 Headless API 列出、校验和激活 Skill。
- 让 Session Prompt 支持 `@skill-id`，并把 Skill 指令作为受控上下文注入。
- 让 Skill 引起的文件、shell 和 HTTP 操作仍然经过现有 Permission、取消和事件链路。
- 通过页面运行 Skill 验证，并保留 Skill 自带 100 个本地测试作为独立证据。

## 方案

### 1. 项目内 Skill Registry

项目根目录的 `skills/` 是可提交的来源；Registry 只扫描配置的 root，要求每个 Skill 有合法 `SKILL.md`，保留安全相对路径、版本、文件数和内容 digest。宿主绝对路径只在 Core 内部使用，API 不返回。

### 2. Prompt 解析与激活

Prompt parser 以注册表 ID 为边界识别 `@skill-id`，输出原始文本和 mention range。Session service 在 `skill.use` 允许后加载完整 Skill 内容，生成 attachment；Skill 不获得绕过工具权限的执行通道。

### 3. API/UI 控制

Server 提供列表、详情、注册/刷新、校验和激活接口；页面提供 Skill 管理区、`@` 自动补全、当前 Session Skill 状态和本地验证结果。所有错误使用稳定 code/traceId，敏感内容只返回脱敏摘要。

### 4. 验证执行

Skill 校验默认只运行本地声明的 eval/test，限制 cwd、环境变量、超时和输出；不注入 Token、不连接真实数据库、不执行 save/publish。用户明确允许后，Skill 产生的正常工具调用仍沿用 Permission 队列。

## 非目标

- 不把整个 OpenCode Desktop/TUI 移植到 Headless UI。
- 不允许页面上传或远程 URL 任意覆盖本地 Skill。
- 不自动执行 Skill 的真实外部业务接口。
- 不把全局 `/Users/lvdaxianer/.agents/skills` 当作部署时唯一来源。

## 验收

- Registry 可发现配置目录中的完整文件清单，并拒绝路径逃逸、重复 ID 和坏 manifest。
- `@skill-id` 能在 Session 中形成 attachment，权限拒绝和取消均为 terminal 状态。
- API、生成客户端和页面能完成 list/detail/register/refresh/validate/activate。
- UI smoke 覆盖自动补全、激活、验证失败恢复和凭据脱敏。
- Skill contract drift 与全部 100 个本地 Python 测试通过。
