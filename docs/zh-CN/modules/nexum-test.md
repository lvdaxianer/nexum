# `@nexum/test`

[English](../../modules/nexum-test.md)

状态：现状基线

权威来源：[`packages/nexum-test/README.md`](../../../packages/nexum-test/README.md)、[`packages/nexum-test/src/dev.ts`](../../../packages/nexum-test/src/dev.ts)

最后核对：2026-11-24

## 职责

`@nexum/test` 是 Nexum 的内部跨层验证包和完整 Test Workbench。它不是生产 Runtime，也不是公共 UI 包；左侧导航、Session、模型、Skill、权限和 MCP 管理都在这里，右侧聊天区通过 `import { ChatSurface } from "@nexum/chat-surface"` 引入。

外部项目只应安装 `nexum-ai` 并导入 `nexum-ai/chat-surface`，完整工作台不再发布为 `nexum-ai/surfaces`。

## Workbench 接入

开发入口 [`src/dev.ts`](../../../packages/nexum-test/src/dev.ts) 启动 `@nexum/server`，再拉起同一包内的 Vite Workbench；Workbench 通过 `@nexum/chat-surface` 组合右侧聊天区。默认数据目录为 `packages/nexum-test/.nexum-test/`，也可用 `NEXUM_TEST_DATA_DIR` 覆盖。

```sh
bun run --cwd packages/nexum-test dev
```

打开 `http://127.0.0.1:5173` 后，可验证 Session 创建/恢复、模型和执行目录配置、Prompt、文本/工具/Permission/Question/Skill/Context 事件、终态以及刷新或重启后的历史恢复。

## 持久化 POC

Test Workbench 使用文件型 Runtime，目录包含：

```text
.nexum-test/
├── sessions.json       ├── messages.json
├── interactions.json   ├── model-config.json
├── permission-policies.json
├── events.json         └── memory.json
```

[`test/persistent-poc.test.ts`](../../../packages/nexum-test/test/persistent-poc.test.ts) 使用真实 Protocol/Client/Runtime 链路，关闭 Server 和 Runtime 后用同一数据目录重新打开，验证 Session、模型配置、Memory、Permission Policy、Interaction、Message 和 Event 恢复。临时目录由测试创建并清理，运行数据不应提交。

## 依赖与边界

Test 包可以依赖生产层和 UI 组合，用于验收跨层契约；生产包不能反向依赖它。它与 [`docs/ui/interaction-protocol.md`](../ui/interaction-protocol.md)、[`docs/capabilities/session.md`](../capabilities/session.md) 和 [`docs/capabilities/events.md`](../capabilities/events.md) 一起作为端到端行为入口。

## 测试与验证

```sh
cd packages/nexum-test
bun test
bun run typecheck:tsc
```

包级边界测试见 [`test/repository-boundary.test.ts`](../../../packages/nexum-test/test/repository-boundary.test.ts)；持久化跨层测试见 [`test/persistent-poc.test.ts`](../../../packages/nexum-test/test/persistent-poc.test.ts)。

## 修改同步清单

- 修改跨层 Protocol/Client/Server 行为：更新 [`apis/nexum.md`](../../../apis/zh-CN/nexum.md) 和 POC 断言。
- 修改 Runtime 数据文件或恢复规则：同步 [`@nexum/persistence`](./nexum-persistence.md)、Session/Events 文档和持久化 POC。
- 修改 Workbench 启动入口或端口：同步本页与 [`packages/nexum-test`](../../../packages/nexum-test/README.md) 的启动说明。
