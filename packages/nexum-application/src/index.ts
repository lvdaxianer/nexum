/** Nexum 应用编排和 Runtime 组合器。 */

import {
  createNexumCodingLoop,
  createNexumModelProbePort,
  createNexumPermissionBroker,
  createNexumSessionService,
  createNexumRuntime,
  createNexumSkillInvocationPort,
  createMcpRegistry,
  McpError,
  normalizeMcpServerConfig,
  type EventSink,
  type NexumCodingLoop,
  type NexumInteractionStore,
  type NexumExecutionStore,
  type NexumModelConfigStore,
  type NexumSessionService,
  type NexumSkillInvocationPort,
  type NexumSkillRegistry,
  type HostPort,
  type McpPort,
  type McpConnector,
  type McpCredentialStore,
  type McpOAuthControlPort,
  type McpRegistry,
  type McpServerConfigStore,
  type McpServerConfig,
  type NexumLocalFunctionProvider,
  type MemoryPort,
  type ModelPort,
  type MessageStore,
  type NexumCapability,
  type NexumAgentMode,
  type NexumModelProbePort,
  type NexumProviderCatalogPort,
  type NexumPermissionBroker,
  type NexumPermissionPolicyStore,
  type NexumQuestionPort,
  type NexumRolePromptStore,
  type NexumSkillRegistrationStore,
  type NexumRuntime,
  type SessionStore,
} from "@nexum/core"
import { createNexumQuestionPort } from "./context.ts"
import { createNexumSkillRegistry } from "./skill-registry.ts"
import { createNexumLocalFunctionRegistry, type NexumLocalFunctionRegistry } from "./local-functions.ts"
import { createNexumToolRegistry } from "./local-tools.ts"
import { createNexumConfiguredCodingLoop } from "./configured-loop.ts"
import {
  createFilePersistence,
  createFilePermissionPolicyStore,
  createFileRolePromptStore,
  createFileMcpCredentialStore,
  createFileMcpServerConfigStore,
} from "@nexum/persistence-file"
import { createMemoryPersistence } from "@nexum/persistence-memory"
import { createSqlitePersistence } from "@nexum/persistence-sqlite"
import type { FilePersistenceOptions } from "@nexum/persistence-file"
import type { SqlitePersistenceOptions } from "@nexum/persistence-sqlite"
import type { NexumEventHub, NexumPersistence } from "@nexum/persistence"
import { join } from "node:path"
import {
  createLocalDirectoryValidator,
  createLocalHostAdapter,
  createMcpOAuthManager,
  createMcpOAuthProvider,
  createMcpSdkConnector,
  createOpenAICompatibleModelPort,
  createOpenAICompatibleProviderCatalog,
} from "@nexum/integrations"
import type { NexumSandboxOptions } from "@nexum/integrations"

export { createNexumQuestionPort } from "./context.ts"
export type { NexumQuestionPortOptions } from "./context.ts"
export type { NexumSandboxOptions } from "@nexum/integrations"
export { createNexumSkillRegistry } from "./skill-registry.ts"
export type { NexumSkillRegistryOptions } from "./skill-registry.ts"
export { createNexumLocalFunctionRegistry } from "./local-functions.ts"
export type { NexumLocalFunctionRegistry } from "./local-functions.ts"
export type { FilePersistenceOptions } from "@nexum/persistence-file"
export type { NexumPersistence } from "@nexum/persistence"
export { createNexumToolRegistry } from "./local-tools.ts"
export { createNexumConfiguredCodingLoop } from "./configured-loop.ts"
export { createNexumEventHub, NexumEventStoreError } from "@nexum/persistence"
export type { NexumEventHub, NexumEventHubOptions, NexumEventSubscriptionOptions } from "@nexum/persistence"

export type NexumRuntimeStorageOptions = FilePersistenceOptions & SqlitePersistenceOptions

