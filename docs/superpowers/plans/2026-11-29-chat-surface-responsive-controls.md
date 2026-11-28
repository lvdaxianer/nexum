# ChatSurface 响应式控件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为独立 ChatSurface 增加默认显示、可隐藏的顶部栏配置，并让窄容器中的输入操作以两行布局保持完整可用。

**Architecture:** Solid 组件 API 通过 `showHeader?: boolean` 控制标题栏；Web Component 通过 `show-header` 属性映射同一配置。Composer 将提示信息与操作控件分成两个语义容器，宽容器维持紧凑排列，窄容器通过根节点 container query 换成两行并允许操作区继续换行。协议适配器、Session 生命周期和已有操作处理函数不变。

**Tech Stack:** Solid JSX、TypeScript、CSS Container Queries、Bun Test、TypeScript。

---

### Task 1: 增加顶部栏公共配置契约

**Files:**
- Modify: `packages/nexum-chat-surface/test/theme-contract.test.ts`
- Modify: `packages/nexum-chat-surface/test/web-component-contract.test.ts`
- Modify: `packages/nexum-chat-surface/src/chat-surface.tsx`
- Modify: `packages/nexum-chat-surface/src/web-component.tsx`
- Modify: `packages/nexum-chat-surface/README.md`

- [ ] **Step 1: Write the failing tests**

  在 `theme-contract.test.ts` 增加以下行为断言：源码导出 `showHeader?: boolean`；标题渲染包含 `showHeader !== false`；未传参数保持默认显示语义；显式 false 可以隐藏标题。将 `web-component-contract.test.ts` 的 observed attributes 期望扩展为 `show-header`，并增加属性值 `false` 的映射断言。

- [ ] **Step 2: Run tests to verify they fail**

  Run: `bun test --cwd packages/nexum-chat-surface test/theme-contract.test.ts test/web-component-contract.test.ts`

  Expected: FAIL because `showHeader` and `show-header` are not yet part of the current source contract.

- [ ] **Step 3: Implement the minimal public API**

  在 `ChatSurfaceProps` 增加：

  ```ts
  /** 是否显示组件自带的标题栏，默认显示。 */
  readonly showHeader?: boolean
  ```

  将标题条件改为：

  ```tsx
  <Show when={props.showHeader !== false && props.title}>
  ```

  在 Web Component 的属性列表加入 `show-header`，使用一个 boolean signal 解析 `this.getAttribute("show-header") !== "false"`，并将 signal 传入 `ChatSurface`。保持属性变化更新，不重建 adapter。

- [ ] **Step 4: Run tests to verify they pass**

  Run: `bun test --cwd packages/nexum-chat-surface test/theme-contract.test.ts test/web-component-contract.test.ts`

  Expected: PASS with the default, explicit false, missing title, observed attribute, and Web Component mapping assertions green.

- [ ] **Step 5: Document the public configuration**

  在 `packages/nexum-chat-surface/README.md` 的 Solid 示例和 Web Component 段落中加入 `showHeader={false}` 与 `show-header="false"`，说明默认显示且只隐藏顶部标题栏。

- [ ] **Step 6: Verify documentation paths**

  Run: `rg -n "showHeader|show-header|ChatSurface" packages/nexum-chat-surface/README.md`

  Expected: README contains both import examples and both configuration forms without changing the public package entrypoint.

### Task 2: Implement the two-row composer layout

**Files:**
- Create: `packages/nexum-chat-surface/test/responsive-contract.test.ts`
- Modify: `packages/nexum-chat-surface/src/chat-surface.tsx`
- Modify: `packages/nexum-chat-surface/src/styles.css`

- [ ] **Step 1: Write the failing responsive contract test**

  Add a source contract test that reads `src/chat-surface.tsx` and `src/styles.css`, asserting the composer contains stable information/action row class names, the root uses container queries, the compact query enables wrapping, and no compact rule hides the upload or primary send controls.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `bun test --cwd packages/nexum-chat-surface test/responsive-contract.test.ts`

  Expected: FAIL because the new row class names and compact layout rules do not exist yet.

- [ ] **Step 3: Split composer markup without changing behavior**

  Wrap model and hint in `.nexum-chat-composer-info-row`; wrap file input/button, `composerExtras`, cancellation controls, and primary send button in `.nexum-chat-composer-action-row`. Keep each existing signal, event handler, disabled condition, aria label, and button order unchanged.

- [ ] **Step 4: Add responsive CSS**

  Make the info row shrink safely with `min-width: 0` and ellipsis on the hint. Make the action row `display: flex`, `flex-wrap: wrap`, and keep each button at its natural width with `min-height: var(--nexum-chat-tap-min)`. At `@container (max-width: 480px)`, make the composer bar stack the info row and action row; keep the action row wrap-enabled and do not use `overflow-x: auto`, fixed clipping, or `display: none` for upload/send controls.

- [ ] **Step 5: Run the responsive contract test**

  Run: `bun test --cwd packages/nexum-chat-surface test/responsive-contract.test.ts`

  Expected: PASS with the row structure and narrow-container rules verified.

- [ ] **Step 6: Verify the rendered layout at three container widths**

  Run the existing ChatSurface example or local test page and inspect widths around 720px, 480px, and 360px. Confirm the title disappears only when `showHeader={false}`, the information row remains readable, and upload, injected controls, cancel/confirmation, and send remain visible without horizontal clipping.

### Task 3: Run package and repository verification

**Files:**
- Modify: `openspec/changes/chat-surface-responsive-controls/tasks.md`

- [ ] **Step 1: Run package tests and typecheck**

  Run: `bun test --cwd packages/nexum-chat-surface && bun run --cwd packages/nexum-chat-surface typecheck`

  Expected: all ChatSurface tests pass and TypeScript exits with code 0.

- [ ] **Step 2: Run the repository check**

  Run: `bun run check`

  Expected: repository lint and typecheck pass; any unrelated pre-existing failure is recorded separately instead of being attributed to this change.

- [ ] **Step 3: Review the diff against the design**

  Run: `git diff --check && git diff -- packages/nexum-chat-surface docs/superpowers/specs/2026-11-29-chat-surface-responsive-controls-design.md`

  Expected: no whitespace errors, only the public header flag, two-row composer layout, documentation, and tests are changed.

- [ ] **Step 4: Mark OpenSpec tasks and prepare commit**

  Mark completed checkboxes in `openspec/changes/chat-surface-responsive-controls/tasks.md`, run `openspec validate chat-surface-responsive-controls --type change --strict`, then commit with a Chinese Conventional Commit containing a body and `Refs: OpenSpec chat-surface-responsive-controls` footer.

## Workflow follow-up

- Run code-review-spec and frontend-interaction-guidelines review against the final diff.
- Complete the per-task audit and final verification before merging.
- Merge the task branch into `dev-v0.0.1`, verify ancestry, remove the clean task worktree, and push the integration branch if the user still requests remote delivery.
