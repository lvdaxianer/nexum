/** Nexum 本地文件存储适配器。 */

export { createFilePersistence } from "@nexum/persistence/internal/composition"
export type { FilePersistenceOptions, NexumPersistence } from "@nexum/persistence/internal/composition"
export { createFileInteractionStore } from "@nexum/persistence/internal/interaction-store"
export type { FileInteractionStoreOptions } from "@nexum/persistence/internal/interaction-store"
export { createFileMemory } from "@nexum/persistence/internal/memory"
export type { FileMemoryOptions } from "@nexum/persistence/internal/memory"
export {
  createFileMcpCredentialStore,
  createFileMcpServerConfigStore,
  McpStoreError,
} from "@nexum/persistence/internal/mcp-store"
export type {
  FileMcpCredentialStoreOptions,
  FileMcpServerConfigStoreOptions,
  McpStoreErrorCode,
} from "@nexum/persistence/internal/mcp-store"
export { createFileMessageStore } from "@nexum/persistence/internal/message-store"
export type { FileMessageStoreOptions } from "@nexum/persistence/internal/message-store"
export { createFileModelConfigStore } from "@nexum/persistence/internal/model-config"
export type { FileModelConfigStoreOptions } from "@nexum/persistence/internal/model-config"
export { createFilePermissionPolicyStore } from "@nexum/persistence/internal/permission-policy-store"
export type { FilePermissionPolicyStoreOptions } from "@nexum/persistence/internal/permission-policy-store"
export { createFileRolePromptStore } from "@nexum/persistence/internal/role-prompt"
export type { FileRolePromptStoreOptions } from "@nexum/persistence/internal/role-prompt"
export { createFileSessionStore } from "@nexum/persistence/internal/session-store"
export type { FileSessionStoreOptions } from "@nexum/persistence/internal/session-store"
export { createFileSkillRegistrationStore } from "@nexum/persistence/internal/skill-registration-store"
export type { FileSkillRegistrationStoreOptions } from "@nexum/persistence/internal/skill-registration-store"
