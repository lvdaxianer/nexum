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
  type NexumRuntime,
  type SessionStore,
} from "@nexum/core"
import { createNexumQuestionPort } from "./context.ts"
import { createNexumSkillRegistry } from "./skill-registry.ts"
import { createNexumToolRegistry } from "./local-tools.ts"
import { createNexumConfiguredCodingLoop } from "./configured-loop.ts"
import {
  createFileInteractionStore,
  createFileMessageStore,
  createFileModelConfigStore,
  createFileMemory,
  createFilePermissionPolicyStore,
  createFileRolePromptStore,
  createFileSessionStore,
  createInMemoryMemory,
  createFileMcpCredentialStore,
  createFileMcpServerConfigStore,
  createInMemoryMessageStore,
  createInMemoryPermissionPolicyStore,
  createInMemorySessionStore,
  createNexumEventHub,
  createNexumModelConfigStore,
  createNexumRolePromptStore,
  type NexumEventHub,
} from "@nexum/persistence"
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
export { createNexumToolRegistry } from "./local-tools.ts"
export { createNexumConfiguredCodingLoop } from "./configured-loop.ts"
export { createNexumEventHub, NexumEventStoreError } from "@nexum/persistence"
export type { NexumEventHub, NexumEventHubOptions, NexumEventSubscriptionOptions } from "@nexum/persistence"

export interface NexumRuntimeStorageOptions {
  readonly dataDirectory?: string
  readonly sessionFile?: string
  readonly messageFile?: string
  readonly interactionFile?: string
  readonly modelConfigFile?: string
  readonly rolePromptFile?: string
  readonly skillRegistryFile?: string
  readonly permissionPolicyFile?: string
  readonly eventFile?: string
  readonly memoryFile?: string
  readonly mcpConfigFile?: string
  readonly mcpCredentialFile?: string
}

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
  readonly codingLoop?: NexumCodingLoop
  readonly capabilities?: readonly NexumCapability[]
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
  readonly codingLoop: NexumCodingLoop
  readonly mcpReady?: Promise<void>
  readonly mcpConfigStore?: McpServerConfigStore
}

const MCP_OAUTH_REDIRECT_URL = "http://127.0.0.1/oauth/callback"

export function createEmbeddedRuntime(options: NexumRuntimeOptions = {}): NexumDefaultRuntime {
  const sessions = options.sessions ?? createNexumSessionService({
    store: options.sessionStore ?? createInMemorySessionStore(),
    directoryValidator: createLocalDirectoryValidator(),
  })
  const modelConfig = options.modelConfig ?? createNexumModelConfigStore()
  const rolePrompt = options.rolePrompt ?? (options.rolePromptFile
    ? createFileRolePromptStore({ filePath: options.rolePromptFile })
    : createNexumRolePromptStore())
  const messageStore = options.messageStore ?? createInMemoryMessageStore()
  const interactionStore = options.interactionStore
  const eventHub = options.eventHub ?? createNexumEventHub()
  const permissionPolicyStore = options.permissionPolicyStore ?? (options.permissionPolicyFile
    ? createFilePermissionPolicyStore({ filePath: options.permissionPolicyFile })
    : createInMemoryPermissionPolicyStore())
  const permission = options.permissionBroker ?? createNexumPermissionBroker({
    ...(interactionStore ? { interactionStore } : {}),
    policyStore: permissionPolicyStore,
  })
  const question = options.questionPort ?? createNexumQuestionPort({ ...(interactionStore ? { interactionStore } : {}) })
  const skills = options.skillRegistry ?? createNexumSkillRegistry({
    roots: options.skillRoots ?? [],
    ...(options.skillRegistryFile ? { filePath: options.skillRegistryFile } : {}),
  })
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
  const memory = options.memory ?? createInMemoryMemory()
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
    ...(interactionStore ? { interactionStore } : {}),
    skillRegistry: skills,
    skillInvocation,
    permissionBroker: permission,
    questionPort: question,
    modelProbe,
    codingLoop: runtimeLoop,
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
  const sessionFile = options.sessionFile ?? join(dataDirectory, "sessions.json")
  const messageFile = options.messageFile ?? join(dataDirectory, "messages.json")
  const interactionFile = options.interactionFile ?? join(dataDirectory, "interactions.json")
  const modelConfigFile = options.modelConfigFile ?? join(dataDirectory, "model-config.json")
  const rolePromptFile = options.rolePromptFile ?? join(dataDirectory, "role-prompt.json")
  const skillRegistryFile = options.skillRegistryFile ?? join(dataDirectory, "skills.json")
  const permissionPolicyFile = options.permissionPolicyFile ?? join(dataDirectory, "permission-policies.json")
  const eventFile = options.eventFile ?? join(dataDirectory, "events.json")
  const memoryFile = options.memoryFile ?? join(dataDirectory, "memory.json")
  const mcpConfigFile = options.mcpConfigFile ?? join(dataDirectory, "mcp-config.json")
  const mcpCredentialFile = options.mcpCredentialFile ?? join(dataDirectory, "mcp-credentials.json")
  const localMcp = options.mcp ? undefined : createLocalMcpRuntime({
    ...options,
    mcpConfigFile,
    mcpCredentialFile,
  })
  return createEmbeddedRuntime({
    ...options,
    sessionStore: options.sessionStore ?? createFileSessionStore({ filePath: sessionFile }),
    messageStore: options.messageStore ?? createFileMessageStore({ filePath: messageFile }),
    interactionStore: options.interactionStore ?? createFileInteractionStore({ filePath: interactionFile }),
    modelConfig: options.modelConfig ?? createFileModelConfigStore({ filePath: modelConfigFile }),
    rolePromptFile,
    skillRegistryFile,
    eventHub: options.eventHub ?? createNexumEventHub({ filePath: eventFile }),
    memory: options.memory ?? createFileMemory({ filePath: memoryFile }),
    permissionPolicyFile,
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
