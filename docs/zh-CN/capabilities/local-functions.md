# 本地 JavaScript Function Calling

[English](../../capabilities/local-functions.md)

本地 JavaScript 函数是进程内工具模式：直接注册到 Runtime，由 JSON Schema
生成模型可见的工具定义，不经过网络，也不会额外启动 MCP 子进程。

## 注册本地函数

```ts
import { createEmbeddedRuntime } from "nexum-ai/application"

const runtime = createEmbeddedRuntime({
  localFunctions: [{
    providerID: "project-tools",
    providerName: "Project Tools",
    functions: [{
      name: "create_issue",
      description: "在当前项目创建 Issue",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
        additionalProperties: false,
      },
      async execute(input, context) {
        return { issueID: await createIssue(input.title), sessionID: context.sessionID }
      },
    }],
  }],
})
```

模型看到的稳定名称是
`local__project_tools__create_issue`。函数收到已经过基础 Schema 校验的
参数，以及 `{ sessionID, signal }` 上下文。字符串结果原样返回，其他结果
会转换成 JSON 文本。

## 生命周期与持久化

`runtime.localFunctions.register(provider)` 和
`unregister(providerID)` 会原地刷新工具目录，正在运行的 Coding Loop 不需要
重建 Runtime。相同定义重复注册是幂等操作；同一稳定名称对应不同描述或
Schema 时会拒绝注册。

函数体不会被序列化。文件或 SQLite Runtime 可以持久化 MCP 配置，但本地
JavaScript handler 必须在进程启动时重新注入。这样可保证可执行代码留在应用
边界内，不把 JSON 元数据当作可执行源码。

本地函数和 MCP 工具共享模型工具目录与 `ToolPort`，但使用不同命名空间：
本地函数是 `local__...`，MCP 工具是 `mcp__...`。本地函数请求使用
`local.call` 权限动作。