export interface NexumRuntimeOptions extends NexumRuntimeStorageOptions {
  readonly defaultAgentMode?: NexumAgentMode
  readonly toolTimeoutMs?: number
  readonly shellTimeoutMs?: number
  readonly shellCleanupTimeoutMs?: number
  readonly model?: ModelPort
  readonly modelConfig?: NexumModelConfigStore
  readonly rolePrompt?: NexumRolePromptStore
  readonly sessions?: NexumSessionService
  readonly sessionStore?: SessionStore
  readonly messageStore?: MessageStore
  readonly executionStore?: NexumExecutionStore
  readonly interactionStore?: NexumInteractionStore
  readonly eventHub?: NexumEventHub
  readonly permissionBroker?: NexumPermissionBroker
  readonly permissionPolicyStore?: NexumPermissionPolicyStore
  readonly questionPort?: NexumQuestionPort
  readonly modelProbe?: NexumModelProbePort
  readonly providerCatalog?: NexumProviderCatalogPort
  readonly skillRegistry?: NexumSkillRegistry
  readonly skillInvocation?: NexumSkillInvocationPort
  readonly host?: HostPort
  readonly sandbox?: NexumSandboxOptions
  readonly memory?: MemoryPort
  readonly mcp?: McpPort
  readonly mcpOAuth?: McpOAuthControlPort
  readonly mcpConfigStore?: McpServerConfigStore
  readonly mcpCredentialStore?: McpCredentialStore
  readonly mcpConnector?: McpConnector
  readonly mcpServers?: readonly McpServerConfig[]
  readonly mcpReady?: Promise<void>
  readonly localFunctions?: readonly NexumLocalFunctionProvider[]
  readonly skillRoots?: readonly string[]
  readonly codingLoop?: NexumCodingLoop
  readonly capabilities?: readonly NexumCapability[]
  readonly persistence?: NexumPersistence
  readonly skillRegistrationStore?: NexumSkillRegistrationStore
}

export interface NexumDefaultRuntime extends NexumRuntime {
  readonly modelConfig: NexumModelConfigStore
  readonly rolePrompt: NexumRolePromptStore
  readonly sessionService: NexumSessionService
  readonly eventHub: NexumEventHub
  readonly messageStore: MessageStore
  readonly interactionStore?: NexumInteractionStore
  readonly skillRegistry: NexumSkillRegistry
  readonly skillInvocation: NexumSkillInvocationPort
  readonly permissionBroker: NexumPermissionBroker
  readonly questionPort: NexumQuestionPort
  readonly modelProbe: NexumModelProbePort
  readonly providerCatalog: NexumProviderCatalogPort
  readonly codingLoop: NexumCodingLoop
  readonly executionStore: NexumExecutionStore
  readonly localFunctions: NexumLocalFunctionRegistry
  readonly mcpReady?: Promise<void>
  readonly mcpConfigStore?: McpServerConfigStore
  readonly persistence: NexumPersistence
}

const MCP_OAUTH_REDIRECT_URL = "http://127.0.0.1/oauth/callback"

