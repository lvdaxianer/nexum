import type { NexumPersistence } from "@nexum/persistence"
import { openNexumSqliteDatabase, type NexumSqliteDatabase } from "./database.ts"
import { createSqliteEventHub } from "./events.ts"
import {
  createSqliteInteractionStore,
  createSqliteMcpCredentialStore,
  createSqliteMcpServerConfigStore,
  createSqliteMemory,
  createSqliteMessageStore,
  createSqliteModelConfigStore,
  createSqlitePermissionPolicyStore,
  createSqliteRolePromptStore,
  createSqliteSessionStore,
  createSqliteSkillRegistrationStore,
} from "./store.ts"

export interface SqlitePersistenceOptions {
  readonly databasePath?: string
}

export interface SqlitePersistence extends NexumPersistence {
  readonly databasePath: string
  readonly close: () => void
}

export async function createSqlitePersistence(options: SqlitePersistenceOptions = {}): Promise<SqlitePersistence> {
  const database = await openNexumSqliteDatabase(options.databasePath ?? ".nexum/nexum.db")
  return composeSqlitePersistence(database)
}

function composeSqlitePersistence(database: NexumSqliteDatabase): SqlitePersistence {
  const eventHub = createSqliteEventHub(database.database)
  return {
    databasePath: database.databasePath,
    close: database.close,
    sessionStore: createSqliteSessionStore(database.database),
    messageStore: createSqliteMessageStore(database.database),
    interactionStore: createSqliteInteractionStore(database.database),
    modelConfig: createSqliteModelConfigStore(database.database),
    rolePrompt: createSqliteRolePromptStore(database.database),
    eventHub,
    permissionPolicyStore: createSqlitePermissionPolicyStore(database.database),
    memory: createSqliteMemory(database.database),
    skillRegistrationStore: createSqliteSkillRegistrationStore(database.database),
    mcpConfigStore: createSqliteMcpServerConfigStore(database.database),
    mcpCredentialStore: createSqliteMcpCredentialStore(database.database),
    atomicDelete: async (sessionID) => {
      database.transaction(() => {
        database.database.query("DELETE FROM nexum_record WHERE (namespace IN ('session', 'message') AND record_key = $sessionID) OR (namespace = 'interaction' AND json_extract(payload, '$.sessionID') = $sessionID)").run({ $sessionID: sessionID })
        void eventHub.delete(sessionID)
      })
    },
  }
}
