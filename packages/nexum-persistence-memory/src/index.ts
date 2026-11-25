/** Nexum 进程内存储适配器。 */

export { createMemoryPersistence } from "@nexum/persistence/internal/composition"
export type { NexumPersistence } from "@nexum/persistence/internal/composition"
export { createInMemoryInteractionStore } from "@nexum/persistence/internal/interaction-store"
export { createInMemoryMemory } from "@nexum/persistence/internal/in-memory-memory"
export {
  createInMemoryMcpCredentialStore,
  createInMemoryMcpServerConfigStore,
} from "@nexum/persistence/internal/mcp-store"
export { createInMemoryMessageStore } from "@nexum/persistence/internal/message-store"
export { createNexumModelConfigStore } from "@nexum/persistence/internal/model-config"
export { createInMemoryPermissionPolicyStore } from "@nexum/persistence/internal/permission-policy-store"
export { createNexumRolePromptStore } from "@nexum/persistence/internal/role-prompt"
export { createInMemorySessionStore } from "@nexum/persistence/internal/session-store"
export { createInMemorySkillRegistrationStore } from "@nexum/persistence/internal/skill-registration-store"
