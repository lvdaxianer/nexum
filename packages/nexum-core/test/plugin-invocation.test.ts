import { expect, test } from "bun:test"
import {
  NexumPluginInvocationError,
  parseNexumPluginMention,
  type NexumPluginActivationPort,
  type NexumPluginManifest,
  type NexumPluginRouteDecision,
  type NexumPluginSummary,
} from "../src/index.ts"

const manifest: NexumPluginManifest = {
  id: "crm",
  version: "1.0.0",
  description: "处理客户和订单问题",
  routing: { intents: ["order"], examples: ["查询订单"], keywords: ["订单"] },
  exports: [{ id: "order.query", kind: "function", description: "查询订单" }],
  permissions: ["order.read"],
}

const summary: NexumPluginSummary = { ...manifest, status: "registered", diagnostics: [] }

test("resolves an explicit top-level plugin mention", () => {
  expect(parseNexumPluginMention("@crm 查询订单 123", [summary])).toMatchObject({
    kind: "explicit",
    pluginID: "crm",
    mention: { start: 0, end: 4, text: "@crm" },
  })
})

test("keeps the original position when a plugin mention is not at the start", () => {
  expect(parseNexumPluginMention("请让 @crm 查询订单", [summary])).toMatchObject({
    kind: "explicit",
    pluginID: "crm",
    mention: { start: 3, end: 7, text: "@crm" },
  })
})

test("rejects direct mentions of plugin internals", () => {
  expect(() => parseNexumPluginMention("@crm/order.query 查询订单 123", [summary])).toThrow(
    new NexumPluginInvocationError("plugin_internal_mention", "Plugin 内部能力不能直接 @", "crm"),
  )
})

test("rejects explicit mentions of unregistered plugins", () => {
  expect(() => parseNexumPluginMention("@shipping 查询物流", [summary])).toThrow(
    new NexumPluginInvocationError("plugin_not_found", "Plugin 不存在: shipping", "shipping"),
  )
})

test("represents unique and ambiguous natural-language route results", () => {
  const automatic: NexumPluginRouteDecision = { kind: "automatic", pluginID: "crm", candidates: ["crm"] }
  const ambiguous: NexumPluginRouteDecision = { kind: "ambiguous", candidates: ["crm", "shipping"] }

  expect(automatic).toEqual({ kind: "automatic", pluginID: "crm", candidates: ["crm"] })
  expect(ambiguous).toEqual({ kind: "ambiguous", candidates: ["crm", "shipping"] })
})

test("defines a shared activation port result for explicit and automatic routes", async () => {
  const activation: NexumPluginActivationPort = {
    async activate(input) {
      return { pluginID: input.pluginID, status: "active", source: input.source }
    },
  }

  await expect(activation.activate({ sessionID: "session-1", pluginID: "crm", source: "automatic" })).resolves.toEqual({
    pluginID: "crm",
    status: "active",
    source: "automatic",
  })
})
