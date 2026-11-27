# Nexum Documentation Hub

[中文](zh-CN/README.md)

This is the single public entry point for Nexum usage documentation. You do
not need to understand the source tree first: choose a goal, follow one
composition example, and open the linked module or protocol reference when you
need its parameters.

The English pages are the default public entry. The [Chinese mirror](zh-CN/README.md)
contains the same learning path and API details.

## Start here

If this is your first time using Nexum, read in this order:

1. [What is Nexum?](../README.md#what-problem-does-nexum-solve)
2. [What can it do?](../README.md#what-can-nexum-do)
3. [Choose a composition](../README.md#choose-a-composition)
4. [How modules are divided](../README.md#how-the-modules-are-divided)
5. [Session guide](capabilities/session.md)

Five concepts are enough to begin: a Runtime is the Agent environment, a Model
is the model provider, a Tool is a callable capability, a Session is a
recoverable task, and a Surface is the Web, CLI, or desktop experience the user
sees.

## Composition examples

Do not assemble a runtime from the module table on your first attempt. Start
with [Nexum composition examples](examples/README.md):

- [Build a complete Agent application](examples/full-stack-chat.md): SQLite,
  HTTP/SSE, Client, and Chat Surface in one beginner-friendly walkthrough.
- [Embed an Agent](examples/embedded-runtime.md): the smallest in-process setup.
- [Local file persistence](examples/local-file-runtime.md): keep Sessions after restart.
- [SQLite + HTTP/SSE service](examples/sqlite-http-runtime.md): expose a runtime to Web, desktop, or another language.
- [Connect a Chat UI](examples/chat-surface.md): attach an existing Server to an embeddable surface.

## Find a capability

| Goal | Start with | You will find |
| --- | --- | --- |
| Create, list, and recover Sessions | [Session](capabilities/session.md) | create, list, state, Prompt, history, continue, cancel, and delete |
| Observe a run | [Events and SSE](capabilities/events.md) | event types, sequence cursors, replay, reconnect, and terminal states |
| Configure a role and model | [Model / Runtime](capabilities/model-runtime.md) | model settings, role prompts, composition, and probing |
| Handle tool authorization | [Permission](ui/permission.md) | pending requests, policies, and user decisions |
| Handle Agent Questions | [Question](ui/question.md) | structured questions, answers, cancellation, and errors |
| Use context and history | [Context / History](capabilities/context-and-history.md) | project context, compaction, messages, and recovery |
| Use Skills | [Skills](capabilities/skills.md) | discovery, validation, registration, activation, and updates |
| Use MCP | [MCP](capabilities/mcp.md) | HTTP/stdio server lifecycle, tools, resources, prompts, and OAuth |
| Register local functions | [Local functions](capabilities/local-functions.md) | in-process JavaScript function calling and handler lifecycle |

## Modules and APIs

Module pages explain each entry point, its responsibility, parameters, return
values, and composition boundary:

- [Module documentation index](modules/README.md)
- [Complete Runtime API](../apis/nexum.md)
- [Protocol and event model](modules/nexum-protocol.md)
- [Client Session methods](modules/nexum-client.md)
- [Server startup and routes](modules/nexum-server.md)
- [Chat Surface parameters](modules/nexum-chat-surface.md)

## Protocols and UI

If you build your own UI, do not copy the Core execution loop. Use these
boundaries:

1. Use Client to call the HTTP API.
2. Use Session APIs to read `state`, `messages`, and `events`.
3. Use Permission/Question APIs to submit user decisions.
4. Use Surface Adapter for history, recovery, and normalized errors.
5. Use Chat Surface, or build your own Surface from Protocol events.

- [UI interaction protocol](ui/interaction-protocol.md)
- [UI states and recovery](ui/states.md)
- [Permission protocol](ui/permission.md)
- [Question protocol](ui/question.md)
- [Styling and theming](ui/theming.md)

## Architecture

- [Module boundaries](architecture/module-boundaries.md)
- [Runtime flow](architecture/runtime-flow.md)

## How to use this documentation

Use the examples when you are deciding how to combine Nexum. Use capability
pages when you know what behavior you need, such as Session recovery or model
configuration. Use module pages to look up import paths, parameters, return
values, and replacement boundaries. Use the [Runtime API](../apis/nexum.md)
when your client is another process or another language.

## Language policy

English is the default public entry point. Every public usage page has a Chinese
mirror. Use the language link at the top of any page to switch languages. OpenSpec,
internal plans, reviews, and test notes are intentionally excluded from this
public usage-doc set.
