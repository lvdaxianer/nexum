# Nexum 单包发布实施计划

> **For implementation:** follow the tasks in order. Each task must pass its verification gate before the next task starts.

## Goal

把当前 `@nexum/*` workspace 源码模块发布成一个可安装的 `nexum` 包。用户只安装 `nexum`，通过 subpath 使用模块；源码 workspace 继续服务仓库内部开发，不能成为用户运行时依赖。

## Public contract

```text
npm install nexum

nexum
nexum/core
nexum/protocol
nexum/application
nexum/persistence
nexum/persistence/memory
nexum/persistence/file
nexum/persistence/sqlite
nexum/integrations
nexum/client
nexum/server
nexum/surface-adapter
nexum/chat-surface
nexum/cli
```

`@nexum/*` 只作为仓库内部 workspace 包存在，不出现在发布包的 `dependencies`、`exports` 或生成的 JavaScript/声明文件中。

## Implementation steps

### 1. Release entrypoint and RED verification

Files:

- Add `script/nexum-entry.ts` for the root facade.
- Add a single source-of-truth entrypoint map under `script/`.
- Add `script/verify-nexum.ts` and `bun run verify:nexum`.
- Add the public packaging scripts to the root `package.json`.

Write the verifier before the builder. It must fail clearly when `artifacts/nexum` does not exist or does not contain compiled JS, declarations, and valid subpath exports. Run it and preserve the expected RED result as evidence.

### 2. Build the compiled package

Files:

- Add `script/build-nexum.ts`.
- Add declaration generation and `@nexum/*` to `nexum/<subpath>` rewriting.
- Generate `artifacts/nexum/package.json`, `README.md`, `LICENSE`, `dist/`, and the CLI executable.
- Keep third-party runtime dependencies external and write them to the generated manifest.
- Copy Chat Surface CSS and expose the persistence variants as independent public subpaths.

The builder must use the repository's pinned Bun version, produce only compiled release files, and fail if declaration output still leaks a workspace package or source path.

### 3. Pack and test outside the repository

Files:

- Add `script/pack-nexum.ts`.
- Extend `script/verify-nexum.ts` with tarball checks or add a dedicated consumer verifier.

Create a temporary external consumer, install the generated tarball as the only Nexum package, and verify ESM imports, TypeScript declarations, CLI resolution, and CSS resolution. Inspect the tarball for forbidden source/test/workspace files.

### 4. Document every module

Files:

- Update every `packages/nexum-*/README.md`.
- Add missing persistence module docs under `docs/modules/`.
- Update the module index and root `README.md`.
- Add a docs-to-manifest audit.

Every module document must state whether it is public, internal, or demo/test-only; show the public `nexum` install and subpath; provide a minimal usage example; explain composition and runtime constraints; and show workspace-only contributor commands where relevant. User-facing examples must never ask users to install `@nexum/*`.

### 5. Full verification and delivery

Run, from the repository root unless a command is package-scoped:

```text
bun run build:packages
bun run pack:nexum
bun run verify:nexum
bun run check
```

Run relevant package tests from their package directories, inspect the generated tarball, run project hygiene, update OpenSpec task checkboxes, commit with a conventional message, merge into `dev-v0.0.1`, and archive the OpenSpec change only after all checks pass.

## Constraints

- Do not publish `@nexum/application` or any other `@nexum/*` package independently.
- Do not make consumers install the repository source or workspace packages.
- Do not expose `src/`, tests, local workspace manifests, or unresolved `@nexum/*` references in the tarball.
- Do not change Runtime or Protocol behavior as part of the packaging work.
- Preserve unrelated user changes in other worktrees.
