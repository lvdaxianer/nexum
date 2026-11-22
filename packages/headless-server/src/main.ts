import {
  createFileInteractionStore,
  createFileMessageStore,
  createFileModelConfigStore,
  createFilePermissionPolicyStore,
  createFileSessionStore,
} from "@opencode/headless-core"
import { resolve } from "node:path"
import { createHeadlessEventHub } from "./events"
import { startHeadlessServer } from "./index"

/**
 * 启动 Headless Service 并注册优雅停止信号。
 *
 * @returns 服务停止后的完成 Promise
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
async function main(): Promise<void> {
  const dataDirectory = process.env.OPENCODE_HEADLESS_DATA_DIR ?? resolve(process.cwd(), ".headless")
  const sessionFile = process.env.OPENCODE_HEADLESS_SESSION_FILE ?? resolve(dataDirectory, "sessions.json")
  const modelConfigFile = process.env.OPENCODE_HEADLESS_MODEL_CONFIG_FILE ?? resolve(dataDirectory, "model-config.json")
  const eventFile = process.env.OPENCODE_HEADLESS_EVENT_FILE ?? resolve(dataDirectory, "events.json")
  const messageFile = process.env.OPENCODE_HEADLESS_MESSAGE_FILE ?? resolve(dataDirectory, "messages.json")
  const interactionFile = process.env.OPENCODE_HEADLESS_INTERACTION_FILE ?? resolve(dataDirectory, "interactions.json")
  const permissionPolicyFile =
    process.env.OPENCODE_HEADLESS_PERMISSION_POLICY_FILE ?? resolve(dataDirectory, "permission-policies.json")
  const sessionStore = createFileSessionStore({ filePath: sessionFile })
  const modelConfigStore = createFileModelConfigStore({ filePath: modelConfigFile })
  const messageStore = createFileMessageStore({ filePath: messageFile })
  const interactionStore = createFileInteractionStore({ filePath: interactionFile })
  const permissionPolicyStore = createFilePermissionPolicyStore({ filePath: permissionPolicyFile })
  const eventHub = createHeadlessEventHub({ filePath: eventFile })
  await eventHub.ready?.()
  const server = await startHeadlessServer({
    sessionStore,
    modelConfigStore,
    messageStore,
    interactionStore,
    permissionPolicyStore,
    eventHub,
  })
  process.stdout.write(`Headless Service listening at ${server.url}\n`)

  const shutdown = async (): Promise<void> => {
    await server.stop(true)
  }

  process.once("SIGINT", () => void shutdown())
  process.once("SIGTERM", () => void shutdown())
}

if (import.meta.main) void main()
