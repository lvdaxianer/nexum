# `@nexum/test`

状态：现状基线

权威来源：[`packages/nexum-test/README.md`](../../packages/nexum-test/README.md)、[`packages/nexum-test/src/dev.ts`](../../packages/nexum-test/src/dev.ts)

最后核对：2026-11-24

## 职责

`@nexum/test` 是 Nexum 的内部跨层验证包和可启动 Test Workbench。它不是生产 Runtime，也不是写死业务 Demo；它用真实 Core、Application、Protocol、Client、Server 和 Surface 跑通一条完整链路。

## Workbench 接入

开发入口 [`src/dev.ts`](../../packages/nexum-test/src/dev.ts) 创建 `createLocalRuntime`，启动 `@nexum/server`，再拉起 `@nexum/surfaces` Vite 开发服务。默认数据目录为 `packages/nexum-test/.nexum-test/`，也可用 `NEXUM_TEST_DATA_DIR` 覆盖。

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

[`test/persistent-poc.test.ts`](../../packages/nexum-test/test/persistent-poc.test.ts) 使用真实 Protocol/Client/Runtime 链路，关闭 Server 和 Runtime 后用同一数据目录重新打开，验证 Session、模型配置、Memory、Permission Policy、Interaction、Message 和 Event 恢复。临时目录由测试创建并清理，运行数据不应提交。

## 依赖与边界

Test 包可以依赖生产层和 UI 组合，用于验收跨层契约；生产包不能反向依赖它。它与 [`docs/ui/interaction-protocol.md`](../ui/interaction-protocol.md)、[`docs/capabilities/session.md`](../capabilities/session.md) 和 [`docs/capabilities/events.md`](../capabilities/events.md) 一起作为端到端行为入口。

## 测试与验证

```sh
cd packages/nexum-test
bun test
bun run typecheck:tsc
```

包级边界测试见 [`test/repository-boundary.test.ts`](../../packages/nexum-test/test/repository-boundary.test.ts)；持久化跨层测试见 [`test/persistent-poc.test.ts`](../../packages/nexum-test/test/persistent-poc.test.ts)。

## 修改同步清单

- 修改跨层 Protocol/Client/Server 行为：更新 [`apis/nexum.md`](../../apis/nexum.md) 和 POC 断言。
- 修改 Runtime 数据文件或恢复规则：同步 [`@nexum/persistence`](./nexum-persistence.md)、Session/Events 文档和持久化 POC。
- 修改 Surface 启动入口或端口：同步 [`@nexum/surfaces`](./nexum-surfaces.md) 与 Workbench 启动说明。
