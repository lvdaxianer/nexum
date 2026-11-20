# 变量与接口发现子 Skill

先读取 `GET /runtime-variables/catalog`，再读取接口清单中的指标视图和执行接口。

- 目录只提供变量语义，不提供 Token、密码或连接串。
- `REQUEST_TOKEN` 是运行时占位符，不是指标视图页面的手工输入项。页面内测试复用当前登录会话；只有页面外自动化调用才向受控请求上下文提供 `X-Trusted-Token`。每条外部 Token 的 `userId`、`domainId` 和 `pathPatterns` 独立绑定，服务端按 Token 哈希和完整路径逐条校验。Token 不透明，不能从 Token 推算 `domainId`；`REQUEST_DOMAIN_ID` 只服务于运行器兼容参数，不能作为授权来源。
- 查询已有指标视图后区分创建与更新；多候选时必须让用户选择。
