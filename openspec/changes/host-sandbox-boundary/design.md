# Design

## Context

See `proposal.md` - Why。当前 `HostPort` 只区分 read/write/shell，`ToolRequest` 的 resource 仍是路径或原始命令；本地 Host 已有路径 realpath、文件/输出大小上限和 Shell 进程组清理，但这些约束没有形成可复用的 Sandbox 边界。

## Goals / Non-Goals

**Goals:**

- 在 Core 中定义纯函数式资源归一化和风险描述，不接触文件、网络或进程。
- 让 Permission 能基于统一 risk 识别网络、凭据、重定向和危险 Shell 组合。
- 在 Integrations 提供可注入 Sandbox Host wrapper，限制动作与 ToolResult 输出，并保留取消信号。
- 保持本地 Host 的默认行为与既有错误消息、超时和清理语义。

**Non-Goals:**

- 不实现 Docker、容器、seccomp、远程 worker 或跨节点租约。
- 不在本变更新增独立 HTTP 网络工具；Shell 中的网络命令先按风险分类并进入 Permission。
- 不把风险分类当作最终安全边界；Host adapter 仍必须执行真实目录和进程约束。

## Decisions

1. **风险描述放在 Core。** `HostResourceDescriptor` 是不依赖运行环境的纯数据，避免每个 Surface 或 Adapter 各自猜测风险；Filesystem/Network 具体执行仍留在 Integrations。
2. **保留原始 resource 供执行，使用 normalized resource 供策略。** 归一化只做 trim、分隔符和空值处理，不改写要执行的命令，避免为“安全规范化”破坏 Shell 语义。
3. **Sandbox 采用装饰器而非继承本地 Host。** 通过 `createSandboxHost(host, policy)` 注入允许动作、输出限制和稳定拒绝结果，便于测试和未来替换远程 Host。
4. **高风险默认仍需 ask。** `network`、`credential`、重定向、管道到 Shell 和 destructive command 都被标记为危险；只有精确 allow 规则可以放行，延续现有权限策略。

## Risks / Trade-offs

- [Shell 语法无法完整解析] → 使用保守模式匹配并保持默认 ask；不宣称静态分析等价于沙箱。
- [新增 risk 字段被旧适配器忽略] → 字段可选，旧 `ToolRequest` 仍按 action/resource 回退判断。
- [Sandbox 输出再次裁剪] → wrapper 只做上限保护并标记截断，底层 Host 仍负责实际流读取和子进程清理。

## Migration Plan

1. 先添加 Core descriptor、风险判断和红测；旧调用方不传 risk 时回退到现有规则。
2. 接入本地工具归一化和 Sandbox wrapper，并用实际文件/Shell 测试验证。
3. 在 Application 允许注入 Sandbox Host；默认保持 `createLocalHostAdapter`。
4. 运行受影响测试、根目录 check 和 OpenSpec strict 后归档。
