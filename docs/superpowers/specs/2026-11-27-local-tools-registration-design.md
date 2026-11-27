# 本地工具双模式注册设计

## 目标

为 Nexum 增加两种可由 Runtime 注入的本地工具来源：

1. 本地 stdio MCP Server：Nexum 启动受控子进程，通过 MCP stdio 协议发现和调用工具。
2. 进程内本地 JS 方法：调用方在创建 Runtime 时传入 JS 函数，Nexum 将其直接暴露为模型可调用的 function calling 工具。

两种来源都进入统一的工具目录和 `ToolPort` 执行边界，但保留不同的来源标识、生命周期和持久化语义。

## 现状与边界

现有 MCP Registry、MCP 配置 Store、启动恢复、MCP 工具桥接和 Coding Loop 已经支持远程 HTTP MCP。远程 MCP 配置通过 `McpServerConfigStore` 持久化，启动时由 Local Runtime 恢复。

本次变更不改变远程 HTTP MCP 的既有接口语义，不把任意本地 JS 路径动态加载到 Runtime，也不把 JS 函数体序列化到磁盘。

## 设计

### 统一工具目录

Application 层维护统一的工具定义和执行绑定：

- MCP 来源使用 `mcp__<server>__<tool>` 命名；
- 进程内 JS 来源使用 `local__<provider>__<function>` 命名；
- 两种来源都提供模型可见的名称、描述和 JSON Schema；
- 两种来源都通过统一 `ToolPort.execute()` 执行，经过同一套权限、取消、超时和事件流程；
- 工具目录更新必须原地刷新 Coding Loop 使用的定义集合，使下一次模型调用看到新目录。

### 本地 stdio MCP

增加带判别字段的配置：

```ts
{
  id: "local-weather",
  name: "Local Weather",
  transport: "stdio",
  command: "bun",
  args: ["run", "/path/to/server.ts"],
  cwd: "/path/to",
}
```

Connector 使用官方 MCP SDK 的 `StdioClientTransport` 启动子进程，并复用现有 `McpConnection` 映射。`stdout` 保留给 MCP 协议，日志只能进入 `stderr`。MCP Server 退出时发布失败状态并沿用现有连接恢复机制；Runtime 关闭、断开或移除时关闭 transport 并终止子进程。

配置可以完整持久化。启动时先合并 Runtime 注入的初始配置，再恢复持久化配置，不通过服务 HTTP 接口自调用。

### 进程内本地 JS 方法

增加 Runtime 注入的本地函数定义：

```ts
{
  providerID: "local-tools",
  providerName: "Local Tools",
  functions: [
    {
      name: "get_weather",
      description: "查询天气",
      parameters: { type: "object", properties: { city: { type: "string" } } },
      execute: async (input, context) => getWeather(input.city, context.signal),
    },
  ],
}
```

`execute` 只存在于当前进程内，不序列化。持久化只保存 provider、函数名称、描述和 Schema 等可恢复元数据。Runtime 重启后，只有重新注入执行函数且 Schema 匹配的定义才重新进入模型工具目录；缺少 handler 的记录保持不可用且不可调用。

### 幂等规则

- MCP Server 以 `id` 为稳定身份；本地 JS 方法以 `providerID/functionName` 为稳定身份。
- 相同身份且规范化配置或 Schema 相同，重复注册为 no-op，并复用现有绑定。
- 相同身份但配置或 Schema 不同，默认返回稳定冲突错误，不静默覆盖运行中绑定。
- 显式替换必须先停止旧绑定、持久化新定义，再重新装配执行器。
- 启动恢复、Runtime 注入和 HTTP 管理入口使用同一套 ensure/merge 语义。

### 安全与错误边界

- stdio 只接受结构化 `command` 与 `args`，不得拼接 shell 字符串或自动 fallback 到 HTTP。
- MCP 与本地 JS 工具都必须经过工具权限评估；本地 JS 不能绕过权限直接执行。
- 参数在工具边界校验；未知工具、Schema 冲突、缺少 handler、子进程退出、超时和取消返回稳定工具错误。
- 不持久化环境变量中的凭据，不在公开状态、事件和日志中输出敏感值。

## 启动与运行时流程

```text
createLocalRuntime(options)
  -> 读取 MCP 持久化配置
  -> 幂等合并 options.mcpServers
  -> 恢复 stdio/HTTP MCP Registry
  -> 注册 options.localFunctions 的进程内绑定
  -> 生成统一工具目录
  -> Coding Loop 每次模型调用使用当前目录
```

## 验收标准

1. Runtime 可以批量注入并恢复本地 stdio MCP Server。
2. Runtime 可以注入多个拥有不同参数 Schema 的本地 JS 方法。
3. MCP 和本地 JS 方法都能出现在模型的 function calling 工具列表中。
4. 两种工具都经过同一权限、取消、超时和结果事件流程。
5. 重复启动和重复注入不会重复启动进程或重复绑定函数。
6. 配置冲突、缺失 handler 和无效参数不会静默执行。
7. 远程 MCP 既有注册、连接、工具发现和 OAuth 流程保持兼容。
8. 英文和中文 MCP 能力文档、Runtime 示例和 API 说明同步更新。
