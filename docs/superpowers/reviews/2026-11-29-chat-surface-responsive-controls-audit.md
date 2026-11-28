# ChatSurface 响应式控件布局审计

## 范围

- `ChatSurface.showHeader` 默认显示，Solid 属性与 Web Component 的 `show-header` 属性均支持关闭标题栏。
- Composer 采用信息行与操作行语义分组；窄容器允许操作区自然换行，不隐藏上传、宿主扩展、取消和发送控件。

## 自动化验证

- `bun test --cwd packages/nexum-chat-surface`：26 pass，0 fail。
- `bun run --cwd packages/nexum-chat-surface typecheck`：通过。
- `bun run check`：lint 与 14 个 package typecheck 全部通过。
- `openspec validate 'chat-surface-responsive-controls' --type change --strict`：通过。
- `git diff --check`：通过。

## 浏览器验证

使用 `packages/nexum-test` 示例页，通过 Playwright 检查 720、480、360 CSS px 宽度：

- 720：信息行与操作行可并排，发送按钮因操作空间不足换到操作行的下一视觉行。
- 480：信息行独占一行，上传、宿主扩展和发送控件位于下一行。
- 360：操作行继续自然换行，所有操作仍在组件内容区内。
- 三种宽度下 composer 与操作区 `scrollWidth === clientWidth`，没有横向溢出或裁切。

## 交互审查结论

- 核心动作未被折叠到菜单或通过 CSS 隐藏。
- 既有 disabled、busy、取消确认和发送事件条件保持不变。
- `showHeader` 只影响组件自带标题栏，不影响消息、输入框和底部操作。
- 未发现本次改动范围内的发布边界、依赖方向或敏感信息问题。
