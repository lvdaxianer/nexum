import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createFileMcpCredentialStore,
  createFileMcpServerConfigStore,
  createInMemoryMcpCredentialStore,
  createInMemoryMcpServerConfigStore,
} from "../src/index.ts"
import type { McpOAuthCredential, McpServerConfig } from "@nexum/core"

const config: McpServerConfig = {
  id: "remote",
  name: "Remote MCP",
  url: "https://mcp.example.test/server",
  headers: { "X-Tenant": "tenant-a" },
}

const credential: McpOAuthCredential = {
  serverID: config.id,
  accessToken: "access-secret",
  refreshToken: "refresh-secret",
  expiresAt: Date.now() + 60_000,
  clientId: "client-id",
  clientSecret: "client-secret",
}

test("keeps MCP configuration separate from credentials and rejects secret headers", async () => {
  const configs = createInMemoryMcpServerConfigStore()
  const credentials = createInMemoryMcpCredentialStore()

  await configs.save(config)
  await credentials.save(credential)

  expect(await configs.get(config.id)).toEqual(config)
  expect(await credentials.get(config.id)).toEqual(credential)
  await expect(configs.save({ ...config, headers: { Authorization: "Bearer secret" } })).rejects.toMatchObject({
    code: "invalid_config",
  })
})

test("restores file-backed MCP configuration without credential material", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-mcp-store-"))
  try {
    const configPath = join(directory, "mcp-config.json")
    const credentialPath = join(directory, "mcp-credentials.json")
    const configs = createFileMcpServerConfigStore({ filePath: configPath })
    const credentials = createFileMcpCredentialStore({ filePath: credentialPath })

    await configs.save(config)
    await credentials.save(credential)

    const configText = await readFile(configPath, "utf8")
    expect(configText).toContain(config.url)
    expect(configText).not.toContain("access-secret")
    expect(configText).not.toContain("Authorization")
    expect(await createFileMcpServerConfigStore({ filePath: configPath }).get(config.id)).toEqual(config)
    expect(await createFileMcpCredentialStore({ filePath: credentialPath }).get(config.id)).toEqual(credential)
    expect((await stat(configPath)).mode & 0o777).toBe(0o600)
    expect((await stat(credentialPath)).mode & 0o777).toBe(0o600)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rejects invalid credential records before they reach storage", async () => {
  const credentials = createInMemoryMcpCredentialStore()

  await expect(credentials.save({ ...credential, accessToken: "" })).rejects.toMatchObject({ code: "invalid_credential" })
  await expect(credentials.save({ ...credential, expiresAt: 0 })).rejects.toMatchObject({ code: "invalid_credential" })
})
