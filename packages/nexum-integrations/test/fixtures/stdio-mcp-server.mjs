import { createInterface } from "node:readline"

const input = createInterface({ input: process.stdin })

input.on("line", (line) => {
  const request = JSON.parse(line)
  if (request.method === "initialize") {
    respond(request.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "fixture", version: "1.0.0" },
    })
    return
  }
  if (request.method === "notifications/initialized") return
  if (request.method === "tools/list") {
    respond(request.id, {
      tools: [{ name: "echo", description: "Echo input", inputSchema: { type: "object" } }],
    })
    return
  }
  if (request.method === "tools/call") {
    respond(request.id, { content: [{ type: "text", text: request.params.arguments.value }] })
  }
})

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`)
}
