# Security

Nexum Runtime 可以执行模型请求、文件操作、Shell 工具和外部 Skill。权限策略用于让宿主明确控制这些动作，但它不是操作系统级沙箱。需要强隔离时，请将 Nexum 放在容器、虚拟机或专用沙箱中运行。

## Runtime boundary

- 外部 Skill 通过地址注册，Nexum 校验入口文件、路径边界和摘要后才进入可发现状态。
- 工具调用经过 Permission Policy；宿主仍应为模型、文件系统、Shell、MCP 和网络配置最小权限。
- 模型供应商收到的数据受其自身隐私政策约束，不属于 Nexum 的控制范围。
- 外部 MCP Server、Skill 源目录和用户自定义配置由部署方负责信任评估。

## Reporting

请不要在公开 issue 中提交凭据、模型 API Key、Session 内容或外部 Skill 源代码。报告安全问题时，先移除敏感数据，并通过仓库维护者指定的私密渠道提交复现步骤、影响范围和修复建议。
