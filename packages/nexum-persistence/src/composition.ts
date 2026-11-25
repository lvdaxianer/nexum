/** Nexum Runtime 的持久化能力组合工厂。 */

import { join } from "node:path"
import type {
  McpCredentialStore,
  McpServerConfigStore,
  MemoryPort,
  MessageStore,
  NexumInteractionStore,
  NexumModelConfigStore,
  NexumPermissionPolicyStore,
  NexumRolePromptStore,
  NexumSkillRegistrationStore,
  SessionStore,
} from "@nexum/core"
import { createFileInteractionStore, createInMemoryInteractionStore } from "./interaction-store.ts"
import { createFileMemory } from "./memory.ts"
import { createInMemoryMemory } from "./in-memory-memory.ts"
import {
  createFileMcpCredentialStore,
  createFileMcpServerConfigStore,
  createInMemoryMcpCredentialStore,
  createInMemoryMcpServerConfigStore,
} from "./mcp-store.ts"
import { createFileMessageStore, createInMemoryMessageStore } from "./message-store.ts"
import { createFileModelConfigStore, createNexumModelConfigStore } from "./model-config.ts"
import { createFilePermissionPolicyStore, createInMemoryPermissionPolicyStore } from "./permission-policy-store.ts"
import { createFileRolePromptStore, createNexumRolePromptStore } from "./role-prompt.ts"
import { createFileSessionStore, createInMemorySessionStore } from "./session-store.ts"
import { createFileSkillRegistrationStore, createInMemorySkillRegistrationStore } from "./skill-registration-store.ts"
import { createNexumEventHub, type NexumEventHub } from "./events.ts"

/** Runtime 需要的完整持久化能力组合。 */
export interface NexumPersistence {
  readonly sessionStore: SessionStore
  readonly messageStore: MessageStore
  readonly interactionStore: NexumInteractionStore
  readonly modelConfig: NexumModelConfigStore
  readonly rolePrompt: NexumRolePromptStore
  readonly eventHub: NexumEventHub
  readonly permissionPolicyStore: NexumPermissionPolicyStore
  readonly memory: MemoryPort
  readonly skillRegistrationStore: NexumSkillRegistrationStore
  readonly mcpConfigStore: McpServerConfigStore
  readonly mcpCredentialStore: McpCredentialStore
}

/** 文件持久化组合的路径配置。 */
export interface FilePersistenceOptions {
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

/**
 * 创建本地文件持久化组合。
 *
 * @param options - 数据目录和可选文件路径
 * @returns 使用同一数据目录的文件 Store 组合
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
export function createFilePersistence(options: FilePersistenceOptions = {}): NexumPersistence {
  const directory = options.dataDirectory ?? join(process.cwd(), ".nexum")
  return {
    sessionStore: createFileSessionStore({ filePath: options.sessionFile ?? join(directory, "sessions.json") }),
    messageStore: createFileMessageStore({ filePath: options.messageFile ?? join(directory, "messages.json") }),
    interactionStore: createFileInteractionStore({ filePath: options.interactionFile ?? join(directory, "interactions.json") }),
    modelConfig: createFileModelConfigStore({ filePath: options.modelConfigFile ?? join(directory, "model-config.json") }),
    rolePrompt: createFileRolePromptStore({ filePath: options.rolePromptFile ?? join(directory, "role-prompt.json") }),
    eventHub: createNexumEventHub({ filePath: options.eventFile ?? join(directory, "events.json") }),
    permissionPolicyStore: createFilePermissionPolicyStore({
      filePath: options.permissionPolicyFile ?? join(directory, "permission-policies.json"),
    }),
    memory: createFileMemory({ filePath: options.memoryFile ?? join(directory, "memory.json") }),
    skillRegistrationStore: createFileSkillRegistrationStore({
      filePath: options.skillRegistryFile ?? join(directory, "skills.json"),
    }),
    mcpConfigStore: createFileMcpServerConfigStore({ filePath: options.mcpConfigFile ?? join(directory, "mcp-config.json") }),
    mcpCredentialStore: createFileMcpCredentialStore({
      filePath: options.mcpCredentialFile ?? join(directory, "mcp-credentials.json"),
    }),
  }
}

/**
 * 创建不落盘的进程内存储组合。
 *
 * @returns 每次创建都彼此隔离的内存 Store 组合
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
export function createMemoryPersistence(): NexumPersistence {
  return {
    sessionStore: createInMemorySessionStore(),
    messageStore: createInMemoryMessageStore(),
    interactionStore: createInMemoryInteractionStore(),
    modelConfig: createNexumModelConfigStore(),
    rolePrompt: createNexumRolePromptStore(),
    eventHub: createNexumEventHub(),
    permissionPolicyStore: createInMemoryPermissionPolicyStore(),
    memory: createInMemoryMemory(),
    skillRegistrationStore: createInMemorySkillRegistrationStore(),
    mcpConfigStore: createInMemoryMcpServerConfigStore(),
    mcpCredentialStore: createInMemoryMcpCredentialStore(),
  }
}
