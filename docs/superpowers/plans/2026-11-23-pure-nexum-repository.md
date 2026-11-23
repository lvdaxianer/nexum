# Pure Nexum Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `dev-v0.0.1` 的 workspace、构建入口和源码包边界收敛为纯 Nexum，同时保持 `dev` 分支的 OpenCode 基线不变。

**Architecture:** 以现有 `packages/nexum-*` 七个包为唯一 workspace。根配置只负责组合、验证和启动 Test Workbench；Core、Adapters、Protocol、Client、Server、Surface 的现有依赖方向不改变。历史 OpenSpec/审查资料留在仓库中但不进入 workspace、构建或发布。

**Tech Stack:** Bun 1.4.4、TypeScript、Turbo、Oxlint、Vite、Solid、Playwright、OpenSpec。

---

### Task 1: 建立纯 Nexum 根边界

**Files:**
- Modify: `package.json`
- Modify: `turbo.json`
- Modify: `bunfig.toml`
- Modify: `.oxlintrc.json`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `packages/README.md`
- Modify: `docs/README.md`
- Modify: `apis/README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `SECURITY.md`
- Test: `packages/nexum-test/test/repository-boundary.test.ts`

- [ ] **Step 1: Write the failing boundary test**

  新增 `packages/nexum-test/test/repository-boundary.test.ts`，读取根 `package.json` 和 `packages/*/package.json`，断言根包名是 `nexum`、workspace 只包含 `packages/nexum-*`、发现的 workspace 包名全部以 `@nexum/` 开头，并断言根依赖与 Turbo 配置不含 `@opencode/`。

- [ ] **Step 2: Run the test to verify it fails**

  Run: `cd packages/nexum-test && bun test test/repository-boundary.test.ts`

  Expected: FAIL，至少因为根包名仍为 `opencode`、workspace 仍包含旧包或根依赖包含 `@opencode/*`。

- [ ] **Step 3: Replace root configuration with Nexum configuration**

  将根包名改为 `nexum`，workspace 改为 `packages/nexum-*`，脚本改为 `dev: bun run --cwd packages/nexum-test dev`、`dev:surface: bun run --cwd packages/nexum-surfaces dev`、`lint: oxlint packages/nexum-*`、`typecheck: bun turbo typecheck --concurrency=3`、`typecheck:tsc: bun turbo typecheck:tsc --concurrency=3`、`check: bun run lint && bun run typecheck`；移除 `@opencode/*` 依赖、OpenCode 专用脚本、旧 repository URL 和 patchedDependencies。

  `turbo.json` 只保留 Nexum 通用任务；`bunfig.toml` 只保留安装精确性、最小发布年龄和根测试保护；`.oxlintrc.json` 删除旧包路径覆盖，仅保留对 Nexum 源码有效的基础规则；`.gitignore` 用 `.nexum-test/` 和 Nexum 本地文件作为唯一运行时忽略规则。

- [ ] **Step 4: Update active documentation and local metadata**

  将根 README、包 README、贡献指南、安全说明和 API/docs 入口改为 Nexum 语义；删除“原 OpenCode 产品仍在本 workspace 中”的说明，保留历史 OpenSpec 记录但注明它们不参与构建。不得修改 `AGENTS.md` 中的仓库工作流指令。

- [ ] **Step 5: Run the boundary test to verify it passes**

  Run: `cd packages/nexum-test && bun test test/repository-boundary.test.ts`

  Expected: PASS，根 metadata、workspace 和活动配置都只指向 Nexum。

- [ ] **Step 6: Commit the root boundary**

  Run:

  ```bash
  git add package.json turbo.json bunfig.toml .oxlintrc.json .gitignore README.md packages/README.md docs/README.md apis/README.md CONTRIBUTING.md SECURITY.md packages/nexum-test/test/repository-boundary.test.ts
  git commit -m "♻️ refactor(repo): 收敛根 workspace 为 Nexum"
  ```

### Task 2: 删除未使用的 OpenCode 代码和构建资产

**Files:**
- Delete: `packages/ai`, `packages/app`, `packages/cli`, `packages/client`, `packages/codemode`, `packages/core`, `packages/data`, `packages/desktop`, `packages/effect-drizzle-sqlite`, `packages/gui-plugins`, `packages/http-recorder`, `packages/httpapi-codegen`, `packages/identity`, `packages/latex`, `packages/merman`, `packages/nav-menus`, `packages/patchmark`, `packages/plugin`, `packages/plugin-browser`, `packages/plugins`, `packages/process-daemon`, `packages/protocol`, `packages/schema`, `packages/script`, `packages/sdk`, `packages/server`, `packages/session-ui`, `packages/simulation`, `packages/stories`, `packages/theme`, `packages/tui`, `packages/ui`, `packages/util`
- Delete: `script`, `patches`, `install`, `flake.nix`, `flake.lock`, `CHANGELOG.md`
- Modify: `packages/nexum-core/test/package-boundary.test.ts`
- Modify: `packages/nexum-server/test/server.test.ts`

- [ ] **Step 1: Extend the boundary test with explicit package deletion checks**

  在同一测试中断言旧 OpenCode 包目录不在 `packages/` 目录下，并断言 `git` 可见的 Nexum 代码不出现 `@opencode/` import；把原来用于说明“禁止 OpenCode UI 包”的测试常量改为 Nexum Surface 的真实边界名称。

- [ ] **Step 2: Run the extended test to verify it fails**

  Run: `cd packages/nexum-test && bun test test/repository-boundary.test.ts`

  Expected: FAIL，因为旧包目录仍然存在。

- [ ] **Step 3: Delete only the validated unused directories**

  用已列出的精确目录执行 `git rm -r --`，删除所有 OpenCode 产品包、数据/插件/进程工具、旧脚本、旧补丁、旧安装器、旧 Nix 文件和旧 Changelog；不得删除 `packages/nexum-*`、`apis`、`docs`、`openspec` 或 `skills`。

- [ ] **Step 4: Run the extended test to verify it passes**

  Run: `cd packages/nexum-test && bun test test/repository-boundary.test.ts`

  Expected: PASS，目录清单和活动源码不再包含 OpenCode workspace 实现。

- [ ] **Step 5: Reinstall and verify workspace resolution**

  Run: `bun install`

  Expected: 安装成功，`bun.lock` 只保留七个 `@nexum/*` workspace importer，且不再出现被删除的 workspace 包。

- [ ] **Step 6: Commit the deletion**

  Run:

  ```bash
  git add -A
  git commit -m "🗑️ chore(repo): 移除未使用的 OpenCode 资产"
  ```

### Task 3: 全量 Nexum 验证与浏览器验收

**Files:**
- Verify: `packages/nexum-core`, `packages/nexum-adapters`, `packages/nexum-protocol`, `packages/nexum-client`, `packages/nexum-server`, `packages/nexum-test`, `packages/nexum-surfaces`
- Verify: `openspec/changes/pure-nexum-repository/.openspec.yaml`

- [ ] **Step 1: Run focused package tests and typechecks**

  依次从各受影响包目录运行既有 `bun test` 和 `bun run typecheck`/`bun run typecheck:tsc`；Surface 运行 `bun run typecheck:tsc` 与 `bun run build`。

- [ ] **Step 2: Run root checks and structural checks**

  Run: `bun run check`、`git diff --check`、`openspec validate pure-nexum-repository --strict`、`git grep -n '@opencode/' -- package.json turbo.json bunfig.toml .oxlintrc.json packages apis skills`。

  Expected: 根 check、结构检查和 OpenSpec 校验通过；历史资料中的 OpenCode 文本不作为运行时边界失败。

- [ ] **Step 3: Start local services and verify the browser path**

  Run: `bun run --cwd packages/nexum-test dev`。

  在 `http://localhost:5173` 通过页面的 Model Configuration 保存已有模型配置，确认刷新后仍在；创建/选择 Session，确认刷新后仍在；打开 Skills，使用地址 `/Users/lvdaxianer/workspace/uino/project/ontomato_enterprise/skills/metric-view-lifecycle` 注册，确认状态为 ready，刷新页面后列表仍在，并在 Prompt 中用 `@metric-view-lifecycle` 验证可以挂载。

- [ ] **Step 4: Perform final review and commit verification evidence**

  检查 `git status --short`、`git diff --stat`、`git diff --check`，确认工作区干净、`dev` 分支未被修改，提交本任务最终验证记录并合并回 `dev-v0.0.1`。
