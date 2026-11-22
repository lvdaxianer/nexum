import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNexumPermissionBroker, createNexumSessionService } from "@nexum/core"
import { createNexumSkillRegistry } from "@nexum/adapters"
import { startNexumServer, type NexumServer } from "../src/index.ts"

const servers: NexumServer[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("exposes safe Skill management and activation routes", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-skill-api-"))
  temporaryDirectories.push(root)
  const skillRoot = join(root, "example-skill")
  await mkdir(skillRoot)
  await writeFile(
    join(skillRoot, "SKILL.md"),
    "---\nname: example-skill\ndescription: Example test skill\nversion: 0.1.0\n---\n\n# Test instructions\n",
  )
  const registry = createNexumSkillRegistry({ roots: [root] })
  await registry.refresh()
  const permission = createNexumPermissionBroker()
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory: root })
  const server = await startNexumServer({
    port: 0,
    sessionService: sessions,
    skillRegistry: registry,
    permissionBroker: permission,
  })
  servers.push(server)

  const listResponse = await fetch(new URL("/api/nexum/skills", server.url))
  const listBody = (await listResponse.json()) as { data: Array<Record<string, unknown>> }
  const detailResponse = await fetch(new URL("/api/nexum/skills/example-skill", server.url))
  const registerResponse = await fetch(new URL("/api/nexum/skills/register", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "example-skill" }),
  })
  const validateResponse = await fetch(new URL("/api/nexum/skills/validate", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "example-skill" }),
  })
  const activateRequest = fetch(
    new URL("/api/nexum/skills/example-skill/activate", server.url),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionID: session.sessionID, text: "执行 @example-skill" }),
    },
  )
  while ((await permission.list(session.sessionID)).length === 0) await Bun.sleep(1)
  const pending = (await permission.list(session.sessionID))[0]!
  await permission.reply({ sessionID: session.sessionID, requestID: pending.id, decision: "allow_once" })
  const activateResponse = await activateRequest

  expect(listResponse.status).toBe(200)
  expect(listBody.data[0]).toMatchObject({ id: "example-skill", status: "ready", fileCount: 1 })
  expect(JSON.stringify(listBody)).not.toContain(root)
  expect(detailResponse.status).toBe(200)
  expect(registerResponse.status).toBe(200)
  expect(validateResponse.status).toBe(200)
  expect(activateResponse.status).toBe(200)
  expect(await activateResponse.json()).toMatchObject({
    data: { skills: [{ id: "example-skill" }] },
  })
})
