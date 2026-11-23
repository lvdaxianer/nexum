import {
  createFileInteractionStore,
  createFileMessageStore,
  createFileModelConfigStore,
  createFilePermissionPolicyStore,
  createFileSessionStore,
} from "@nexum/adapters"
import { resolve } from "node:path"
import { createNexumEventHub } from "@nexum/adapters"
import { startNexumServer } from "./index"

/**
 * 启动 Nexum Service 并注册优雅停止信号。
 *
 * @returns 服务停止后的完成 Promise
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
async function main(): Promise<void> {
  const dataDirectory = process.env.NEXUM_DATA_DIR ?? resolve(process.cwd(), ".nexum")
  const sessionFile = process.env.NEXUM_SESSION_FILE ?? resolve(dataDirectory, "sessions.json")
  const modelConfigFile = process.env.NEXUM_MODEL_CONFIG_FILE ?? resolve(dataDirectory, "model-config.json")
  const skillRegistryFile = process.env.NEXUM_SKILL_REGISTRY_FILE ?? resolve(dataDirectory, "skills.json")
  const eventFile = process.env.NEXUM_EVENT_FILE ?? resolve(dataDirectory, "events.json")
  const messageFile = process.env.NEXUM_MESSAGE_FILE ?? resolve(dataDirectory, "messages.json")
  const interactionFile = process.env.NEXUM_INTERACTION_FILE ?? resolve(dataDirectory, "interactions.json")
  const permissionPolicyFile =
    process.env.NEXUM_PERMISSION_POLICY_FILE ?? resolve(dataDirectory, "permission-policies.json")
  const sessionStore = createFileSessionStore({ filePath: sessionFile })
  const modelConfigStore = createFileModelConfigStore({ filePath: modelConfigFile })
  const messageStore = createFileMessageStore({ filePath: messageFile })
  const interactionStore = createFileInteractionStore({ filePath: interactionFile })
  const permissionPolicyStore = createFilePermissionPolicyStore({ filePath: permissionPolicyFile })
  const eventHub = createNexumEventHub({ filePath: eventFile })
  await eventHub.ready?.()
  const server = await startNexumServer({
    sessionStore,
    modelConfigStore,
    skillRegistryFile,
    messageStore,
    interactionStore,
    permissionPolicyStore,
    eventHub,
  })
  process.stdout.write(`Nexum Service listening at ${server.url}\n`)

  const shutdown = async (): Promise<void> => {
    await server.stop(true)
  }

  process.once("SIGINT", () => void shutdown())
  process.once("SIGTERM", () => void shutdown())
}

if (import.meta.main) void main()
