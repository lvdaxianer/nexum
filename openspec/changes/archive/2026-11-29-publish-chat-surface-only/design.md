# Design

## Context

当前 `packages/nexum-surfaces` 同时承担完整演示工作台和公共打包入口，导致发布边界把左侧工作台一起暴露给外部项目。`ChatSurface` 已经是可由宿主组合的右侧聊天区域，但其主题类型过宽，发布编译还需要明确低版本浏览器和无构建运行时语法约束。

## Goals / Non-Goals

**Goals:**

- 让 `nexum-test` 成为完整演示平台，并通过 `@nexum/chat-surface` 组合右侧聊天区。
- 让 `nexum-ai/chat-surface` 成为唯一公共 UI 入口，连同 CSS 和类型声明可被外部项目直接导入。
- 将 ChatSurface 主题收敛为可验证的 `light`/`dark` 强制覆盖。
- 让发布 JavaScript 在构建阶段完成语法降级和 workspace 依赖内联，并用静态扫描阻止构建期运行时语法泄漏。

**Non-Goals:**

- 不改变 Protocol、Core、Server 的接口和 Session 生命周期。
- 不把 `nexum-test` 变成可安装的公共包。
- 不新增全局主题 Provider；主题只由 ChatSurface 根节点隔离控制。

## Decisions

### 1. 公共边界只保留 ChatSurface

把现有完整工作台源文件迁移到 `packages/nexum-test`，保留本地启动入口；发布脚本、manifest、验证器和文档删除 `surfaces` 公共 subpath。选择迁移而不是继续保留空壳公共入口，是为了让错误 import 在发布清单层面直接暴露。

备选方案是保留 `surfaces` 作为兼容别名，但这会继续暗示外部项目可以引入完整工作台，也无法满足“只能引入 ChatSurface”的边界，因此不采用。

### 2. 主题通过组件根节点的数据属性隔离

将 `ChatSurfaceProps.theme` 类型收敛为 `"light" | "dark"`，CSS 变量继续定义在 `.nexum-chat-surface`，深色覆盖仅命中组件根节点的 `[data-theme="dark"]`。默认主题直接使用浅色变量。这样不读写 `document.documentElement`，不会污染宿主页面，也不会被宿主的 `html[data-theme]` 规则改变变量来源。

### 3. 只为公共入口做一次低版本浏览器编译

发布构建只处理 `./chat-surface` 的 Solid 编译入口，使用固定的低版本浏览器目标生成浏览器 ESM；workspace 代码和 UI 依赖在发布包内联，`solid-js` 只按现有发布约定保留为外部运行时依赖（如当前包配置要求）。构建后对 JavaScript 做静态断言，禁止 `import.meta`、顶层 `await`、`@nexum/` workspace specifier 等构建运行时残留。

备选方案是只依赖消费者自己的 Babel/Vite 转译，这会让同一个 tarball 在不同宿主上表现不一致，因此不采用。

### 4. 内部工作台继续跟随系统主题

`nexum-test` 可以保留自身的系统主题状态，并把解析后的 `dark` 或 `light` 传给 ChatSurface。这样演示平台的体验不变，而外部项目可以显式传入固定主题。

## Risks / Trade-offs

- [Risk] 旧消费者继续导入 `nexum-ai/surfaces` 会失败 → 在迁移文档中提供 `ChatSurface` 替代方式，并让发布验证明确检查旧入口不存在。
- [Risk] 低版本语法降级增加产物体积 → 只对公共聊天入口编译，避免为内部 Demo 生成发布产物，并用 tarball 检查控制范围。
- [Risk] 宿主全局 CSS 仍可能直接覆盖组件内部具体选择器 → 组件主题变量使用根节点作用域，文档要求导入 CSS；不引入 Shadow DOM 以保持现有 light DOM 组合能力。

## Migration Plan

1. 在内部工作台迁移和公共入口收敛后，重新安装依赖并执行发布验证。
2. 发布文档将公共示例改为 `nexum-ai/chat-surface`，并标注旧 `surfaces` 入口不再提供。
3. 若需要回滚，恢复发布 manifest 中的旧入口并回退工作台迁移提交；不涉及数据迁移。
