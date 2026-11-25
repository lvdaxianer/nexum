import { expect, test } from "bun:test"
import {
  NexumPluginInvocationError,
  createNexumPluginInvocationPort,
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
const shippingSummary: NexumPluginSummary = {
  ...manifest,
  id: "shipping",
  description: "处理物流和配送问题",
  routing: { intents: ["shipping"], examples: ["查询物流"], keywords: ["物流", "配送"] },
  status: "registered",
  diagnostics: [],
}

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

test("activates explicit plugins in mention order without duplicate activation", async () => {
  const calls: string[] = []
  const activation = {
    async activate(input: {
      readonly pluginID: string
      readonly source: "explicit" | "automatic"
      readonly sessionID: string
    }) {
      calls.push(input.pluginID)
      return { pluginID: input.pluginID, status: "active" as const, source: input.source }
    },
  }
  const invocation = createNexumPluginInvocationPort({
    registry: { list: async () => [summary] },
    activation,
  })

  await expect(invocation.resolve({ sessionID: "session-1", text: "@crm 查询 @crm 再查" })).resolves.toEqual([
    { pluginID: "crm", status: "active", source: "explicit" },
  ])
  expect(calls).toEqual(["crm"])
})

test("leaves mentions for standalone skills to the existing skill path", async () => {
  let calls = 0
  const invocation = createNexumPluginInvocationPort({
    registry: { list: async () => [summary] },
    activation: {
      activate: async () => {
        calls += 1
        return { pluginID: "crm", status: "active", source: "explicit" as const }
      },
    },
  })

  await expect(invocation.resolve({ sessionID: "session-1", text: "@skill 写一份报告" })).resolves.toEqual([])
  expect(calls).toBe(0)
})

test("automatically activates the unique plugin matched by safe routing metadata", async () => {
  const calls: string[] = []
  const invocation = createNexumPluginInvocationPort({
    registry: { list: async () => [summary, shippingSummary] },
    activation: {
      activate: async (input) => {
        calls.push(`${input.pluginID}:${input.source}`)
        return { pluginID: input.pluginID, status: "active", source: input.source }
      },
    },
  })

  await expect(invocation.resolve({ sessionID: "session-1", text: "请帮我查询订单" })).resolves.toEqual([
    { pluginID: "crm", status: "active", source: "automatic" },
  ])
  expect(calls).toEqual(["crm:automatic"])
})

test("does not activate when natural-language routing is ambiguous or unmatched", async () => {
  const calls: string[] = []
  const invocation = createNexumPluginInvocationPort({
    registry: { list: async () => [summary, shippingSummary] },
    activation: {
      activate: async (input) => {
        calls.push(input.pluginID)
        return { pluginID: input.pluginID, status: "active", source: input.source }
      },
    },
  })

  await expect(invocation.resolve({ sessionID: "session-1", text: "请查询订单物流" })).resolves.toEqual([])
  await expect(invocation.resolve({ sessionID: "session-1", text: "帮我写一首诗" })).resolves.toEqual([])
  expect(calls).toEqual([])
})

test("gives an explicit plugin mention precedence over natural-language candidates", async () => {
  const calls: string[] = []
  const invocation = createNexumPluginInvocationPort({
    registry: { list: async () => [summary, shippingSummary] },
    activation: {
      activate: async (input) => {
        calls.push(`${input.pluginID}:${input.source}`)
        return { pluginID: input.pluginID, status: "active", source: input.source }
      },
    },
  })

  await expect(invocation.resolve({ sessionID: "session-1", text: "@crm 请查询物流" })).resolves.toEqual([
    { pluginID: "crm", status: "active", source: "explicit" },
  ])
  expect(calls).toEqual(["crm:explicit"])
})
