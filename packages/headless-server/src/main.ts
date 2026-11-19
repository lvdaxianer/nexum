import { startHeadlessServer } from "./index"

/**
 * 启动 Headless Service 并注册优雅停止信号。
 *
 * @returns 服务停止后的完成 Promise
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
async function main(): Promise<void> {
  const server = await startHeadlessServer()
  process.stdout.write(`Headless Service listening at ${server.url}\n`)

  const shutdown = async (): Promise<void> => {
    await server.stop(true)
  }

  process.once("SIGINT", () => void shutdown())
  process.once("SIGTERM", () => void shutdown())
}

if (import.meta.main) void main()
