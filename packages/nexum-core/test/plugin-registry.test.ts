import { expect, test } from "bun:test"
import {
  validateNexumPluginManifest,
  type NexumPluginManifest,
  type NexumPluginRegistry,
  type NexumPluginStatus,
} from "../src/index.ts"

const validManifest = {
  id: "crm",
  version: "1.0.0",
  description: "处理客户、订单和工单问题",
  routing: {
    intents: ["customer", "order", "ticket"],
    examples: ["查询订单", "创建工单"],
    keywords: ["客户", "订单", "工单"],
  },
  exports: [
    { id: "customer-support", kind: "skill", description: "客服处理方法" },
    { id: "order.query", kind: "function", description: "查询订单" },
  ],
  permissions: ["customer.read", "order.read"],
} satisfies NexumPluginManifest

test("accepts a plugin manifest with routing metadata and exported capabilities", () => {
  expect(validateNexumPluginManifest(validManifest)).toEqual([])
})

test("rejects duplicate exported capability IDs", () => {
  const issues = validateNexumPluginManifest({
    ...validManifest,
    exports: [...validManifest.exports, validManifest.exports[0]],
  })

  expect(issues).toContainEqual({ code: "duplicate_export", path: "exports" })
})

test("exposes a registry contract for safe plugin summaries", () => {
  const registry: NexumPluginRegistry = {
    async list() {
      return []
    },
    async get() {
      return undefined
    },
    async register() {
      return {
        ...validManifest,
        status: "registered",
        diagnostics: [],
      }
    },
  }

  expect(registry).toHaveProperty("list")
  expect(registry).toHaveProperty("get")
  expect(registry).toHaveProperty("register")
})

test("exposes the activating lifecycle status", () => {
  const statuses: readonly NexumPluginStatus[] = ["registered", "activating", "active", "failed", "disabled"]

  expect(statuses).toContain("activating")
})
