# Contributing to Nexum

Nexum 的变更应保持 Core、Persistence、Integrations、Application、Protocol、Server、Surface 和 Test 的依赖方向清晰。新增能力先确认它属于运行语义、持久化、外部集成、应用编排、公开协议还是具体交互 Surface，再选择对应包。

## Development

Nexum 使用 `packageManager` 中声明的 Bun 版本或更高版本。从仓库根目录运行：

```bash
bun install
bun dev
```

`bun dev` 启动 `@nexum/test` 的 Server 和 Web Surface。需要单独启动前端时运行 `bun run dev:surface`。

## Packages

- `packages/nexum-core`：领域语义、端口和生命周期
- `packages/nexum-persistence`：文件/内存持久化实现
- `packages/nexum-integrations`：模型、Host、目录和 MCP 外部集成
- `packages/nexum-application`：Skill、Tool、Question 和 Runtime 组合
- `packages/nexum-protocol`：公开协议模型和事件契约
- `packages/nexum-client`：HTTP/SSE 协议客户端
- `packages/nexum-server`：HTTP/SSE 服务绑定
- `packages/nexum-test`：内部 Web Test Workbench；可复用聊天区位于 `packages/nexum-chat-surface`
- `packages/nexum-test`：跨层测试与本地工作台

## Verification

测试从受影响包目录执行，不从根目录运行测试。完整检查使用：

```bash
bun run check
```

修改 HTTP 或协议边界时，同时更新 `apis/nexum.md` 和对应 Protocol/Server/Client 测试。遵守仓库根目录 `AGENTS.md` 中的工作流、分支和提交规范。
