# @nexum/test

`@nexum/test` 是 Nexum 的跨层验证包和可启动 Test Workbench。它不是生产运行时，也不是一套写死的业务 Demo；它用真实的 Core、默认 Adapter、Protocol、Client 和 Surface 跑通一条完整链路。

## 它验证什么

- Core 的 Coding Loop、Session、工具、权限、Question、Skill 和上下文语义；
- Adapter 的模型、Host、SQLite Store、Event、Memory 和 Runtime 组合；
- Protocol Envelope、能力发现、HTTP/SSE 事件和错误边界；
- Client 的请求、响应和 SSE 消费；
- Surface 对聊天、事件、权限、反问、运行状态和 Session 恢复的展示。

## 持久化约束

Test Workbench 使用 `createSqliteRuntime`，默认数据库为当前包下的 `.nexum-test/nexum.db`。真实 POC 不使用内存 Store：

```text
.nexum-test/
└── nexum.db
```

这个数据库属于本地运行数据，已经加入 Git 忽略规则，不应提交到仓库。重启服务后，Session、消息、事件和交互状态仍然可以从同一数据库恢复。内存实现只用于 Core 单元测试或显式的嵌入式组合。

## 启动 Workbench

```bash
bun run --cwd packages/nexum-test dev
```

然后打开 <http://127.0.0.1:5173>。

页面可以验证：

1. 创建和恢复 Session；
2. 配置全局模型和执行目录；
3. 提交长任务 Prompt；
4. 观察文本、工具、权限、Question、Skill、上下文和终态事件；
5. 刷新页面或重启 Server 后恢复历史。

## 自动化验证

```bash
bun test
bun run typecheck:tsc
```

其中 `test/persistent-poc.test.ts` 会使用临时 `.nexum-test` 数据目录，执行一次 Protocol/Client/Runtime 链路，关闭 Runtime，再用相同数据库重新打开并验证 Session、模型配置、权限策略、Memory、Interaction、消息和事件的恢复。
