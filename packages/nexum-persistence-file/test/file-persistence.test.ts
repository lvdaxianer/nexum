import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createFilePersistence } from "../src/index.ts"

let dataDirectory: string | undefined

afterEach(async () => {
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true })
  dataDirectory = undefined
})

test("文件组合在重启后恢复 Session", async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), "nexum-file-adapter-"))
  const session = {
    sessionID: "session-file",
    name: "file",
    directory: dataDirectory,
    status: "idle" as const,
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z",
  }

  const first = createFilePersistence({ dataDirectory })
  await first.sessionStore.save(session)
  const second = createFilePersistence({ dataDirectory })

  expect(await second.sessionStore.get(session.sessionID)).toEqual(session)
})
