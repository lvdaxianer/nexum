# Host/Sandbox Boundary 审查记录

## 交付范围

- Core 新增 `NexumHostResourceDescriptor`，对 action/resource 做稳定归一化并分类为 filesystem、shell、network、credential 或 unknown。
- `ToolRequest` 携带可选 risk；Permission 对 network、credential、网络客户端、重定向和嵌套 Shell 保守按危险操作处理，保持精确 allow 才能放行。
- Integrations 新增 `createSandboxHost`，支持动作 allowlist、输出大小上限和稳定拒绝结果；Local Host 仍负责 realpath、符号链接、进程组终止、超时和取消清理。
- Application 的工具注册支持注入 Sandbox policy，默认行为保持本地开发可用。

## 验收证据

- Core：161 tests pass，包含 Host risk、Permission、工具路径和既有运行生命周期。
- Integrations：12 tests pass，包含 Sandbox wrapper、Shell 超时/取消、输出限制和符号链接越界。
- Application：17 tests pass，包含 Sandbox 注入、MCP、Runtime 和 Local Host 组合。
- 根目录 `bun run check` pass；OpenSpec strict pass；`git diff --check` pass。

## 安全边界

本变更不宣称 Shell 静态模式匹配等价于容器沙箱，不引入 Docker 或远程执行。风险分类只负责统一进入 Permission 的语义；Local Host 和未来的真实 Sandbox 仍必须执行实际资源隔离。
