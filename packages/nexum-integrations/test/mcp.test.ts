import { expect, test } from "bun:test"
import type { McpCredentialStore, McpOAuthCredential, McpServerConfig } from "@nexum/core"
import { createMcpOAuthProvider, createMcpSdkConnector } from "../src/index.ts"

const config: McpServerConfig = {
  id: "remote",
  name: "Remote MCP",
  url: "https://mcp.example.test/server",
}

test("uses the official MCP client for initialize, catalog discovery, calls, and close", async () => {
  const requests: string[] = []
  const connector = createMcpSdkConnector({
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; id?: number }
      requests.push(body.method)
      const result =
        body.method === "initialize"
          ? {
              protocolVersion: "2025-06-18",
              capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} },
              serverInfo: { name: "fixture", version: "1" },
            }
          : body.method === "tools/list"
            ? { tools: [{ name: "search", description: "Search", inputSchema: { type: "object" } }] }
            : body.method === "tools/call"
              ? { content: [{ type: "text", text: "done" }], isError: false }
              : body.method === "resources/list"
                ? { resources: [] }
                : body.method === "prompts/list"
                  ? { prompts: [] }
                  : undefined
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 })
      if (body.method === "notifications/cancelled") return new Response(null, { status: 202 })
      if (body.method === "DELETE") return new Response(null, { status: 200 })
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
        status: 200,
        headers: { "content-type": "application/json", "mcp-session-id": "fixture-session" },
      })
    },
  })

  const connection = await connector.connect(config, new AbortController().signal)

  expect(await connection.listTools()).toHaveLength(1)
  expect(await connection.listResources()).toEqual([])
  expect(await connection.listPrompts()).toEqual([])
  expect(await connection.callTool({ serverID: config.id, toolName: "search", input: {} })).toEqual({
    ok: true,
    output: "done",
  })
  await connection.close()
  expect(requests).toContain("initialize")
  expect(requests).toContain("tools/list")
  expect(requests).toContain("tools/call")
})

test("persists OAuth provider tokens and supports redirect URL fallback state", async () => {
  let credential: McpOAuthCredential | undefined
  const credentials: McpCredentialStore = {
    async get() {
      return credential
    },
    async save(next) {
      credential = next
    },
    async remove() {
      credential = undefined
    },
  }
  const redirects: URL[] = []
  const provider = createMcpOAuthProvider({
    serverID: config.id,
    serverUrl: config.url,
    credentialStore: credentials,
    redirectUrl: "http://127.0.0.1:43123/oauth/callback",
    onAuthorization: (url) => {
      redirects.push(url)
    },
  })

  await provider.saveClientInformation?.({ client_id: "client-id", issuer: "https://issuer.example.test" })
  await provider.saveTokens({ access_token: "access", token_type: "Bearer", refresh_token: "refresh", issuer: "https://issuer.example.test" })
  await provider.redirectToAuthorization(new URL("https://issuer.example.test/authorize?state=test"))

  expect(provider.redirectUrl?.toString()).toBe("http://127.0.0.1:43123/oauth/callback")
  expect(await provider.clientInformation()).toMatchObject({ client_id: "client-id" })
  expect(await provider.tokens()).toMatchObject({ access_token: "access", refresh_token: "refresh" })
  expect(redirects[0]?.toString()).toContain("/authorize")
})
