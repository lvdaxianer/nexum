import type { ToolRequest } from "@nexum/core"

export default {
  async mount() {
    return {
      capabilities: ["customer-support", "order.query", "ticket-triage", "support.audit"],
      tools: [
        {
          definition: {
            name: "order.query",
            description: "查询订单状态",
            parameters: {
              type: "object",
              properties: { orderID: { type: "string" } },
              required: ["orderID"],
            },
          },
          async execute(request: ToolRequest) {
            return { ok: true, output: `订单 ${request.input.orderID} 当前状态：处理中` }
          },
        },
      ],
      async unmount() {},
    }
  },
}
