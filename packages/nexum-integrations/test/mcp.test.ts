import { expect, test } from "bun:test"
import type { McpCredentialStore, McpOAuthCredential, McpServerConfig } from "@nexum/core"
import { createMcpOAuthManager, createMcpOAuthProvider, createMcpSdkConnector } from "../src/index.ts"

const config: McpServerConfig = {
  id: "remote",
  name: "Remote MCP",
  url: "https://mcp.example.test/server",
}

test("uses the official MCP client for initialize, catalog discovery, calls, and close", async () => {
  const requests: string[] = []
  const connector = createMcpSdkConnector({
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
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

test("rejects an MCP connection when DNS resolves to a local address", async () => {
  const connector = createMcpSdkConnector({
    lookup: async () => [{ address: "127.0.0.1", family: 4 }],
  })

  await expect(connector.connect({ ...config, url: "https://public.example.test/mcp" }, new AbortController().signal)).rejects.toMatchObject({
    code: "invalid_config",
  })
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

test("completes an OAuth authorization through the loopback callback", async () => {
  let credential: McpOAuthCredential | undefined = {
    serverID: config.id,
    clientId: "client-id",
    issuer: "https://issuer.example.test",
  }
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
  const requests: string[] = []
  const manager = createMcpOAuthManager({
    credentialStore: credentials,
    fetch: async (input, init) => {
      const url = String(input)
      requests.push(url)
      if (url.includes("oauth-protected-resource")) {
        return new Response(JSON.stringify({ resource: config.url, authorization_servers: ["https://issuer.example.test"] }), { status: 200 })
      }
      if (url.endsWith("/.well-known/oauth-authorization-server")) {
        return new Response(JSON.stringify({
          issuer: "https://issuer.example.test",
          authorization_endpoint: "https://issuer.example.test/authorize",
          token_endpoint: "https://issuer.example.test/token",
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
        }), { status: 200 })
      }
      if (url.endsWith("/token")) {
        return new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", token_type: "Bearer", expires_in: 3600 }), { status: 200 })
      }
      if (init?.method === "POST") return new Response(JSON.stringify({}), { status: 200 })
      return new Response("not found", { status: 404 })
    },
  })

  const started = await manager.start({ serverID: config.id, serverUrl: config.url })
  let pending = started
  for (let attempt = 0; attempt < 100 && pending.status === "starting"; attempt += 1) {
    await Bun.sleep(1)
    pending = (await manager.status(started.id)) ?? pending
  }

  expect(pending.status).toBe("awaiting_user")
  expect(pending.authorizationUrl).toContain("https://issuer.example.test/authorize")
  const authorization = new URL(pending.authorizationUrl!)
  const callback = await fetch(new URL(`${pending.redirectUrl}?code=code-123&state=${authorization.searchParams.get("state")}`))
  const completed = await manager.status(started.id)

  expect(callback.status).toBe(200)
  expect(completed).toMatchObject({ status: "authorized", serverID: config.id })
  expect(credential).toMatchObject({ accessToken: "access", refreshToken: "refresh" })
  expect(requests.some((url) => url.endsWith("/token"))).toBe(true)
  await manager.close?.()
})

test("cancels and expires OAuth attempts without reviving them", async () => {
  const credentials: McpCredentialStore = {
    async get() {
      return undefined
    },
    async save() {},
    async remove() {},
  }
  const manager = createMcpOAuthManager({
    credentialStore: credentials,
    expiresInMs: 5,
    fetch: async () => {
      await Bun.sleep(50)
      return new Response("not found", { status: 404 })
    },
  })
  const cancelled = await manager.start({ serverID: "cancelled", serverUrl: config.url })
  expect((await manager.cancel(cancelled.id))?.status).toBe("cancelled")

  const expired = await manager.start({ serverID: "expired", serverUrl: config.url })
  await Bun.sleep(10)
  expect((await manager.status(expired.id))?.status).toBe("expired")
  await manager.close?.()
})
