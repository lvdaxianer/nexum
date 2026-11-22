import { createLocalRuntime } from "@nexum/adapters"
import { startNexumServer } from "@nexum/server"
import { resolve } from "node:path"

const dataDirectory = process.env.NEXUM_TEST_DATA_DIR ?? resolve(import.meta.dir, "../.nexum-test")
const surfacesDirectory = resolve(import.meta.dir, "../../nexum-surfaces")
const runtime = createLocalRuntime({ dataDirectory })
const server = await startNexumServer({
  port: 4097,
  runtime,
  corsOrigins: ["http://127.0.0.1:5173", "http://localhost:5173"],
})
const surfaces = Bun.spawn(["bun", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], {
  cwd: surfacesDirectory,
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

let stopping = false
const stop = async (): Promise<void> => {
  if (stopping) return
  stopping = true
  surfaces.kill()
  await surfaces.exited
  await server.stop(true)
  await runtime.close()
}

process.once("SIGINT", () => void stop())
process.once("SIGTERM", () => void stop())

await surfaces.exited
await stop()
