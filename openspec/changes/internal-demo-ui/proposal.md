# Proposal

## Why

当前 `packages/headless-ui` 已经能验证 Headless Core 的核心能力，但视觉结构更像技术概念页，内部演示时无法让观众快速理解运行状态、待处理动作和 Core 能力边界。现在需要把它升级为中文优先的企业级 Agent 工作台，让同一页面既能演示 Coding Loop，也能清晰展示权限、Question、上下文压缩、Skill 和事件流。

## What Changes

- 重做 `packages/headless-ui` 的页面布局，采用左侧导航、中间工作区、右侧运行状态的工作台结构。
- 将模型配置、项目/Session、Prompt、事件时间线和能力状态组织成明确的演示路径。
- 增强 Permission、Question、Context Compaction、Skill 和连接状态的可见反馈。
- 统一 loading、success、error、empty、cancelled 和 reconnecting 状态，避免演示时出现无反馈或重复提交。
- 以中文为主重写页面文案，保留协议字段、事件类型和必要的技术标识。
- 保留现有 Headless API 接入，不修改 Core、Server 和 Protocol 的业务契约。
- 补充页面冒烟测试和内部演示 UI 的 README 说明。

## Capabilities

### New Capabilities

- `internal-demo-ui`: 提供面向内部演示的 Headless Core 工作台，包括 Session 控制、Coding Loop、权限/Question 队列、Skill 状态和上下文运行状态展示。

### Modified Capabilities

无。

## Impact

- 影响 `packages/headless-ui/src/main.tsx`、`packages/headless-ui/src/styles.css` 和页面测试。
- 可能补充 UI 局部组件文件，但不新增运行时服务或外部依赖。
- 复用现有 `@opencode/client` 和 Headless API；不新增 API 路由，不修改 Core 运行逻辑。
- 需要通过 Vite 构建、TypeScript 检查、Playwright 冒烟测试和人工浏览器预览。
