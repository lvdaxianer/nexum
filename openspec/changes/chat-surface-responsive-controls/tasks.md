# Tasks

## 1. 公共配置契约

- [x] 1.1 在 `packages/nexum-chat-surface/test/theme-contract.test.ts` 增加 `showHeader` 默认行为、显式关闭和无标题场景的失败测试，并运行 `bun test --cwd packages/nexum-chat-surface test/theme-contract.test.ts` 确认测试因契约尚未实现而失败。
- [x] 1.2 在 `packages/nexum-chat-surface/test/web-component-contract.test.ts` 增加 `show-header` 观察属性和 false 值映射测试，并运行该测试确认属性契约先失败。
- [x] 1.3 修改 `packages/nexum-chat-surface/src/chat-surface.tsx`，增加 `showHeader?: boolean` 并让标题渲染同时受标题和 `showHeader !== false` 控制；修改 `src/web-component.tsx` 解析 `show-header` 并传递给 ChatSurface，运行两个契约测试确认通过。
- [x] 1.4 更新 `packages/nexum-chat-surface/README.md`，补充 Solid `showHeader={false}` 与 Web Component `show-header="false"` 示例，并运行 README 示例中的 import 路径检查。

## 2. 窄容器两行布局

- [x] 2.1 在 `packages/nexum-chat-surface/test/responsive-contract.test.ts` 增加失败的源码契约测试，要求 composer 具备信息行/操作行语义类名、窄容器 container query、操作区换行规则和无横向裁切规则；运行该测试确认先失败。
- [x] 2.2 修改 `packages/nexum-chat-surface/src/chat-surface.tsx`，将模型/快捷键提示与上传、宿主扩展、取消、发送控件分别包入稳定的语义行容器，不改变现有事件处理和 disabled/busy 条件；运行响应式契约测试确认 DOM 契约通过。
- [x] 2.3 修改 `packages/nexum-chat-surface/src/styles.css`，为宽容器保留紧凑单行布局，为窄容器切换为信息行 + 操作行并允许操作行换行，确保按钮保留最小触控高度、自然宽度和可见焦点；运行响应式契约测试确认 CSS 契约通过。

## 3. 综合验证与交付

- [x] 3.1 运行 `bun test --cwd packages/nexum-chat-surface` 和 `bun run --cwd packages/nexum-chat-surface typecheck`，确认公共组件测试和类型检查均通过。
- [x] 3.2 运行 `bun run check`，检查组件改动未破坏仓库级 lint/typecheck；若检查发现与本变更无关的既有问题，记录完整输出并区分范围。
- [x] 3.3 使用现有示例验证宽容器、约 480px 和约 360px 容器：确认 `showHeader` 能隐藏顶部栏，底部上传、宿主扩展和发送控件均可见且不产生横向溢出；将验证结果写入任务审计记录。

## Workflow follow-up

- 通过 code-review-spec、frontend-interaction-guidelines 和 verification-before-completion 审查后，完成 OpenSpec 任务标记和归档。
- 将任务分支合并回 `dev-v0.0.1`，确认集成分支包含全部变更并推送远端。
