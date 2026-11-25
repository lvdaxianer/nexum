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
  type EventSink,
  type NexumCodingLoop,
  type NexumInteractionStore,
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
  type MemoryPort,
  type ModelPort,
  type MessageStore,
  type NexumCapability,
  type NexumModelProbePort,
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
import { createNexumPluginRegistry } from "./plugin-registry.ts"
import { createNexumPluginRuntime } from "./plugin-runtime.ts"
import type { NexumApplicationPluginRegistry } from "./plugin-registry.ts"
import type { NexumPluginRuntime } from "./plugin-runtime.ts"
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
} from "@nexum/integrations"

export { createNexumQuestionPort } from "./context.ts"
export type { NexumQuestionPortOptions } from "./context.ts"
export { createNexumSkillRegistry } from "./skill-registry.ts"
export type { NexumSkillRegistryOptions } from "./skill-registry.ts"
export { createLocalPluginSource, createNexumPluginRegistry, NexumPluginLoaderError } from "./plugin-registry.ts"
export type {
  NexumApplicationPluginPackage,
  NexumApplicationPluginRegistry,
  NexumPluginLoaderErrorCode,
  NexumPluginRegistryOptions,
  NexumPluginSource,
  NexumPluginSourceCandidate,
} from "./plugin-registry.ts"
export { createNexumPluginRuntime, NexumPluginRuntimeError } from "./plugin-runtime.ts"
export type {
  NexumActivePlugin,
  NexumPluginEntrypoint,
  NexumPluginMount,
  NexumPluginMountContext,
  NexumPluginRuntime,
  NexumPluginRuntimeDiagnostic,
  NexumPluginRuntimeDiagnosticCode,
  NexumPluginRuntimeOptions,
} from "./plugin-runtime.ts"
export type { FilePersistenceOptions } from "@nexum/persistence-file"
export type { NexumPersistence } from "@nexum/persistence"
export { createNexumToolRegistry } from "./local-tools.ts"
export { createNexumConfiguredCodingLoop } from "./configured-loop.ts"
export { createNexumEventHub, NexumEventStoreError } from "@nexum/persistence"
export type { NexumEventHub, NexumEventHubOptions, NexumEventSubscriptionOptions } from "@nexum/persistence"

export type NexumRuntimeStorageOptions = FilePersistenceOptions & SqlitePersistenceOptions

export interface NexumRuntimeOptions extends NexumRuntimeStorageOptions {
  readonly toolTimeoutMs?: number
  readonly shellTimeoutMs?: number
  readonly shellCleanupTimeoutMs?: number
  readonly model?: ModelPort
  readonly modelConfig?: NexumModelConfigStore
  readonly rolePrompt?: NexumRolePromptStore
  readonly sessions?: NexumSessionService
  readonly sessionStore?: SessionStore
  readonly messageStore?: MessageStore
  readonly interactionStore?: NexumInteractionStore
  readonly eventHub?: NexumEventHub
  readonly permissionBroker?: NexumPermissionBroker
  readonly permissionPolicyStore?: NexumPermissionPolicyStore
  readonly questionPort?: NexumQuestionPort
  readonly modelProbe?: NexumModelProbePort
  readonly skillRegistry?: NexumSkillRegistry
  readonly skillInvocation?: NexumSkillInvocationPort
  readonly host?: HostPort
  readonly memory?: MemoryPort
  readonly mcp?: McpPort
  readonly mcpOAuth?: McpOAuthControlPort
  readonly mcpConfigStore?: McpServerConfigStore
  readonly mcpCredentialStore?: McpCredentialStore
  readonly mcpConnector?: McpConnector
  readonly mcpReady?: Promise<void>
  readonly skillRoots?: readonly string[]
  readonly pluginRoots?: readonly string[]
  readonly pluginRegistry?: NexumApplicationPluginRegistry
  readonly pluginRuntime?: NexumPluginRuntime
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
  readonly pluginRegistry: NexumApplicationPluginRegistry
  readonly pluginRuntime: NexumPluginRuntime
  readonly permissionBroker: NexumPermissionBroker
  readonly questionPort: NexumQuestionPort
  readonly modelProbe: NexumModelProbePort
  readonly codingLoop: NexumCodingLoop
  readonly mcpReady?: Promise<void>
  readonly mcpConfigStore?: McpServerConfigStore
  readonly persistence: NexumPersistence
}

const MCP_OAUTH_REDIRECT_URL = "http://127.0.0.1/oauth/callback"

export function createEmbeddedRuntime(options: NexumRuntimeOptions = {}): NexumDefaultRuntime {
  const persistence = options.persistence ?? createMemoryPersistence()
  const sessions = options.sessions ?? createNexumSessionService({
    store: options.sessionStore ?? persistence.sessionStore,
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
  const plugins = options.pluginRegistry ?? createNexumPluginRegistry({ roots: options.pluginRoots ?? [] })
  const pluginRuntime = options.pluginRuntime ?? createNexumPluginRuntime({ registry: plugins })
  const skillInvocation = options.skillInvocation ?? createNexumSkillInvocationPort({ registry: skills, permission })
  const host = options.host ?? createLocalHostAdapter()
  const tools = createNexumToolRegistry({
    sessions,
    host,
    shellTimeoutMs: options.shellTimeoutMs ?? options.toolTimeoutMs,
    shellCleanupTimeoutMs: options.shellCleanupTimeoutMs,
    skillRegistry: skills,
    ...(options.mcp ? { mcp: options.mcp } : {}),
  })
  const memory = options.memory ?? persistence.memory
  const loopOptions = {
    tool: tools.port,
    permission,
    sessions,
    events: eventHub,
    messageStore,
    tools: tools.definitions,
    question,
    skills: skillInvocation,
    rolePrompt,
    toolTimeoutMs: options.toolTimeoutMs,
  }
  const model = options.model ?? createOpenAICompatibleModelPort({ config: modelConfig })
  const modelProbe = options.modelProbe ?? createNexumModelProbePort({ model })
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
  const baseRuntime = createNexumRuntime({
    sessions,
    loop: runtimeLoop,
    events: eventHub,
    host,
    memory,
    ...(options.mcp ? { mcp: options.mcp } : {}),
    ...(options.mcpOAuth ? { mcpOAuth: options.mcpOAuth } : {}),
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
  })
  const closeRuntime = baseRuntime.close
  const runtime = Object.assign(baseRuntime, {
    close: async () => {
      await Promise.all([pluginRuntime.close(), closeRuntime()])
    },
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
    pluginRegistry: plugins,
    pluginRuntime,
    permissionBroker: permission,
    questionPort: question,
    modelProbe,
    codingLoop: runtimeLoop,
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
    oauth: (config) => createMcpOAuthProvider({
      serverID: config.id,
      serverUrl: config.url,
      credentialStore,
      redirectUrl: MCP_OAUTH_REDIRECT_URL,
      onAuthorization: async () => {
        await mcpOAuth?.start({ serverID: config.id, serverUrl: config.url })
      },
    }),
    onAuthorizationRequired: async (config) => {
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
  return { mcp, mcpOAuth, mcpReady: restoreMcpServers(mcp, configStore), configStore }
}

async function restoreMcpServers(mcp: McpRegistry, configStore: McpServerConfigStore): Promise<void> {
  try {
    const configs = await configStore.list()
    await Promise.all(configs.map((config) => mcp.register(config)))
  } catch (error) {
    if (error instanceof McpError && error.code === "runtime_closed") return
    throw error
  }
}

export const createDefaultRuntime = createLocalRuntime

export type { EventSink }
