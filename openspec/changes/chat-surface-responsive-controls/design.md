# Design

## 方案概览

在 ChatSurface 的公共 Solid props 上增加 `showHeader?: boolean`，组件内部使用 `props.showHeader !== false` 判断是否渲染标题栏。Web Component 通过观察 `show-header` 属性，将字符串 `false` 转换为布尔值，其余情况保持默认显示。

输入栏不改变请求和状态逻辑，只调整 DOM 语义分组和 CSS。将模型/快捷键提示归入信息行，将上传、宿主 `composerExtras`、取消和发送归入操作行。桌面宽容器使用同一行视觉布局；根节点的 container query 在窄容器下切换为两行，操作行使用可换行 flex 布局，按钮保持最小触控高度和自然宽度。

## 文件边界

- `packages/nexum-chat-surface/src/chat-surface.tsx`：公开 `showHeader` 类型并调整标题条件与 composer 语义分组。
- `packages/nexum-chat-surface/src/web-component.tsx`：解析 `show-header` 属性并传给 Solid 组件。
- `packages/nexum-chat-surface/src/styles.css`：增加信息行、操作行和窄容器布局规则，避免文字和按钮溢出。
- `packages/nexum-chat-surface/README.md`：增加 Solid 与 Web Component 配置示例和窄容器说明。
- `packages/nexum-chat-surface/test/theme-contract.test.ts` 或新增契约测试：验证 `showHeader` 默认行为和显式隐藏行为。
- `packages/nexum-chat-surface/test/web-component-contract.test.ts`：验证 `show-header="false"` 的属性映射。

## 数据与交互流

1. Solid 宿主传入 `showHeader`，ChatSurface 在渲染边界决定是否输出 header。
2. Web Component 在创建内部 Solid View 时读取 `show-header`，属性变化时更新同一 Signal，不重新创建协议适配器或 Session。
3. 用户输入、上传、发送、取消和宿主注入控件继续使用现有事件处理函数。
4. CSS 只改变排列方式；按钮的 disabled、busy、错误和确认状态保持原有逻辑。

## 兼容性与风险

- 新 prop 是可选项，默认值保持现状，不影响已有 Solid 调用方。
- 新 Web Component 属性也是可选项，未传时维持原标题行为。
- 不使用视口媒体查询，避免组件嵌入宿主侧栏时响应错误；使用组件根节点 container query。
- `composerExtras` 可能包含多个控件，操作行必须允许其整体继续换行，不能依赖固定宽度。
- 不修改请求协议、事件订阅、主题变量、构建目标和 public exports。

## 验证策略

- 先为 prop 和 Web Component 属性写失败的契约测试，确认测试确实覆盖缺失行为。
- 实现最小改动后运行 ChatSurface 包测试和类型检查。
- 检查宽容器、约 480px、约 360px 容器的 DOM/CSS 规则，确认操作控件没有 `display:none`、横向滚动依赖或固定溢出。
- 使用 README 示例确认宿主可以通过 import 引入 Solid 组件或注册 Web Component。
