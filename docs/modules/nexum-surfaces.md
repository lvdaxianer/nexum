# Internal Workbench Migration

[中文](../zh-CN/modules/nexum-surfaces.md)

The former `nexum-surfaces` package was the complete Web workbench. It is no
longer a public package or a `nexum-ai/surfaces` subpath. The workbench source
now lives in `packages/nexum-test`, which owns the left navigation and
management panels and imports the public Chat Surface for the right chat area.

External projects should use only:

```tsx
import { ChatSurface } from "nexum-ai/chat-surface"
import "nexum-ai/chat-surface/styles.css"
```

Run the internal workbench with:

```sh
bun run dev:surface
# or
bun run --cwd packages/nexum-test dev
```

The public UI contract is documented in [Chat Surface](nexum-chat-surface.md).
