import { randomUUID } from "node:crypto"
import { McpError, type McpCredentialStore, type McpOAuthAttempt, type McpOAuthControlPort, type McpOAuthCredential } from "@nexum/core"
import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js"

export interface McpOAuthProviderOptions {
  readonly serverID: string
  readonly serverUrl: string
  readonly credentialStore: McpCredentialStore
  readonly redirectUrl: string
  readonly clientMetadata?: OAuthClientMetadata
  readonly onAuthorization?: (url: URL) => void | Promise<void>
  readonly onState?: (state: string) => void | Promise<void>
}

export interface McpOAuthManagerOptions {
  readonly credentialStore: McpCredentialStore
  readonly fetch?: FetchLike
  readonly expiresInMs?: number
  readonly onAuthorized?: (serverID: string) => Promise<void>
}

interface McpOAuthAttemptRecord {
  readonly id: string
  readonly serverID: string
  readonly serverUrl: string
  readonly provider: OAuthClientProvider
  readonly redirectUrl: string
  readonly callbackServer: Bun.Server<unknown>
  readonly expiresAt: number
  state?: string
  deferClose?: boolean
  snapshot: McpOAuthAttempt
  timer: ReturnType<typeof setTimeout>
}

/** 管理一次性 OAuth 授权尝试，优先 loopback 回调，并保留 redirect paste 回退。 */
export function createMcpOAuthManager(options: McpOAuthManagerOptions): McpOAuthControlPort {
  const attempts = new Map<string, McpOAuthAttemptRecord>()
  const activeByServer = new Map<string, string>()
  let closed = false

  const manager: McpOAuthControlPort = {
    async start(input) {
      if (closed) throw new McpError("runtime_closed", "MCP OAuth 管理器已关闭")
      const activeID = activeByServer.get(input.serverID)
      if (activeID) {
        const active = attempts.get(activeID)
        if (active && (active.snapshot.status === "starting" || active.snapshot.status === "awaiting_user")) return active.snapshot
      }

      const id = randomUUID()
      const expiresAt = Date.now() + (options.expiresInMs ?? 10 * 60 * 1000)
      let record: McpOAuthAttemptRecord | undefined
      const callbackServer = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (request) => {
          const url = new URL(request.url)
          if (url.pathname !== "/oauth/callback" || !record) return new Response("Not Found", { status: 404 })
          record.deferClose = true
          if (url.searchParams.has("error")) {
            await manager.cancel(record.id)
            setTimeout(() => void record?.callbackServer.stop(true), 10)
            return new Response("MCP authorization cancelled. You may close this window.", { status: 400 })
          }
          try {
            await manager.complete(record.id, url.toString())
            setTimeout(() => void record?.callbackServer.stop(true), 10)
            return new Response("MCP authorization completed. You may close this window.", { status: 200 })
          } catch {
            setTimeout(() => void record?.callbackServer.stop(true), 10)
            return new Response("MCP authorization failed. You may close this window.", { status: 400 })
          }
        },
      })
      const redirectUrl = new URL("/oauth/callback", callbackServer.url).toString()
      const provider = createMcpOAuthProvider({
        serverID: input.serverID,
        serverUrl: input.serverUrl,
        credentialStore: options.credentialStore,
        redirectUrl,
        onState: (state) => {
          if (record) record.state = state
        },
        onAuthorization: (authorizationUrl) => {
          if (!record) return
          record.snapshot = {
            ...record.snapshot,
            status: "awaiting_user",
            authorizationUrl: authorizationUrl.toString(),
          }
        },
      })
      const timer = setTimeout(() => void expire(id), Math.max(1, expiresAt - Date.now()))
      record = {
        id,
        serverID: input.serverID,
        serverUrl: input.serverUrl,
        provider,
        redirectUrl,
        callbackServer,
        expiresAt,
        snapshot: { id, serverID: input.serverID, status: "starting", redirectUrl, expiresAt },
        timer,
      }
      attempts.set(id, record)
      activeByServer.set(input.serverID, id)
      void begin(record)
      await Bun.sleep(0)
      return record.snapshot
    },
    async status(attemptID) {
      const record = attempts.get(attemptID)
      if (!record) return undefined
      if (record.expiresAt <= Date.now() && (record.snapshot.status === "starting" || record.snapshot.status === "awaiting_user")) await expire(attemptID)
      return attempts.get(attemptID)?.snapshot
    },
    async complete(attemptID, redirectUrl) {
      const record = requireAttempt(attemptID)
      if (record.snapshot.status !== "starting" && record.snapshot.status !== "awaiting_user") {
        throw new McpError("connection_failed", "MCP OAuth 授权尝试已结束")
      }
      if (record.expiresAt <= Date.now()) {
        await expire(attemptID)
        throw new McpError("connection_failed", "MCP OAuth 授权已过期")
      }
      const redirect = parseRedirectUrl(redirectUrl)
      const code = redirect?.searchParams.get("code")
      const state = redirect?.searchParams.get("state")
      if (!redirect || !code || (record.state && state !== record.state)) {
        throw new McpError("connection_failed", "MCP OAuth redirect 无效")
      }
      record.snapshot = { ...record.snapshot, status: "starting", authorizationUrl: undefined }
      const result = await auth(record.provider, {
        serverUrl: record.serverUrl,
        authorizationCode: code,
        fetchFn: options.fetch,
      })
      if (result !== "AUTHORIZED") throw new McpError("needs_auth", "MCP OAuth 授权未完成")
      record.snapshot = { ...record.snapshot, status: "authorized" }
      await closeAttempt(record)
      await options.onAuthorized?.(record.serverID)
      return record.snapshot
    },
    async cancel(attemptID) {
      const record = attempts.get(attemptID)
      if (!record) return undefined
      if (record.snapshot.status === "authorized" || record.snapshot.status === "cancelled" || record.snapshot.status === "expired") return record.snapshot
      record.snapshot = { ...record.snapshot, status: "cancelled", authorizationUrl: undefined }
      await closeAttempt(record)
      return record.snapshot
    },
    async close() {
      if (closed) return
      closed = true
      await Promise.all([...attempts.values()].map((record) => manager.cancel(record.id)))
    },
  }

  return manager

  async function begin(record: McpOAuthAttemptRecord): Promise<void> {
    try {
      const result = await auth(record.provider, { serverUrl: record.serverUrl, fetchFn: options.fetch })
      if (record.snapshot.status === "cancelled" || record.snapshot.status === "expired") return
      if (result === "AUTHORIZED") {
        record.snapshot = { ...record.snapshot, status: "authorized" }
        await closeAttempt(record)
        await options.onAuthorized?.(record.serverID)
        return
      }
      if (record.snapshot.status === "starting") record.snapshot = { ...record.snapshot, status: "awaiting_user" }
    } catch (error) {
      if (record.snapshot.status === "cancelled" || record.snapshot.status === "expired") return
      const failure = new McpError("connection_failed", error instanceof Error ? error.message : "MCP OAuth 授权失败")
      record.snapshot = {
        ...record.snapshot,
        status: "failed",
        error: { code: failure.code, message: failure.message },
      }
      await closeAttempt(record)
    }
  }

  async function expire(attemptID: string): Promise<void> {
    const record = attempts.get(attemptID)
    if (!record || record.snapshot.status === "authorized" || record.snapshot.status === "cancelled" || record.snapshot.status === "expired") return
    record.snapshot = { ...record.snapshot, status: "expired", authorizationUrl: undefined }
    await closeAttempt(record)
  }

  async function closeAttempt(record: McpOAuthAttemptRecord): Promise<void> {
    clearTimeout(record.timer)
    if (activeByServer.get(record.serverID) === record.id) activeByServer.delete(record.serverID)
    if (record.deferClose) return
    await record.callbackServer.stop(true)
  }

  function requireAttempt(attemptID: string): McpOAuthAttemptRecord {
    const record = attempts.get(attemptID)
    if (!record) throw new McpError("server_not_found", "MCP OAuth 授权尝试不存在")
    return record
  }
}

