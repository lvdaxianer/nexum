# Nexum Skill Management UI T4/T5 Audit

## Scope

- Skills drawer management flow for OpenSpec tasks 5.1 and 5.2.
- No Core, Server, Protocol, or generated Client changes.
- Existing user-owned surface layout changes were not included in this task branch.

## Findings and changes

1. Skills drawer now exposes address registration, list loading/error feedback, detail expansion through the Client detail endpoint, refresh, validation, and unregister confirmation.
2. Successful registration updates the list immediately and the existing ChatSurface `@` suggestion path observes the new ready Skill.
3. Skill detail renders only the safe Client response fields and keeps source paths out of the UI contract.
4. Role prompt editing keeps a dirty draft while a delayed initial GET or failed PUT completes; successful save and reset clear the dirty marker.
5. Role prompt remains a control-plane drawer and has no Agent tool entry.

## Evidence

- `packages/nexum-surfaces/test/permission.smoke.spec.ts`
  - `registers, inspects, validates, refreshes, and unregisters a Skill from the drawer`
  - `keeps Skill and role prompt drafts visible while loading or saving fails`
- Focused browser smoke: 2 passed.
- Existing Skill UI/event smoke scenarios: passed when run with a fresh test database.
- Real browser acceptance with the requested source directory passed: the Skill registered as `ready`, survived refresh, activated through `@metric-view-lifecycle`, and produced the expected `skill.activated` event.
- The same real browser acceptance passed unregister confirmation, verified the UI record disappeared, and verified the source `SKILL.md` remained on disk.
- The same acceptance configured a Chinese role prompt, observed `runtime:default-role` in the model input, and verified the model response text remained unchanged.
- Client tests: 8 passed; focused surface smoke: 2 passed; OpenSpec strict validation passed.
- `packages/nexum-surfaces`: `bun run typecheck:tsc` passed.
- `packages/nexum-chat-surface`: `bun typecheck` passed.
- Repository: `bun run check` passed after the implementation was finalized.
- `git diff --check` passed.

## Known test-environment caveat

The smoke suite's default SQLite file at `packages/nexum-surfaces/.nexum/nexum.db` is reused between runs. A failed run can leave registrations or sessions that make unrelated serial tests observe stale state. Validation for this task used isolated ports and a fresh test database; no product behavior depends on that file.

In a freshly created sparse worktree, the full Core/Application/Server test commands also reported missing installed workspace/runtime modules (`@nexum/persistence-file` and `@modelcontextprotocol/sdk`); this is an environment/install baseline failure, not a failure in the changed UI packages. The repository-wide `bun run check` and affected UI typechecks remained green.