export function createEmbeddedRuntime(options: NexumRuntimeOptions = {}): NexumDefaultRuntime {
  const persistence = options.persistence ?? createMemoryPersistence()
  const executionStore = options.executionStore ?? persistence.executionStore
  const sessions = options.sessions ?? createNexumSessionService({
    store: options.sessionStore ?? persistence.sessionStore,
    executionStore,
    ...(options.defaultAgentMode ? { defaultAgentMode: options.defaultAgentMode } : {}),
    directoryValidator: createLocalDirectoryValidator(),
    ...(persistence.atomicDelete ? { atomicDelete: persistence.atomicDelete } : {}),
  })
  const modelConfig = options.modelConfig ?? persistence.modelConfig
  const rolePrompt = options.rolePrompt ?? (options.rolePromptFile
    ? createFileRolePromptStore({ filePath: options.rolePromptFile })
    : persistence.rolePrompt)
  const messageStore = options.messageStore ?? persistence.messageStore
  const interactionStore = options.interactionStore ?? persistence.interactionStore
  const eventHub = options.eventHub ?? persistence.eventHub
  const permissionPolicyStore = options.permissionPolicyStore ?? (options.permissionPolicyFile
    ? createFilePermissionPolicyStore({ filePath: options.permissionPolicyFile })
    : persistence.permissionPolicyStore)
  const permission = options.permissionBroker ?? createNexumPermissionBroker({
    ...(interactionStore ? { interactionStore } : {}),
    policyStore: permissionPolicyStore,
  })
  const question = options.questionPort ?? createNexumQuestionPort({ ...(interactionStore ? { interactionStore } : {}) })
  const skills = options.skillRegistry ?? createNexumSkillRegistry({
    roots: options.skillRoots ?? [],
    ...(options.skillRegistrationStore
      ? { registrationStore: options.skillRegistrationStore }
      : options.skillRegistryFile
        ? { filePath: options.skillRegistryFile }
        : { registrationStore: persistence.skillRegistrationStore }),
  })
  const skillInvocation = options.skillInvocation ?? createNexumSkillInvocationPort({ registry: skills, permission })
  const localFunctions = createNexumLocalFunctionRegistry(options.localFunctions ?? [])
  const host = options.host ?? createLocalHostAdapter()
  const tools = createNexumToolRegistry({
    sessions,
    host,
    sandbox: options.sandbox,
    shellTimeoutMs: options.shellTimeoutMs ?? options.toolTimeoutMs,
    shellCleanupTimeoutMs: options.shellCleanupTimeoutMs,
    skillRegistry: skills,
    localFunctions,
    ...(options.mcp ? { mcp: options.mcp } : {}),
  })
  const memory = options.memory ?? persistence.memory
  const loopOptions = {
    tool: tools.port,
    permission,
    sessions,
    events: eventHub,
    messageStore,
    executionStore,
    tools: tools.definitions,
    question,
    skills: skillInvocation,
    rolePrompt,
    toolTimeoutMs: options.toolTimeoutMs,
  }
  const model = options.model ?? createOpenAICompatibleModelPort({ config: modelConfig })
  const modelProbe = options.modelProbe ?? createNexumModelProbePort({ model })
  const providerCatalog = options.providerCatalog ?? createOpenAICompatibleProviderCatalog({ config: modelConfig })
  const loop = options.codingLoop ??
    (options.model
      ? createNexumCodingLoop({ ...loopOptions, model: options.model })
      : createNexumConfiguredCodingLoop({ ...loopOptions, modelConfig }))
  const mcpReady = options.mcp
    ? options.mcpReady
      ? options.mcpReady.then(() => tools.refresh())
      : tools.ready
    : undefined
  const runtimeLoop = mcpReady ? withMcpReady(loop, mcpReady) : loop
  const runtime = createNexumRuntime({
    sessions,
    loop: runtimeLoop,
    events: eventHub,
    host,
    memory,
    ...(options.mcp ? { mcp: options.mcp } : {}),
    ...(options.mcpOAuth ? { mcpOAuth: options.mcpOAuth } : {}),
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
  })
  return Object.assign(runtime, {
    modelConfig,
    rolePrompt,
    sessionService: sessions,
    eventHub,
    messageStore,
    interactionStore,
    skillRegistry: skills,
    skillInvocation,
    permissionBroker: permission,
    questionPort: question,
    modelProbe,
    providerCatalog,
    codingLoop: runtimeLoop,
    executionStore,
    localFunctions,
    persistence,
    ...(mcpReady ? { mcpReady } : {}),
    ...(options.mcpConfigStore ? { mcpConfigStore: options.mcpConfigStore } : {}),
  })
}

function withMcpReady(loop: NexumCodingLoop, ready: Promise<void>): NexumCodingLoop {
  return {
    ...loop,
    run: async (input) => {
      await ready
      return loop.run(input)
    },
  }
}

export function createLocalRuntime(options: NexumRuntimeOptions = {}): NexumDefaultRuntime {
  const dataDirectory = options.dataDirectory ?? join(process.cwd(), ".nexum")
  const persistence = options.persistence ?? createFilePersistence({
    dataDirectory,
    sessionFile: options.sessionFile,
    messageFile: options.messageFile,
    interactionFile: options.interactionFile,
    modelConfigFile: options.modelConfigFile,
    rolePromptFile: options.rolePromptFile,
    skillRegistryFile: options.skillRegistryFile,
    permissionPolicyFile: options.permissionPolicyFile,
    eventFile: options.eventFile,
    memoryFile: options.memoryFile,
    mcpConfigFile: options.mcpConfigFile,
    mcpCredentialFile: options.mcpCredentialFile,
    executionFile: options.executionFile,
  })
  const localMcp = options.mcp ? undefined : createLocalMcpRuntime({
    ...options,
    persistence,
    mcpConfigStore: options.mcpConfigStore ?? persistence.mcpConfigStore,
    mcpCredentialStore: options.mcpCredentialStore ?? persistence.mcpCredentialStore,
  })
  return createEmbeddedRuntime({
    ...options,
    persistence,
    ...(localMcp
      ? {
          mcp: localMcp.mcp,
          mcpOAuth: localMcp.mcpOAuth,
          mcpReady: localMcp.mcpReady,
          mcpConfigStore: localMcp.configStore,
        }
      : {}),
  })
}

