# Headless UI API 地址修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复部署后的 Headless UI 将 API 请求发往用户本机的问题，使工作目录校验和 Session 创建可以正常到达服务器。

**Architecture:** 保留显式 `VITE_HEADLESS_API_URL`，仅把未配置时的默认值从硬编码 localhost 改为当前 UI 页面所在主机的 API 地址。用跨主机 Playwright 冒烟测试验证浏览器真实请求目标，并在部署后验证远程页面。

**Tech Stack:** SolidJS, Vite, Playwright, Bun, Headless API。

---

### Task 1: 添加跨主机回归测试

**Files:**
- Modify: `packages/headless-ui/test/permission.smoke.spec.ts`
- Test: 同上，新增默认 API 地址测试

- [x] **Step 1: 添加测试**

新增一个使用 `localhost:5173` UI origin 的 serial 测试，等待页面初始化请求命中 `http://localhost:4097` 的 Headless API 接口。

- [x] **Step 2: 运行测试确认红灯**

运行 `bun run --cwd packages/headless-ui test:smoke -- --grep "uses the served UI host"`，旧代码应因请求仍指向 `127.0.0.1:4097` 而超时或断言失败。

### Task 2: 修复运行时 API 地址

**Files:**
- Modify: `packages/headless-ui/src/main.tsx`

- [x] **Step 1: 写最小实现**

将默认地址改为 `${window.location.protocol}//${window.location.hostname}:4097`，并继续让 `VITE_HEADLESS_API_URL` 优先。

- [x] **Step 2: 运行回归测试确认绿灯**

运行 `bun run --cwd packages/headless-ui test:smoke -- --grep "uses the served UI host"`，确认跨主机初始化请求成功。

### Task 3: 完成验证与交付

**Files:**
- Modify: `openspec/changes/headless-ui-api-origin/tasks.md`

- [x] **Step 1: 执行包级类型检查、构建和完整 smoke**

运行 `bun run --cwd packages/headless-ui typecheck:tsc`、`bun run --cwd packages/headless-ui build` 和 `bun run --cwd packages/headless-ui test:smoke`。

- [x] **Step 2: 执行 OpenSpec 严格校验并审查 diff**

运行 `bunx openspec validate headless-ui-api-origin --strict`，检查 `git diff --check` 和代码审查规范。

- [ ] **Step 3: 提交、合并到 `dev-v0.0.1` 并重新部署**

使用中文 Conventional Commit，合并后重新打包 UI、部署服务器并验证 `http://10.100.31.167:5173/` 的 API 请求地址和 Session 工作目录保存流程。
