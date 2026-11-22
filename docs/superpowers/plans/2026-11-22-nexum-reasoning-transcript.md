# Nexum Reasoning Transcript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** 将模型 reasoning 作为 Core/Protocol 的标准增量事件输出，并让 UI 在持续向下滚动的 transcript 中实时展示 reasoning、工具事件和最终回答，而不是把思考过程放进卡片或最终正文。

**Architecture:** Core 保持现有 `assistant.thinking` 心跳与 `assistant.reasoning` 增量语义；Protocol 提供事件名称和 reasoning 数据的公开类型；Server 复用 Protocol 事件清单；Surface 将 reasoning 投影为独立 ChatItem，使用事件顺序和 `runID` 合并增量，并保留 SSE 去重与底部跟随。

**Tech Stack:** Bun, TypeScript, SolidJS, Playwright, Nexum Core/Protocol/Server。

---

## Task 1: 建立 Protocol 标准事件并收敛 Server 清单

**Files:**
- Modify: `packages/nexum-protocol/src/index.ts`
- Modify: `packages/nexum-protocol/test/protocol.test.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Modify: `packages/nexum-server/test/protocol-v1.test.ts`
- Modify: `packages/nexum-server/package.json`（如运行时导入 Protocol 常量需要声明依赖）

### Step 1: 写失败测试（RED）

- 在协议测试中断言 `NEXUM_EVENT_TYPES` 包含 `assistant.thinking`、`assistant.reasoning`、`assistant.text`。
- 构造一个 `assistant.reasoning` 事件，断言公开 data 形状为 `{ content: string }`。
- 在 Server 协议测试中断言 capabilities 返回的事件清单来自同一标准并包含 reasoning 事件。
- 运行：
  `cd packages/nexum-protocol && bun test`
  `cd ../nexum-server && bun test -- protocol-v1.test.ts`
- 预期：因常量/类型尚未导出而失败。

### Step 2: 实现最小改动（GREEN）

- 将当前 Server 事件清单提升为 Protocol 的 `NEXUM_EVENT_TYPES`，由其推导 `NexumEventType`。
- 导出 reasoning、thinking、assistant text 的数据类型，不改变 SSE envelope 字段和旧客户端兼容行为。
- 让 Server 直接导入 Protocol 清单并删除重复定义，补齐 package runtime dependency。

### Step 3: 验证

- 运行协议和 Server 包测试；再运行 `bun run typecheck:tsc`（如包提供）确认类型边界成立。
- Commit: `✨ feat(protocol): 标准化 reasoning 事件契约`

## Task 2: 固化 Core reasoning 顺序语义

**Files:**
- Modify: `packages/nexum-core/test/coding-loop.test.ts`
- Modify: `packages/nexum-core/src/index.ts`（仅在测试暴露出缺口时修改）

### Step 1: 写失败测试（RED）

- 增加包含 reasoning、tool-call、text 的真实 stream fixture。
- 断言事件顺序保持 reasoning → tool.request/tool.result → text，reasoning 不混入 assistant.text，且没有 provider reasoning 时不生成正文。
- 运行：`cd packages/nexum-core && bun test test/coding-loop.test.ts`。

### Step 2: 实现与验证（GREEN）

- 只修复被测试证明的边界，不引入第二条内存 tool loop、不增加 reasoning 表或伪造结束事件。
- 运行：`cd packages/nexum-core && bun test`。
- Commit: `✅ test(core): 锁定 reasoning 事件顺序`

## Task 3: 将 UI 改为连续 reasoning transcript

**Files:**
- Modify: `packages/nexum-surfaces/src/main.tsx`
- Modify: `packages/nexum-surfaces/test/permission.smoke.spec.ts`

### Step 1: 写失败 smoke（RED）

- 将旧“思考卡片仍存在”的断言改为：事件流出现 reasoning 后，页面显示独立 reasoning 文本；随后出现 assistant.text 时 reasoning 仍存在，最终正文不包含 reasoning；连续 delta 合并为一个段。
- 覆盖重连/replay 不重复，以及用户滚动离开底部时不被强制拉回。
- 运行定向 Playwright smoke，确认当前卡片实现失败。

### Step 2: 实现（GREEN）

- `ChatItemKind` 增加 `reasoning`，reasoning 条目带 `runID` 或等价稳定关联字段。
- `assistant.reasoning` 只追加到当前打开的 reasoning 段；下一条工具、assistant.text、终态事件关闭该段。
- `assistant.thinking` 只作为没有正文时的轻量状态行；不把 heartbeat 作为 reasoning 正文。
- 保持现有 eventID 去重、`maxChatItems` 和 follow-tail 行为。
- 将思考卡片替换为连续 transcript 行、弱化文字、左侧细线和实时光标。

### Step 3: 验证

- 运行定向 UI smoke、`cd packages/nexum-surfaces && bun run typecheck:tsc`（如脚本存在），再运行 UI package 的完整测试。
- Commit: `🎨 feat(surfaces): 实时展示 reasoning transcript`

## Task 4: 集成与交付

**Files:**
- Modify: `openspec/changes/nexum-reasoning-transcript/tasks.md`
- Possibly modify: generated/package metadata only if verification requires it

### Step 1: 全量验证

- 运行 `openspec validate --strict --change nexum-reasoning-transcript`。
- 在任务 worktree 运行协议、Core、Server 测试、Surface typecheck/UI smoke，以及根目录 `bun run check`。
- 检查 `git diff --check`、`git status --short` 和依赖方向。

### Step 2: 审查与合并

- 完成代码审查、`task-closeout-audit` 需要的审计项，勾选任务清单。
- 将任务分支合并至 `dev-v0.0.1`，不覆盖用户已有未跟踪文件。
- OpenSpec verify 后 archive change，最后确认集成分支干净（用户原有文件恢复原位）。
