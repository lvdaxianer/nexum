import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNexumEventHub, createNexumSkillRegistry } from "@nexum/application"
import { createNexumPermissionBroker, createNexumSessionService } from "./test-ports.ts"
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
  const registry = createNexumSkillRegistry({ roots: [root], filePath: join(root, ".nexum", "skills.json") })
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
    body: JSON.stringify({ address: skillRoot }),
  })
  const validateResponse = await fetch(new URL("/api/nexum/skills/validate", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "example-skill" }),
  })
  const activateRequest = fetch(new URL("/api/nexum/skills/example-skill/activate", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionID: session.sessionID, text: "执行 @example-skill" }),
  })
  while ((await permission.list(session.sessionID)).length === 0) await Bun.sleep(1)
  const pending = (await permission.list(session.sessionID))[0]!
  await permission.reply({ sessionID: session.sessionID, requestID: pending.id, decision: "allow_once" })
  const activateResponse = await activateRequest
  const unregisterResponse = await fetch(new URL("/api/nexum/skills/example-skill", server.url), { method: "DELETE" })
  const removeResponse = await fetch(new URL("/api/nexum/skills/example-skill/source", server.url), { method: "DELETE" })

  expect(listResponse.status).toBe(200)
  expect(listBody.data[0]).toMatchObject({ id: "example-skill", status: "ready", fileCount: 1, sourceKind: "builtin" })
  expect(JSON.stringify(listBody)).not.toContain(root)
  expect(detailResponse.status).toBe(200)
  expect(registerResponse.status).toBe(200)
  expect(validateResponse.status).toBe(200)
  expect(activateResponse.status).toBe(200)
  expect(unregisterResponse.status).toBe(409)
  expect(await unregisterResponse.json()).toMatchObject({ errorCode: "NEXUM_SKILL_BUILTIN" })
  expect(removeResponse.status).toBe(200)
  expect(await removeResponse.json()).toMatchObject({ data: { id: "example-skill", deleted: true, sourceDeleted: true } })
  expect(await Bun.file(join(skillRoot, "SKILL.md")).exists()).toBe(false)
  expect(await activateResponse.json()).toMatchObject({
    data: { skills: [{ id: "example-skill" }] },
  })
})

test("unregisters an external Skill without deleting its source", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-skill-external-api-"))
  temporaryDirectories.push(root)
  const skillRoot = join(root, "external-skill")
  await mkdir(skillRoot)
  await writeFile(join(skillRoot, "SKILL.md"), "---\nname: external-skill\ndescription: external\n---\n")
  const registry = createNexumSkillRegistry({ roots: [], filePath: join(root, ".nexum", "skills.json") })
  const server = await startNexumServer({ port: 0, skillRegistry: registry })
  servers.push(server)

  await fetch(new URL("/api/nexum/skills/register", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: skillRoot }),
  })
  const removeResponse = await fetch(new URL("/api/nexum/skills/external-skill/source", server.url), { method: "DELETE" })
  const response = await fetch(new URL("/api/nexum/skills/external-skill", server.url), { method: "DELETE" })

  expect(removeResponse.status).toBe(409)
  expect(await removeResponse.json()).toMatchObject({ errorCode: "NEXUM_SKILL_SOURCE_NOT_REMOVABLE" })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ data: { id: "external-skill", deleted: true } })
  expect(await Bun.file(join(skillRoot, "SKILL.md")).exists()).toBe(true)
})

test("keeps a built-in registration when source deletion fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-skill-delete-failure-api-"))
  temporaryDirectories.push(root)
  const skillRoot = join(root, "failed-delete-skill")
  await mkdir(skillRoot)
  await writeFile(join(skillRoot, "SKILL.md"), "---\nname: failed-delete-skill\ndescription: failure\n---\n")
  const registry = createNexumSkillRegistry({ roots: [root], filePath: join(root, ".nexum", "skills.json") })
  const server = await startNexumServer({ port: 0, skillRegistry: registry })
  servers.push(server)

  await rm(skillRoot, { recursive: true })
  const response = await fetch(new URL("/api/nexum/skills/failed-delete-skill/source", server.url), { method: "DELETE" })
  const listResponse = await fetch(new URL("/api/nexum/skills", server.url))

  expect(response.status).toBe(500)
  expect(await response.json()).toMatchObject({ errorCode: "NEXUM_SKILL_SOURCE_DELETE_FAILED" })
  expect(await listResponse.json()).toMatchObject({ data: [{ id: "failed-delete-skill", sourceKind: "builtin" }] })
})

