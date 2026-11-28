import { expect, test } from "bun:test"
import {
  createNexumSkillInvocationPort,
  type EventSink,
  type NexumSkillRegistry,
  type ModelPort,
  type PermissionPort,
  type ToolPort,
} from "../src/index.ts"
import { createNexumCodingLoop, createNexumPermissionBroker, createNexumSessionService } from "./test-ports.ts"

function registryFor(ids: readonly string[]): NexumSkillRegistry {
  const packages = new Map(
    ids.map((id) => [
      id,
      {
        id,
        name: id === "example-skill" ? "Example Skill" : id,
        description: "test skill",
        version: "0.1.0",
        digest: `digest-${id}`,
        fileCount: 1,
        files: ["SKILL.md"],
        status: "ready" as const,
        diagnostics: [],
        read: async (relativePath: string) => {
          expect(relativePath).toBe("SKILL.md")
          return `# ${id}\n\nSkill instructions for ${id}`
        },
      },
    ]),
  )
  return {
    async register() {
      return [...packages.values()][0]!
    },
    async refresh() {},
    async list() {
      return [...packages.values()]
    },
    async get(id) {
      return packages.get(id)
    },
    async unregister() {},
    async remove() {},
  }
}

test("parses @skill, preserves mention range, injects SKILL.md, and deduplicates", async () => {
  const requests: Array<{ action: string; resource: string }> = []
  const permission: PermissionPort = {
    async evaluate(request) {
      requests.push({ action: request.action, resource: request.resource })
      return "allow"
    },
  }
  const invocation = createNexumSkillInvocationPort({
    registry: registryFor(["example-skill"]),
    permission,
  })

  const prompt = await invocation.resolve({ sessionID: "session-1", text: "请执行 @example-skill 再执行 @example-skill" })

  expect(prompt.skills).toHaveLength(1)
  expect(prompt.skills[0]).toMatchObject({
    id: "example-skill",
    name: "Example Skill",
    mention: { start: 4, end: 18, text: "@example-skill" },
  })
  expect(prompt.systemMessages[0]).toMatchObject({
    role: "system",
    sourceID: "skill:example-skill",
  })
  expect(prompt.systemMessages[0]?.content).toContain("Skill instructions for example-skill")
  expect(requests).toEqual([{ action: "skill.use", resource: "example-skill" }])
})

test("returns stable not-found and permission-denied invocation errors", async () => {
  const permission: PermissionPort = { async evaluate() { return "deny" } }
  const invocation = createNexumSkillInvocationPort({ registry: registryFor(["known-skill"]), permission })

  await expect(invocation.resolve({ sessionID: "session-1", text: "@missing-skill" })).rejects.toMatchObject({
    code: "skill_not_found",
    skillID: "missing-skill",
  })
  await expect(invocation.resolve({ sessionID: "session-1", text: "@known-skill" })).rejects.toMatchObject({
    code: "skill_permission_denied",
    skillID: "known-skill",
  })
})

test("attaches Skill system message before the user message and publishes activation", async () => {
  const directory = process.cwd()
  const sessions = createNexumSessionService({ directoryValidator: { async validate() {} } })
  const session = await sessions.create({ directory })
  const prompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  const events: string[] = []
  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input)
      yield { type: "completed" }
    },
  }
  const tool: ToolPort = { async execute() { return { ok: true, output: "unused" } } }
  const permission: PermissionPort = { async evaluate() { return "allow" } }
  const eventSink: EventSink = { async publish(event) { events.push(event.type) } }
  const skills = createNexumSkillInvocationPort({ registry: registryFor(["known-skill"]), permission })

  await createNexumCodingLoop({ model, tool, permission, sessions, events: eventSink, skills }).run({
    sessionID: session.sessionID,
    text: "执行 @known-skill",
  })

  expect(prompts[0]?.messages?.slice(0, 2)).toEqual([
    expect.objectContaining({ role: "system", sourceID: "skill:known-skill" }),
    { role: "user", content: "执行 @known-skill" },
  ])
  expect(events).toEqual(["skill.activated", "model.attempt", "session.completed", "run.settled"])
})

test("cancels a Skill activation waiting for permission", async () => {
  const directory = process.cwd()
  const sessions = createNexumSessionService({ directoryValidator: { async validate() {} } })
  const session = await sessions.create({ directory })
  const broker = createNexumPermissionBroker()
  let modelCalled = false
  const model: ModelPort = {
    async *prompt() {
      modelCalled = true
      yield { type: "completed" }
    },
  }
  const tool: ToolPort = { async execute() { return { ok: true, output: "unused" } } }
  const events: string[] = []
  const eventSink: EventSink = { async publish(event) { events.push(event.type) } }
  const skills = createNexumSkillInvocationPort({ registry: registryFor(["known-skill"]), permission: broker })
  const loop = createNexumCodingLoop({ model, tool, permission: broker, sessions, events: eventSink, skills })
  const run = loop.run({ sessionID: session.sessionID, text: "执行 @known-skill" })

  while ((await broker.list(session.sessionID)).length === 0) await Bun.sleep(1)
  await loop.cancel(session.sessionID)
  const completed = await run

  expect(completed.status).toBe("cancelled")
  expect(modelCalled).toBe(false)
  expect(events).toEqual(["skill.failed", "session.cancelled", "run.settled"])
})
