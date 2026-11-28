import { createSqliteRuntime } from "@nexum/application"
import { startNexumServer } from "@nexum/server"
import { resolve } from "node:path"

const dataDirectory = process.env.NEXUM_TEST_DATA_DIR ?? resolve(import.meta.dir, "../.nexum-test")
const workbenchDirectory = resolve(import.meta.dir, "..")
const runtime = await createSqliteRuntime({ databasePath: resolve(dataDirectory, "nexum.db") })
const server = await startNexumServer({
  port: 4097,
  runtime,
  corsOrigins: ["http://127.0.0.1:5173", "http://localhost:5173"],
})
const workbench = Bun.spawn(["bun", "run", "dev:ui", "--", "--host", "127.0.0.1", "--port", "5173"], {
  cwd: workbenchDirectory,
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

let stopping = false
const stop = async (): Promise<void> => {
  if (stopping) return
  stopping = true
  workbench.kill()
  await workbench.exited
  await server.stop(true)
  await runtime.close()
}

process.once("SIGINT", () => void stop())
process.once("SIGTERM", () => void stop())

await workbench.exited
await stop()
