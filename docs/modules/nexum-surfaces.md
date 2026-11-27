# `@nexum/surfaces` reference Surface

[中文](../zh-CN/modules/nexum-surfaces.md)

<!-- 内部模块 / Internal module -->

This is an internal reference Web Surface and protocol acceptance entry point.
It is not a public reusable package or an installation target. It combines
Chat, Session, tool, Permission, Question, compaction, Skill, and event timeline
views using the public Client and Chat Surface boundaries.

## Local preview

```sh
bun packages/nexum-server/src/main.ts
bun run --cwd packages/nexum-surfaces dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173`. Its behavior is governed by the public
[interaction protocol](../ui/interaction-protocol.md), [UI states](../ui/states.md),
and [Runtime API](../../apis/nexum.md).

The reference Surface consumes protocol state; it does not redefine Core,
Permission policy, or Session rules.
