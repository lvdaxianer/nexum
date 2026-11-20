# 内部演示 Agent 工作台设计

## 背景

现有 `packages/headless-ui` 已经接通 Headless API，能够展示模型配置、Session、事件流、权限、Question、上下文压缩和 Skill，但视觉呈现更像技术概念页。内部演示需要让观众先看懂“当前运行什么、哪里需要人处理、Core 提供了什么能力”。

## 设计方向

采用“企业级 Agent 工作台”方向：浅灰中性背景、白色内容卡片、深色文字和蓝青色状态色，减少装饰性 Hero，把运行状态和操作入口放在首屏。布局使用左侧导航/配置、中间 Coding Loop、右侧运行状态三段式结构。

## 页面组成

- 顶部运行栏：项目名称、API 连接、模型、当前 Session 状态。
- 左侧工作区：项目目录、Session 列表、模型配置、Skill 刷新入口。
- 中间工作区：对话流、工具调用、事件时间线和 Prompt 编辑器。
- 右侧状态栏：Permission、Question、Context Compaction、Skill 和连接状态。
- 空状态：解释当前状态，并给出“配置模型”“选择目录”“创建 Session”等下一步。

## 交互约束

- 所有状态变更按钮在请求期间禁用，返回成功后再更新显示状态。
- 权限和 Question 必须显式处理，拒绝或取消要保留可追踪结果。
- SSE 断开时保留已有事件，不清空输入，并提供重连入口。
- 主要状态同时使用文本、图标和颜色表达；键盘焦点必须可见。
- 窄屏按导航、主工作区、状态区顺序堆叠，Prompt 输入不被遮挡。

## 验收

```bash
bun run --cwd packages/headless-ui typecheck:tsc
bun run --cwd packages/headless-ui build
bun run --cwd packages/headless-ui test:smoke
```

浏览器中还要检查：无 API 空状态、模型配置、创建 Session、Function Calling、Permission、Question、Context Compaction、Skill 和窄屏布局。
