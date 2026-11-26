# Tasks

## 1. Core risk contract

- [ ] 1.1 扩展 `host.ts` 和 `ToolRequest` 的资源描述、risk 类型及归一化函数；先为文件分隔符、网络命令、凭据参数和重定向编写 Core 红测。
- [ ] 1.2 扩展 Permission dangerous 判断，使 risk 与现有精确 allow/默认 ask 规则一致；运行 `permission-policy` 与 `tools` 测试。

## 2. Host and Sandbox adapters

- [ ] 2.1 更新本地 Host 的请求边界和稳定错误输出；保持路径 realpath、输出上限、超时和进程组清理，运行 Integrations Host 测试。
- [ ] 2.2 新增可注入 Sandbox Host wrapper，覆盖动作 allowlist、输出限制和取消透传；为 Application Runtime 注入路径增加测试。

## 3. Application and protocol verification

- [ ] 3.1 让 Application 工具注册使用统一 descriptor，并验证 MCP/Skill 路径不绕过 Permission/Host 边界。
- [ ] 3.2 完成敏感字段、依赖方向和 caller-safe 错误审计；运行 Core/Application/Server/Client 受影响测试与 `bun run check`。

## 4. Integration

- [ ] 4.1 通过 `openspec validate --strict`，完成 review/audit，提交并合并到 `dev-v0.0.1`。

## Workflow follow-up

- 归档完成的 OpenSpec change，并验证归档后的主规格。
