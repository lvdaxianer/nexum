# `nexum-ai/surfaces`

[中文](../zh-CN/modules/nexum-surfaces.md)

`nexum-ai/surfaces` is an embeddable Solid Web workbench. It combines Chat,
Session, tool, Permission, Question, compaction, Skill, and event timeline views
using the public Client and Chat Surface boundaries.

```tsx
import { render } from "solid-js/web"
import { NexumSurfaces } from "nexum-ai/surfaces"
import "nexum-ai/surfaces/styles.css"

render(() => <NexumSurfaces apiBaseUrl="http://127.0.0.1:4097" />, document.getElementById("root")!)
```

`apiBaseUrl` is optional. If omitted, the component uses `VITE_NEXUM_API_URL`
when provided, or the current page host with port `4097`.

## Local preview and verification

```sh
bun packages/nexum-server/src/main.ts
bun run --cwd packages/nexum-surfaces dev -- --host 127.0.0.1 --port 5173
bun run --cwd packages/nexum-surfaces typecheck:tsc
bun run --cwd packages/nexum-surfaces build
```

Open `http://127.0.0.1:5173`. Its behavior is governed by the public
[interaction protocol](../ui/interaction-protocol.md), [UI states](../ui/states.md),
and [Runtime API](../../apis/nexum.md).

The Surface consumes protocol state; it does not redefine Core, Permission
policy, or Session rules. The package is distributed through the unified
`nexum-ai` package and does not require any `@nexum/*` package installation.
