# @nexum/integrations

Nexum Core Port 的外部系统集成层。这里放模型、宿主、目录边界和 MCP 等环境连接，不依赖 Persistence 或 Application。

当前实现包括 OpenAI-compatible Model、本地 Host、工作目录校验、项目上下文、本地 Skill 文件来源和 MCP Transport。这里不承载 Skill 注册生命周期或业务编排。