test("revalidates the registered source before returning validation status", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-skill-validate-"))
  temporaryDirectories.push(root)
  const skillRoot = join(root, "mutable-skill")
  await mkdir(skillRoot)
  const skillFile = join(skillRoot, "SKILL.md")
  await writeFile(skillFile, "---\nname: mutable-skill\ndescription: valid\n---\n")
  const registry = createNexumSkillRegistry({ roots: [], filePath: join(root, ".nexum", "skills.json") })
  const server = await startNexumServer({ port: 0, skillRegistry: registry })
  servers.push(server)

  const registerResponse = await fetch(new URL("/api/nexum/skills/register", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: skillRoot }),
  })
  expect(registerResponse.status).toBe(200)

  await writeFile(skillFile, "---\nname: mutable-skill\n---\n")
  const validateResponse = await fetch(new URL("/api/nexum/skills/validate", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "mutable-skill" }),
  })
  const body = (await validateResponse.json()) as { data: { valid: boolean; data: Array<Record<string, unknown>> } }

  expect(body.data.valid).toBe(false)
  expect(body.data.data[0]).toMatchObject({ id: "mutable-skill", status: "invalid" })
})

test("publishes a safe Skill registry event to the Session stream", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-skill-event-"))
  temporaryDirectories.push(root)
  const skillRoot = join(root, "event-skill")
  await mkdir(skillRoot)
  await writeFile(skillRoot + "/SKILL.md", "---\nname: event-skill\ndescription: event test\n---\n")
  const registry = createNexumSkillRegistry({ roots: [], filePath: join(root, ".nexum", "skills.json") })
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory: root })
  const eventHub = createNexumEventHub()
  const server = await startNexumServer({ port: 0, sessionService: sessions, eventHub, skillRegistry: registry })
  servers.push(server)

  const eventsResponse = await fetch(new URL(`/api/nexum/session/${session.sessionID}/events`, server.url))
  const reader = eventsResponse.body?.getReader()
  if (!reader) throw new Error("SSE 响应缺少可读流")
  await reader.read()
  const nextEvent = readSsePayload(reader)
  const response = await fetch(new URL("/api/nexum/skills/register", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: skillRoot }),
  })
  const event = await Promise.race([nextEvent, Bun.sleep(50).then(() => undefined)])

  await reader.cancel()
  await nextEvent.catch(() => undefined)
  expect(response.status).toBe(200)
  expect(event).toMatchObject({
    type: "skill.updated",
    sessionID: session.sessionID,
    data: { change: "registered", skillID: "event-skill", status: "ready" },
  })
  expect(JSON.stringify(event)).not.toContain(skillRoot)
})

async function readSsePayload(
  reader: Pick<ReadableStreamDefaultReader<Uint8Array>, "read">,
): Promise<Record<string, unknown>> {
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) throw new Error("SSE 流提前关闭")
    buffer += decoder.decode(chunk.value, { stream: true })
    const frameEnd = buffer.indexOf("\n\n")
    if (frameEnd === -1) continue
    const frame = buffer.slice(0, frameEnd)
    buffer = buffer.slice(frameEnd + 2)
    const dataLine = frame.split("\n").find((line) => line.startsWith("data: "))
    if (!dataLine) continue
    return JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>
  }
}

test("publishes refresh, validation, and unregister Skill events in order", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-skill-event-sequence-"))
  temporaryDirectories.push(root)
  const skillRoot = join(root, "event-sequence-skill")
  await mkdir(skillRoot)
  const skillFile = join(skillRoot, "SKILL.md")
  await writeFile(skillFile, "---\nname: event-sequence-skill\ndescription: event test\n---\n")
  const registry = createNexumSkillRegistry({ roots: [], filePath: join(root, ".nexum", "skills.json") })
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory: root })
  const eventHub = createNexumEventHub()
  const server = await startNexumServer({ port: 0, sessionService: sessions, eventHub, skillRegistry: registry })
  servers.push(server)

  const stream = eventHub.subscribe(session.sessionID)[Symbol.asyncIterator]()
  const next = () => stream.next()
  await fetch(new URL("/api/nexum/skills/register", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: skillRoot }),
  })
  await writeFile(skillFile, "---\nname: event-sequence-skill\ndescription: changed\n---\n")
  await fetch(new URL("/api/nexum/skills/refresh", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "event-sequence-skill" }),
  })
  await fetch(new URL("/api/nexum/skills/validate", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "event-sequence-skill" }),
  })
  await fetch(new URL("/api/nexum/skills/event-sequence-skill", server.url), { method: "DELETE" })

  const events = [(await next()).value, (await next()).value, (await next()).value, (await next()).value]
  await stream.return?.()

  expect(events).toMatchObject([
    {
      type: "skill.updated",
      sequence: 1,
      data: { change: "registered", skillID: "event-sequence-skill", status: "ready" },
    },
    {
      type: "skill.updated",
      sequence: 2,
      data: { change: "refreshed", skillID: "event-sequence-skill", status: "ready" },
    },
    {
      type: "skill.updated",
      sequence: 3,
      data: { change: "validated", skillID: "event-sequence-skill", status: "ready" },
    },
    { type: "skill.updated", sequence: 4, data: { change: "unregistered", skillID: "event-sequence-skill" } },
  ])
  expect(JSON.stringify(events)).not.toContain(root)
})
