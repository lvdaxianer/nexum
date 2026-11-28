# Design

## Context

参见 `proposal.md` 的 Why。当前 `packages/nexum-surfaces/src/main.tsx` 同时承担工作台组件、CSS 导入和本地 Vite 根节点启动；发布构建通过显式 `publicEntries` 枚举模块，因此未覆盖 `nexum-surfaces`。现有发布模型是单一 `nexum-ai` 包、多入口 JavaScript/声明文件和独立 CSS subpath。

## Goals / Non-Goals

**Goals:**

- 让 `nexum-surfaces` 以无导入副作用的 Solid 组件形式公开。
- 保持 `bun run dev:surface` 和现有 Vite 页面启动方式不变。
- 为组件提供可选 API 基地址，避免宿主只能依赖构建时环境变量。
- 在同一个发布 tarball 中生成 `surfaces.js`、`surfaces.d.ts` 和聚合后的 `surfaces.css`。
- 让构建验证覆盖除 `nexum-test` 外的全部 `packages/nexum-*` 公共模块。

**Non-Goals:**

- 不把 `nexum-test` 或测试夹具发布到 tarball。
- 不把 `nexum-surfaces` 拆成第二个 npm 包。
- 不改变 Core、Protocol、Server 或现有 Chat Surface 的业务协议。
- 不把独立 HTML 页面作为用户导入入口；本次公共契约是组件和 CSS import。

## Decisions

### 1. 将组件和启动入口分离

`main.tsx` 保留工作台实现并导出 `NexumSurfaces`，删除模块加载时的 `render` 和 DOM 根节点检查；新增轻量 `entry.tsx`，只负责导入两套 CSS、查找本地 `#root` 并渲染组件。`src/index.ts` 只 re-export 组件和公开类型。

这样可以满足导入无副作用，同时不破坏本地 Vite 页面。相比在公共入口中保留条件式自动渲染，显式启动入口的行为更可预测，也避免宿主页面被组件抢占。

### 2. API 地址作为组件属性注入

`NexumSurfaces` 接受可选 `apiBaseUrl`，组件实例内部创建对应的 Client，并将同一地址传给 ChatSurface 和权限策略请求。未提供时沿用 `VITE_NEXUM_API_URL` 或当前页面主机 `4097` 端口的默认值。

相比继续使用模块级单例，这能让同一页面挂载不同 API 环境，也让外部项目无需重新构建组件即可指定 Server；相比要求宿主传入完整 Client，属性契约更小，且不暴露内部 SDK 组合细节。

### 3. 统一包增加 `surfaces` JavaScript/CSS subpath

在 `publicEntries` 增加 `./surfaces`，使用 `src/index.ts` 生成 `dist/surfaces.js` 和声明文件；把 Surface 自身 CSS 与 Chat Surface CSS 按稳定顺序写入 `dist/surfaces.css`，manifest 增加 `./surfaces/styles.css` export。

Bun 构建继续将内部 workspace 依赖打进单一产物，保留 `solid-js` 等运行时依赖为外部依赖；这样 consumer 不需要安装 `@nexum/*` workspace 包，且 CSS 仍可由宿主显式控制加载。

### 4. 验证沿用发布 consumer，不新增第二套发布流程

扩展现有 `verify:nexum`：检查 `surfaces` JS/声明/CSS，临时 consumer 导入组件入口和样式，并执行 TypeScript 检查。文档审计同步检查 `surfaces` 的 subpath，避免 manifest、模块索引和示例漂移。

相比另建 `@nexum/surfaces` 包，这保持当前“一个包多个 subpath”的发布契约；相比只检查文件存在，consumer import 能捕获 exports、运行时依赖和类型声明的真实问题。

## Risks / Trade-offs

- [Risk] 工作台当前状态量和请求逻辑集中在一个较大的组件文件中，注入 API 地址可能触及多处调用 → Mitigation：只替换共享 Client/请求基地址边界，保持交互逻辑不重写，并用现有 typecheck/build 与 consumer 验证覆盖。
- [Risk] 聚合 CSS 可能导致宿主页面引入全局样式 → Mitigation：保持显式 `styles.css` import，不把 CSS 隐式注入 JavaScript；文档明确其为完整工作台样式入口。
- [Risk] 现有未提交 UI 修改与 `main.tsx` 改造存在合并冲突 → Mitigation：任务在独立 worktree 中完成，集成前先验证原工作树仍可恢复，并在合并后恢复 stash。
- [Risk] `@kobalte/core` 的浏览器实现可能随 bundle 方式变化 → Mitigation：将其作为编译期依赖打入 `surfaces.js`，由仓库外 consumer import smoke 和类型检查验证。

## Migration Plan

1. 在任务 worktree 中先增加 public-entry/consumer 失败测试，再拆分组件和启动入口。
2. 生成并验证 `nexum-ai/surfaces` 产物，更新中英文模块文档和 OpenSpec 任务状态。
3. 按仓库检查流程运行 focused typecheck/build、发布构建、tarball 和仓库外 consumer 验证，再运行根级 `bun run check`。
4. 通过审查后提交任务分支并以 `--no-ff` 合并到 `dev-v0.0.1`；若集成冲突，只处理本次公共入口相关冲突，不覆盖用户 stash。
5. 合并成功后恢复用户原有 stash，确认其 3 个修改仍在且不属于本次提交。
