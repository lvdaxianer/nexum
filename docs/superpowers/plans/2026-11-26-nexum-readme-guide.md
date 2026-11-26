# Nexum README Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the root README so a new user can understand Nexum, choose modules, run it, and compose replaceable runtime pieces from current repository APIs.

**Architecture:** Keep the README as the project entry point and link detailed behavior to existing docs. Organize the explanation around Core, persistence implementations, integrations, application composition, protocol/transport, surfaces, and test tooling; use only verified exports and scripts in examples.

**Tech Stack:** Markdown, Bun scripts, TypeScript package exports, existing repository documentation.

---

### Task 1: Rewrite the root README around user journeys

**Files:**

- Modify: `README.md`

- [x] **Step 1: Capture the current README structure and package inventory**

Run from the task worktree:

```bash
sed -n '1,360p' README.md
find packages -mindepth 1 -maxdepth 1 -type d -name 'nexum-*' | sort
```

Expected: the current README and all package directories are visible before the rewrite.

- [x] **Step 2: Rewrite the introduction and capabilities sections**

Start `README.md` with a concise Nexum definition, the problem it solves, intended scenarios, and a capability list covering Session, Coding Loop, tools, permissions, questions, context, skills, MCP, events, and recovery. Keep the existing Chinese and English project descriptions, but make them agree with the new positioning.

- [x] **Step 3: Add the verified quick-start paths**

Document these existing commands and imports without inventing new scripts:

```bash
bun install
bun run dev
bun run dev:server
bun run cli
```

Add minimal TypeScript examples for:

```ts
import { createEmbeddedRuntime, createLocalRuntime, createSqliteRuntime } from "@nexum/application"
import { startNexumServer } from "@nexum/server"
```

The examples must use `createEmbeddedRuntime({ model })`, `createLocalRuntime({ dataDirectory: ".nexum" })`, and `await createSqliteRuntime({ databasePath: ".nexum/nexum.db" })` followed by `await startNexumServer({ runtime })`.

- [x] **Step 4: Replace the architecture diagram and module map**

Explain the seven module boundaries and add rows for `@nexum/persistence-memory`, `@nexum/persistence-file`, and `@nexum/persistence-sqlite`. Ensure the dependency diagram matches the package manifests: Persistence/Integrations depend on Core, Application composes them, Client depends on Protocol, Server depends on Core/Application/Protocol, and surfaces consume Client/adapter layers.

- [x] **Step 5: Explain composition and replacement**

Add a short section showing that Application supplies defaults while callers may inject `persistence`, `model`, `host`, `memory`, `mcp`, and individual stores/ports. State when to choose embedded memory, local files, or SQLite Server. Link implementation details to package module docs.

- [x] **Step 6: Update navigation, status, and package-level verification**

Keep existing docs navigation, add links for the three persistence implementation READMEs or module docs where they exist, remove stale claims, and retain the rule that tests run from package directories. Replace the branch-specific project status with a capability-based status statement.

### Task 2: Verify README references and formatting

**Files:**

- Verify: `README.md`, `package.json`, `packages/*/package.json`, `docs/**/*.md`, `apis/**/*.md`

- [x] **Step 1: Run the focused link and path audit**

Run:

```bash
bun -e 'const { existsSync } = await import("node:fs"); const text = await Bun.file("README.md").text(); const links = [...text.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g)].map((match) => match[1]).filter((target) => !target.startsWith("http")); const missing = links.filter((target) => !existsSync(target)); if (missing.length) { console.error(missing.join("\\n")); process.exit(1) } console.log("checked " + links.length + " local links")'
```

Expected: exit 0 and report all local README targets checked.

- [x] **Step 2: Run Markdown and diff checks**

Run:

```bash
git diff --check
bunx prettier --check README.md docs/superpowers/specs/2026-11-26-nexum-readme-guide-design.md docs/superpowers/plans/2026-11-26-nexum-readme-guide.md
```

Expected: no whitespace errors and Prettier reports all checked files formatted.

### Task 3: Run repository verification and review the final diff

**Files:**

- Verify: `README.md` and planning artifacts

- [x] **Step 1: Run the canonical repository check**

Run from the repository root of the task worktree:

```bash
bun run check
```

Expected: lint and typecheck complete successfully. Do not run the root `test` script because the repository explicitly guards against root-level tests.

- [x] **Step 2: Review the final diff against the approved design**

Run:

```bash
git diff --stat
git diff -- README.md
```

Confirm the diff only changes documentation/planning assets, every requested README question is answered, and no generated client or runtime file was edited.

- [x] **Step 3: Commit the completed task**

Run:

```bash
git add README.md docs/superpowers/specs/2026-11-26-nexum-readme-guide-design.md docs/superpowers/plans/2026-11-26-nexum-readme-guide.md openspec/changes/readme-guide .source_branch
git commit -m "docs: reorganize Nexum README"
```

Expected: one conventional documentation commit containing the README and its auditable planning assets.
