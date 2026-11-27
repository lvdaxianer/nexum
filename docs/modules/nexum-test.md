# `@nexum/test` Test Workbench

[中文](../zh-CN/modules/nexum-test.md)

<!-- 内部模块 -->

This is an internal cross-layer verification package, not a production Runtime
or a user-facing demo. It runs real Core, Application, Protocol, Client, Server,
and Surface code together.

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
