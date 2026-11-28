# 样式与主题适配

[English](../../ui/theming.md)

状态：现状基线

权威来源：`packages/nexum-chat-surface/src/styles.css`、`packages/nexum-chat-surface/src/main.tsx`、`packages/nexum-test/src/main.tsx`

最后核对：2026-11-27

Nexum 的 Web 界面分两层适配：ChatSurface 组件自己负责内部布局和明暗主题，宿主页面（内部 Test Workbench 或业务项目）负责整体框架的响应式和主题覆盖。两层职责清晰，嵌入方只需要决定传什么 `theme`、用什么容器宽度。

## 1. 响应式适配

### 组件层：容器查询

ChatSurface 使用 CSS 容器查询（`container-type: inline-size`），断点跟随**组件自身宽度**而不是视口宽度。同一个组件放在宽主区、窄侧栏或手机全屏里都会得到合适的布局：

| 容器宽度    | 目标形态 | 主要行为                                                       |
| ----------- | -------- | -------------------------------------------------------------- |
| ≥ 720px     | 桌面     | 完整提示文案、宽松间距、内容最大宽度 1240px 居中               |
| 481–719px   | 平板     | 收窄内边距、缩小头像、内容不再限制最大宽度                     |
| ≤ 480px     | 手机     | 隐藏 Enter/Shift+Enter 提示、执行卡片改两行网格、输入字号 16px |
| ≤ 360px     | 极窄     | 隐藏头像和整条提示文案，隐藏宿主注入的 `extras-label` 文案     |

输入区（composer）的适配要点：

- 附件 chip 最大宽度受限，长文件名自动省略号；
- 工具栏使用 `flex-end` 对齐并允许换行，窄屏换行后「发送」始终落在右下角；
- `@` Skill 建议列表锚定在整张输入卡片正上方，不写死像素偏移。

触控设备通过 `@media (pointer: coarse)` 把所有可点目标的 `--nexum-chat-tap-min` 提升到 44px。

### 宿主层：媒体查询

参考 Surface 的页面框架使用视口媒体查询：

| 视口宽度  | 主要行为                                                     |
| --------- | ------------------------------------------------------------ |
| ≤ 1240px  | 侧边栏收窄到 264px，主区内边距减小                           |
| ≤ 980px   | 页面改为可滚动布局，会话区限高 60vh                          |
| ≤ 720px   | 侧边栏堆叠到顶部，导航变 4 列网格（图标隐藏、只留文字）      |

### 宿主注入内容的约定

宿主通过 `composerExtras` 插槽注入输入栏内容（如权限模式入口）时，给窄屏下可以隐藏的文案加 `extras-label` 类，组件会在 ≤ 360px 断点自动隐藏它：

```tsx
<button class="perm-chip">
  <span aria-hidden="true">⚡</span>
  <span class="perm-chip-label extras-label">完全访问</span>
</button>
```

## 2. 主题适配

### 组件层：主题变量组

ChatSurface 的全部颜色来自 `--nexum-chat-*` CSS 变量，根节点带 `data-theme="light"` 或 `data-theme="dark"` 时切换为内置主题变量组：

```tsx
<ChatSurface theme="dark" />           // 强制暗色
<ChatSurface theme="light" />          // 强制亮色
```

Web Component 用法对应 `theme` 属性。组件不读取系统主题，主题来源始终由宿主决定。

### 宿主层：页面框架主题

内部 Test Workbench 的页面框架使用 `html[data-theme]` 管理左侧导航、抽屉和确认框的主题；外部项目可以自行决定页面主题，但不应依赖宿主的暗色选择器来控制 ChatSurface。组件主题通过 `theme` prop 独立传递。

| 变量           | 值        | 用途                         |
| -------------- | --------- | ---------------------------- |
| `--d-bg`       | `#0f151e` | 页面底色、输入框底色         |
| `--d-panel`    | `#151c26` | 卡片、抽屉、弹层             |
| `--d-panel-2`  | `#1b2432` | 列表项、chip、次级面板       |
| `--d-border`   | `#2b3648` | 常规边框                     |
| `--d-text`     | `#e3eaf3` | 正文                         |
| `--d-muted`    | `#8e9bb0` | 辅助文案                     |
| `--d-accent`   | `#35b8b2` | 品牌色（悬停、选中、聚焦）   |
| `--d-success`  | `#4cc38a` | 成功状态                     |
| `--d-warning`  | `#dfa14e` | 警告、运行中状态             |
| `--d-danger`   | `#e36969` | 失败、危险操作               |

覆盖层只针对宿主页面实际渲染的选择器；新增宿主页面组件时需要同步补一条暗色规则。ChatSurface 自身不依赖这些 `--d-*` 变量。

### 跟随系统主题

参考 Surface 在 `main.tsx` 中通过 `prefers-color-scheme` 跟随系统并监听切换，一处信号同时驱动两层：

```ts
const [darkMode, setDarkMode] = createSignal(
  window.matchMedia("(prefers-color-scheme: dark)").matches,
)

createEffect(() => {
  document.documentElement.dataset.theme = darkMode() ? "dark" : "light"
})

// onMount 中监听 change 事件更新 darkMode

<ChatSurface theme={darkMode() ? "dark" : "light"} />
```

`html[data-theme]` 驱动宿主覆盖层（Drawer、确认框等 Portal 内容也在 `html` 之下，自动生效），`theme` prop 驱动组件变量组。

### 两个已踩过的坑

- **宿主全局表单样式泄漏**：宿主的 `textarea:focus` 等全局规则会渗进组件。组件内已用更高优先级屏蔽 composer 的 textarea 焦点样式；宿主暗色覆盖层的表单规则统一用 `:where()` 压低优先级，避免再次击穿屏蔽产生双层聚焦环。
- **弹层锚点元素被重建**：依赖响应式数据的插槽内容（如权限 chip）会整体重挂载，用 Kobalte `Popover.Anchor` 记录的元素会失效。定位锚点应使用 `Popover` 根组件的 `anchorRef` 传 signal，保证始终指向当前挂载的节点。

## 3. 自定义主题

- **固定主题**：宿主直接给 ChatSurface 传 `theme="dark"` 或 `theme="light"`；如果宿主还有自己的页面框架，再给 `html` 设置对应的 `data-theme`；
- **手动切换**：在跟随系统的基础上加一个三态（跟随系统 / 亮色 / 暗色）信号，写入同一处 `html[data-theme]`；
- **调整配色**：组件层覆盖 `--nexum-chat-*` 变量，宿主层调整 `--d-*` 变量，两边色板保持一致即可；
- **新增组件**：浅色样式照常写，暗色在覆盖层补一条 `:root[data-theme="dark"]` 规则。

## 4. 验证方式

样式改动后用三种视口 × 明暗双主题实测（Playwright `colorScheme` 模拟系统主题）：

- 手机 375×812、平板 768×1024、桌面 1440×900；
- 覆盖空态、附件 chip、聚焦态、权限弹层和抽屉。

行为回归跑内部 Test Workbench 的冒烟测试：

```bash
cd packages/nexum-test
bun run test:smoke:isolated
```
