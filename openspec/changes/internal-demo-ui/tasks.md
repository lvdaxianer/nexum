# Internal Demo UI Tasks

## 1. 工作台结构与视觉

- [x] 1.1 重做 `packages/headless-ui` 页面结构，建立顶部运行栏、左侧配置/导航、中间 Coding Loop、右侧能力状态布局；验证：桌面和窄屏布局可用
- [x] 1.2 将页面文案调整为中文优先，统一颜色、间距、状态标签、空状态和错误反馈；验证：页面无大 Hero 空白区，核心操作首屏可见

## 2. Core 能力交互

- [x] 2.1 保留并整理 Model、Session、Prompt、SSE 事件流和取消操作；验证：现有 Session smoke 流程继续通过
- [x] 2.2 强化 Permission、Question、Context Compaction、Skill 和连接状态展示；验证：关键状态均有文本反馈、busy 防重复和失败恢复

## 3. 验证与交付

- [x] 3.1 补充或调整 Playwright smoke 断言，覆盖中文主路径、能力状态和窄屏关键元素；验证：`bun run --cwd packages/headless-ui test:smoke`
- [x] 3.2 完成类型检查、构建、浏览器预览、代码审查和文档更新，提交并合并回 `dev-v0.0.1`；验证：主工作区干净且任务分支已合并