function parseRedirectUrl(value: string): URL | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

/** 创建使用 Core CredentialStore 的 MCP OAuth provider。 */
export function createMcpOAuthProvider(options: McpOAuthProviderOptions): OAuthClientProvider {
  let cached: McpOAuthCredential | undefined
  let codeVerifier: string | undefined

  const provider: OAuthClientProvider = {
    get redirectUrl() {
      return options.redirectUrl
    },
    get clientMetadata() {
      return options.clientMetadata ?? defaultClientMetadata(options)
    },
    async state() {
      const state = randomUUID()
      await options.onState?.(state)
      return state
    },
    async clientInformation() {
      const credential = await loadCredential()
      if (!credential?.clientId) return undefined
      return {
        client_id: credential.clientId,
        ...(credential.clientSecret ? { client_secret: credential.clientSecret } : {}),
        ...(credential.issuer ? { issuer: credential.issuer } : {}),
      }
    },
    async saveClientInformation(clientInformation) {
      await saveClientInformation(clientInformation)
    },
    async tokens() {
      const credential = await loadCredential()
      if (!credential?.accessToken) return undefined
      return toOAuthTokens(credential)
    },
    async saveTokens(tokens) {
      const current = await loadCredential()
      const next: McpOAuthCredential = {
        serverID: options.serverID,
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : current?.refreshToken ? { refreshToken: current.refreshToken } : {}),
        ...(tokens.expires_in !== undefined ? { expiresAt: Date.now() + tokens.expires_in * 1000 } : current?.expiresAt ? { expiresAt: current.expiresAt } : {}),
        ...(tokens.token_type ? { tokenType: tokens.token_type } : current?.tokenType ? { tokenType: current.tokenType } : {}),
        ...(tokens.scope ? { scope: tokens.scope } : current?.scope ? { scope: current.scope } : {}),
        ...(tokens.issuer ? { issuer: tokens.issuer } : current?.issuer ? { issuer: current.issuer } : {}),
        ...(current?.clientId ? { clientId: current.clientId } : {}),
        ...(current?.clientSecret ? { clientSecret: current.clientSecret } : {}),
      }
      await options.credentialStore.save(next)
      cached = next
    },
    async redirectToAuthorization(url) {
      await options.onAuthorization?.(url)
    },
    saveCodeVerifier(value) {
      codeVerifier = value
    },
    codeVerifier() {
      if (!codeVerifier) throw new Error("MCP OAuth code verifier 不存在")
      return codeVerifier
    },
    async validateResourceURL(serverUrl, resource) {
      const expected = normalizeUrl(serverUrl)
      if (!resource) return expected
      if (normalizeUrl(resource).toString() !== expected.toString()) throw new Error("MCP OAuth resource 与 Server URL 不匹配")
      return expected
    },
    async invalidateCredentials(scope) {
      if (scope === "all") {
        cached = undefined
        codeVerifier = undefined
        await options.credentialStore.remove(options.serverID)
        return
      }
      if (scope === "verifier") {
        codeVerifier = undefined
        return
      }
      const current = await loadCredential()
      if (!current) return
      if (scope === "tokens") {
        const next = clientOnlyCredential(current)
        if (next) await options.credentialStore.save(next)
        else await options.credentialStore.remove(options.serverID)
        cached = next
        return
      }
      if (scope === "client") {
        const next = current.accessToken ? { serverID: current.serverID, accessToken: current.accessToken, ...(current.refreshToken ? { refreshToken: current.refreshToken } : {}) } : undefined
        if (next) await options.credentialStore.save(next)
        else await options.credentialStore.remove(options.serverID)
        cached = next
      }
    },
  }

  async function loadCredential(): Promise<McpOAuthCredential | undefined> {
    if (cached) return cached
    cached = await options.credentialStore.get(options.serverID)
    return cached
  }

  async function saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    const current = await loadCredential()
    const next: McpOAuthCredential = {
      serverID: options.serverID,
      ...(current?.accessToken ? { accessToken: current.accessToken } : {}),
      ...(current?.refreshToken ? { refreshToken: current.refreshToken } : {}),
      ...(current?.expiresAt ? { expiresAt: current.expiresAt } : {}),
      ...(current?.tokenType ? { tokenType: current.tokenType } : {}),
      ...(current?.scope ? { scope: current.scope } : {}),
      clientId: clientInformation.client_id,
      ...(clientInformation.client_secret ? { clientSecret: clientInformation.client_secret } : {}),
      ...(clientInformation.issuer ? { issuer: clientInformation.issuer } : {}),
    }
    await options.credentialStore.save(next)
    cached = next
  }

  return provider
}

