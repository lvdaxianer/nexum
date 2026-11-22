# Tasks

## 1. Naming and OpenSpec baseline

- [ ] 1.1 Rename `packages/nexum-ui` to `packages/nexum-surfaces`, change package name to `@nexum/surfaces`, update workspace imports and expose scenario-neutral terminology.
- [ ] 1.2 Validate this change with `openspec validate nexum-core-adapter-separation --strict` and record the dependency graph and persistent POC contract.

## 2. Persistent Test Workbench

- [ ] 2.1 Add `packages/nexum-test` as a private test-only package with `test`, `typecheck` and `dev` scripts.
- [ ] 2.2 Add a file-backed test runtime using a dedicated `.nexum-test` directory; do not use in-memory stores in the POC path.
- [ ] 2.3 Add deterministic Fake Model behavior for assistant text, question interaction, answer continuation, completion, error and cancellation.
- [ ] 2.4 Add a real Protocol/Client/Surface bridge and a browser POC Workbench showing Session, Coding Loop, event stream, runtime status and controls.
- [ ] 2.5 Add automated cross-layer tests, restart/recovery tests and boundary tests proving `@nexum/test` is not a production dependency.

## 3. Core boundary extraction

- [ ] 3.1 Move pure Core contracts, errors and lifecycle types into semantic contract modules; keep `@nexum/core` exports infrastructure-free.
- [ ] 3.2 Move file/in-memory stores, OpenAI-compatible Model, local Host, built-in Tools, filesystem Skills and file Context into `@nexum/adapters`.
- [ ] 3.3 Remove Core fallback creation and require explicit Model, Tool, Permission, Session, Message and Event dependencies.
- [ ] 3.4 Add Core import/export boundary tests and retain Session inbox, steer, compaction and execution recovery semantics.

## 4. Runtime and Server composition

- [ ] 4.1 Make `createEmbeddedRuntime` test-oriented and `createLocalRuntime` file-persistent, both with explicit lifecycle and close behavior.
- [ ] 4.2 Make Server accept an injected Runtime and limit itself to HTTP/SSE Protocol binding and safe error mapping.
- [ ] 4.3 Ensure Local Runtime starts before the POC or Server accepts requests and closes all adapters in reverse order.

## 5. Verification and page acceptance

- [ ] 5.1 Run Core, Adapter, Protocol, Client, Server, Surface and Test package tests/typechecks.
- [ ] 5.2 Run the POC dev server and verify the browser page against the persistent cross-layer scenarios.
- [ ] 5.3 Restart the POC with the same `.nexum-test` directory and verify Session/history/event recovery.
- [ ] 5.4 Run generated client checks after any Protocol/Server HttpApi change, `git diff --check`, root checks and final OpenSpec verification.
