import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { NexumInteractionRecord } from "../src/index.ts"
import { createFileInteractionStore } from "@nexum/adapters"

test("serializes concurrent interaction writes and redacts sensitive text", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-interaction-store-"))
  const filePath = join(root, "interactions.json")
  const store = createFileInteractionStore({ filePath })
  const base = {
    status: "pending" as const,
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
    kind: "permission" as const,
    action: "shell",
  }
  await Promise.all(
    ["one", "two"].map((requestID) =>
      store.save({
        ...base,
        requestID,
        sessionID: requestID,
        resource: `curl -H 'Authorization: Bearer secret-${requestID}'`,
      }),
    ),
  )

  expect(await store.list()).toHaveLength(2)
  const persisted = await Bun.file(filePath).text()
  expect(persisted).not.toContain("secret-one")
  expect(persisted).not.toContain("secret-two")
  await rm(root, { recursive: true, force: true })
})

test("rejects corrupt interaction files without replacing them", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-interaction-store-corrupt-"))
  const filePath = join(root, "interactions.json")
  await Bun.write(filePath, "not-json")
  const store = createFileInteractionStore({ filePath })

  await expect(store.list()).rejects.toMatchObject({ code: "invalid_file" })
  expect(await Bun.file(filePath).text()).toBe("not-json")
  await rm(root, { recursive: true, force: true })
})

test("marks only pending records as orphaned when reopened", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-interaction-store-recovery-"))
  const filePath = join(root, "interactions.json")
  const store = createFileInteractionStore({ filePath })
  const records: NexumInteractionRecord[] = [
    {
      requestID: "pending",
      sessionID: "session",
      status: "pending",
      createdAt: "2026-11-22T00:00:00.000Z",
      updatedAt: "2026-11-22T00:00:00.000Z",
      kind: "permission",
      action: "shell",
      resource: "pwd",
    },
    {
      requestID: "orphaned",
      sessionID: "session",
      status: "orphaned",
      createdAt: "2026-11-22T00:00:01.000Z",
      updatedAt: "2026-11-22T00:00:01.000Z",
      kind: "permission",
      action: "shell",
      resource: "ls",
    },
  ]
  await Promise.all(records.map((record) => store.save(record)))

  const reopened = createFileInteractionStore({ filePath })
  expect(await reopened.list()).toEqual([
    expect.objectContaining({ requestID: "pending", status: "orphaned" }),
    expect.objectContaining({ requestID: "orphaned", status: "orphaned" }),
  ])
  await rm(root, { recursive: true, force: true })
})