function defaultClientMetadata(options: McpOAuthProviderOptions): OAuthClientMetadata {
  return {
    redirect_uris: [options.redirectUrl],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: "Nexum MCP Client",
  }
}

function toOAuthTokens(credential: McpOAuthCredential): OAuthTokens {
  if (!credential.accessToken) throw new Error("MCP OAuth access token 不存在")
  return {
    access_token: credential.accessToken,
    token_type: credential.tokenType ?? "Bearer",
    ...(credential.refreshToken ? { refresh_token: credential.refreshToken } : {}),
    ...(credential.expiresAt ? { expires_in: Math.max(0, Math.floor((credential.expiresAt - Date.now()) / 1000)) } : {}),
    ...(credential.scope ? { scope: credential.scope } : {}),
    ...(credential.issuer ? { issuer: credential.issuer } : {}),
  }
}

function clientOnlyCredential(credential: McpOAuthCredential): McpOAuthCredential | undefined {
  if (!credential.clientId) return undefined
  return {
    serverID: credential.serverID,
    clientId: credential.clientId,
    ...(credential.clientSecret ? { clientSecret: credential.clientSecret } : {}),
    ...(credential.issuer ? { issuer: credential.issuer } : {}),
  }
}

function normalizeUrl(value: string | URL): URL {
  return new URL(value.toString())
}
