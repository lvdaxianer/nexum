# `@nexum/test` Test Workbench

[中文](../zh-CN/modules/nexum-test.md)

<!-- 内部模块 / Internal module -->

This is an internal cross-layer verification package and complete Test
Workbench, not a production Runtime or public UI package. It owns the left
navigation and management panels, and imports the public Chat Surface for the
right chat area:

```tsx
import { ChatSurface } from "@nexum/chat-surface"
```

The public consumer entry is `nexum-ai/chat-surface`; the complete workbench is
not published as `nexum-ai/surfaces`.

## Workbench

```sh
bun run --cwd packages/nexum-test dev
```

The workbench verifies Session creation/recovery, model and directory
configuration, Prompt, text/tool/Permission/Question/Skill/Context events,
terminal states, and recovery after refresh or restart.

## Persistence check

The persistent POC reopens the same data directory after closing Server and
Runtime and verifies Session, model configuration, Memory, Permission Policy,
Interaction, Message, and Event recovery. Runtime data and temporary test
directories must not be committed.

```sh
cd packages/nexum-test
bun test
bun run typecheck:tsc
```

For public behavior, read [Session](../capabilities/session.md) and [Events](../capabilities/events.md).
