import { expect, test } from "bun:test"
import { join } from "node:path"
import { createNexumPluginRegistry, createNexumPluginRuntime } from "../src/index.ts"
import type { ToolRequest } from "@nexum/core"

test("discovers and activates the CRM Plugin fixture through the public runtime path", async () => {
  const registry = createNexumPluginRegistry({ roots: [join(import.meta.dir, "fixtures")] })
  const runtime = createNexumPluginRuntime({ registry, permission: { evaluate: async () => "allow" } })

  const summaries = await registry.list()
  expect(summaries).toHaveLength(1)
  expect(summaries[0]).toMatchObject({ id: "crm", status: "registered" })
  expect(summaries[0]?.exports).toContainEqual({
    id: "customer-support",
    kind: "skill",
    description: "客户问题处理规则",
  })
  await runtime.activate({ sessionID: "session-crm", pluginID: "crm", source: "explicit" })

  const request: ToolRequest = {
    sessionID: "session-crm",
    toolName: "plugin__crm__order_query",
    action: "plugin__crm__order_query",
    resource: "order-123",
    input: { orderID: "order-123" },
  }
  await expect(runtime.listTools("session-crm")).resolves.toMatchObject([
    { name: "plugin__crm__order_query", description: "查询订单状态" },
  ])
  await expect(runtime.executeTool(request)).resolves.toEqual({
    ok: true,
    output: "订单 order-123 当前状态：处理中",
  })

  await runtime.deactivate({ sessionID: "session-crm", pluginID: "crm" })
  await expect(runtime.listTools("session-crm")).resolves.toEqual([])
  await runtime.close()
})
