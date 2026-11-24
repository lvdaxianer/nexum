import { randomUUID } from "node:crypto"
import type { McpCredentialStore, McpOAuthCredential } from "@nexum/core"
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
    state: () => randomUUID(),
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