export async function createSqliteRuntime(options: NexumRuntimeOptions = {}): Promise<NexumDefaultRuntime> {
  if (options.persistence) return createEmbeddedRuntime(options)
  const persistence = await createSqlitePersistence({
    databasePath: options.databasePath ?? join(options.dataDirectory ?? join(process.cwd(), ".nexum"), "nexum.db"),
  })
  const runtime = createEmbeddedRuntime({ ...options, persistence })
  const closeRuntime = runtime.close
  return Object.assign(runtime, {
    close: async () => {
      await closeRuntime()
      persistence.close()
    },
  })
}

function createLocalMcpRuntime(options: NexumRuntimeOptions): {
  readonly mcp: McpRegistry
  readonly mcpOAuth: McpOAuthControlPort
  readonly mcpReady: Promise<void>
  readonly configStore: McpServerConfigStore
} {
  const configStore = options.mcpConfigStore ?? createFileMcpServerConfigStore({ filePath: options.mcpConfigFile! })
  const credentialStore = options.mcpCredentialStore ?? createFileMcpCredentialStore({ filePath: options.mcpCredentialFile! })
  let mcp: McpRegistry
  let mcpOAuth: McpOAuthControlPort | undefined = options.mcpOAuth
  const connector = options.mcpConnector ?? createMcpSdkConnector({
    oauth: (config) => config.transport === "stdio" ? undefined : createMcpOAuthProvider({
      serverID: config.id,
      serverUrl: config.url,
      credentialStore,
      redirectUrl: MCP_OAUTH_REDIRECT_URL,
      onAuthorization: async () => {
        await mcpOAuth?.start({ serverID: config.id, serverUrl: config.url })
      },
    }),
    onAuthorizationRequired: async (config) => {
      if (config.transport === "stdio") return
      await mcpOAuth?.start({ serverID: config.id, serverUrl: config.url })
    },
  })
  mcpOAuth ??= createMcpOAuthManager({
    credentialStore,
    onAuthorized: async (serverID) => {
      await mcp.connect(serverID)
    },
  })
  mcp = createMcpRegistry({ connector })
  return {
    mcp,
    mcpOAuth,
    mcpReady: bootstrapMcpServers(mcp, configStore, options.mcpServers ?? []),
    configStore,
  }
}

async function bootstrapMcpServers(
  mcp: McpRegistry,
  configStore: McpServerConfigStore,
  initialConfigs: readonly McpServerConfig[],
): Promise<void> {
  try {
    const existing = await configStore.list()
    const storedByID = new Map(existing.map((config) => [config.id, config]))
    const initial = initialConfigs.map(normalizeMcpServerConfig)
    const initialByID = new Map<string, McpServerConfig>()
    initial.forEach((config) => {
      const previous = initialByID.get(config.id)
      if (previous && comparableMcpConfig(previous) !== comparableMcpConfig(config)) {
        throw new McpError("server_exists", `MCP Server 配置冲突: ${config.id}`)
      }
      initialByID.set(config.id, config)
    })
    initial.forEach((config) => {
      const stored = storedByID.get(config.id)
      if (stored) {
        if (comparableMcpConfig(stored) !== comparableMcpConfig(config)) {
          throw new McpError("server_exists", `MCP Server 配置冲突: ${config.id}`)
        }
      }
    })
    const missing = [...initialByID.values()].filter((config) => !storedByID.has(config.id))
    await missing.reduce((pending, config) => pending.then(() => configStore.save(config)), Promise.resolve())
    await restoreMcpServers(mcp, [...existing, ...missing])
  } catch (error) {
    if (error instanceof McpError && error.code === "runtime_closed") return
    throw error
  }
}

async function restoreMcpServers(mcp: McpRegistry, configs: readonly McpServerConfig[]): Promise<void> {
  try {
    await Promise.all(configs.map((config) => mcp.register(config)))
  } catch (error) {
    if (error instanceof McpError && error.code === "runtime_closed") return
    throw error
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (!isRecord(value)) return JSON.stringify(value)
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
}

function comparableMcpConfig(config: McpServerConfig): string {
  const value = { ...config } as Record<string, unknown>
  if (value.transport === "http") delete value.transport
  return stableStringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const createDefaultRuntime = createLocalRuntime

export type { EventSink }
