import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNexumPermissionBroker, createNexumSessionService } from "@nexum/core"
import { createFilePermissionPolicyStore } from "@nexum/adapters"
import { startNexumServer, type NexumServer } from "../src/index.ts"

const servers: NexumServer[] = []
const directories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function startService() {
  const directory = await mkdtemp(join(tmpdir(), "nexum-policy-api-"))
  directories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const permissionBroker = createNexumPermissionBroker()
  const server = await startNexumServer({ port: 0, sessionService, permissionBroker })
  servers.push(server)
  return { server, sessionService, session, permissionBroker }
}

function policyUrl(server: NexumServer, suffix = "", query = ""): URL {
  return new URL(`/api/nexum/permission/policy${suffix}${query}`, server.url)
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

test("lists an empty policy set for a fresh service", async () => {
  const { server, session } = await startService()

  const response = await fetch(policyUrl(server, "", `?sessionID=${session.sessionID}`))
  const body = (await response.json()) as {
    data: { rules: unknown[]; defaultEffect: string; sessionID?: string }
    meta: unknown
  }

  expect(response.status).toBe(200)
  expect(body.data).toEqual({ rules: [], defaultEffect: "ask", sessionID: session.sessionID })
  expect(body.meta).toMatchObject({ protocolVersion: "nexum.runtime.v1" })
})

test("creates a global rule, lists it, and reuses it for later requests", async () => {
  const { server, permissionBroker, session } = await startService()

  const created = await fetch(policyUrl(server), jsonRequest("POST", {
    action: "shell",
    resource: "bun test",
    effect: "allow",
  }))
  const createdBody = (await created.json()) as { data: { id: string; scope: string; effect: string } }
  expect(created.status).toBe(200)
  expect(createdBody.data).toMatchObject({ action: "shell", resource: "bun test", effect: "allow", scope: "global" })

  const listed = await fetch(policyUrl(server, "", `?sessionID=${session.sessionID}`))
  expect((await listed.json()) as { data: { rules: unknown[] } }).toMatchObject({ data: { rules: [createdBody.data] } })

  const evaluation = permissionBroker.evaluate({
    sessionID: session.sessionID,
    toolName: "shell",
    action: "shell",
    resource: "bun test",
    input: { command: "bun test" },
  })
  expect(await evaluation).toBe("allow")
  expect(await permissionBroker.list(session.sessionID)).toEqual([])
})

test("creates an action-agnostic rule and applies it to every tool", async () => {
  const { server, permissionBroker, session } = await startService()

  const created = await fetch(policyUrl(server), jsonRequest("POST", {
    action: "*",
    resource: "src/index.ts",
    effect: "allow",
  }))
  expect(created.status).toBe(200)
  expect((await created.json()) as { data: unknown }).toMatchObject({
    data: { action: "*", resource: "src/index.ts", effect: "allow", scope: "global" },
  })

  for (const action of ["shell", "read", "write", "edit"]) {
    expect(
      await permissionBroker.evaluate({
        sessionID: session.sessionID,
        toolName: action,
        action,
        resource: "src/index.ts",
        input: { path: "src/index.ts" },
      }),
    ).toBe("allow")
  }
  expect(await permissionBroker.list(session.sessionID)).toEqual([])
})

test("an action-agnostic wildcard rule still asks for dangerous operations", async () => {
  const { server, permissionBroker, session } = await startService()

  await fetch(policyUrl(server), jsonRequest("POST", { action: "*", resource: "*", effect: "allow" }))
  const evaluation = permissionBroker.evaluate({
    sessionID: session.sessionID,
    toolName: "shell",
    action: "shell",
    resource: "rm -rf /",
    input: { command: "rm -rf /" },
  })
  await Bun.sleep(0)
  const pending = (await permissionBroker.list(session.sessionID))[0]!

  expect(pending).toMatchObject({ action: "shell", resource: "rm -rf /" })
  await permissionBroker.reply({ sessionID: session.sessionID, requestID: pending.id, decision: "deny" })
  expect(await evaluation).toBe("deny")
})

test("keeps the action-specific API working and can migrate a rule to the wildcard", async () => {
  const { server, permissionBroker, session } = await startService()

  const created = await fetch(policyUrl(server), jsonRequest("POST", {
    action: "read",
    resource: "docs/spec.md",
    effect: "allow",
  }))
  const rule = (await created.json()) as { data: { id: string } }
  expect(
    await permissionBroker.evaluate({
      sessionID: session.sessionID,
      toolName: "read",
      action: "read",
      resource: "docs/spec.md",
      input: { path: "docs/spec.md" },
    }),
  ).toBe("allow")

  const migrated = await fetch(policyUrl(server, `/${rule.data.id}`), jsonRequest("PUT", { action: "*" }))
  expect(migrated.status).toBe(200)
  expect((await migrated.json()) as { data: unknown }).toMatchObject({ data: { action: "*" } })

  for (const action of ["shell", "read", "write", "edit"]) {
    expect(
      await permissionBroker.evaluate({
        sessionID: session.sessionID,
        toolName: action,
        action,
        resource: "docs/spec.md",
        input: { path: "docs/spec.md" },
      }),
    ).toBe("allow")
  }
})

test("creates a session scoped override that only applies to that session", async () => {
  const { server, sessionService, permissionBroker, session } = await startService()
  const secondDirectory = await mkdtemp(join(tmpdir(), "nexum-policy-api-second-"))
  directories.push(secondDirectory)
  const other = await sessionService.create({ directory: secondDirectory })

  const created = await fetch(policyUrl(server), jsonRequest("POST", {
    action: "read",
    resource: "README.md",
    effect: "deny",
    scope: "session",
    sessionID: session.sessionID,
  }))
  expect(created.status).toBe(200)

  expect(
    await permissionBroker.evaluate({
      sessionID: session.sessionID,
      toolName: "read",
      action: "read",
      resource: "README.md",
      input: { path: "README.md" },
    }),
  ).toBe("deny")

  const otherEvaluation = permissionBroker.evaluate({
    sessionID: other.sessionID,
    toolName: "read",
    action: "read",
    resource: "README.md",
    input: { path: "README.md" },
  })
  await Bun.sleep(0)
  const pending = (await permissionBroker.list(other.sessionID))[0]!
  await permissionBroker.reply({ sessionID: other.sessionID, requestID: pending.id, decision: "deny" })
  expect(await otherEvaluation).toBe("deny")
  expect(await permissionBroker.list(other.sessionID)).toEqual([])
})

test("rejects invalid policy payloads with stable error codes", async () => {
  const { server, session } = await startService()

  const missingField = await fetch(policyUrl(server), jsonRequest("POST", { action: "shell" }))
  expect(missingField.status).toBe(400)
  expect((await missingField.json()) as { errorCode: string }).toMatchObject({ errorCode: "NEXUM_INVALID_REQUEST" })

  const partialWildcard = await fetch(policyUrl(server), jsonRequest("POST", {
    action: "s*",
    resource: "*",
    effect: "allow",
  }))
  expect(partialWildcard.status).toBe(400)
  expect((await partialWildcard.json()) as { message: string }).toMatchObject({
    errorCode: "NEXUM_INVALID_REQUEST",
  })

  const invalidEffect = await fetch(policyUrl(server), jsonRequest("POST", {
    action: "shell",
    resource: "pwd",
    effect: "maybe",
  }))
  expect(invalidEffect.status).toBe(400)

  const missingSession = await fetch(policyUrl(server), jsonRequest("POST", {
    action: "shell",
    resource: "pwd",
    effect: "allow",
    scope: "session",
  }))
  expect(missingSession.status).toBe(400)
  expect((await missingSession.json()) as { message: string }).toMatchObject({
    message: "Session 作用域的策略必须提供 sessionID",
  })

  const unknownSession = await fetch(policyUrl(server), jsonRequest("POST", {
    action: "shell",
    resource: "pwd",
    effect: "allow",
    scope: "session",
    sessionID: "missing-session",
  }))
  expect(unknownSession.status).toBe(404)
  expect((await unknownSession.json()) as { errorCode: string }).toMatchObject({
    errorCode: "NEXUM_SESSION_NOT_FOUND",
  })

  const listed = await fetch(policyUrl(server, "", `?sessionID=${session.sessionID}`))
  expect((await listed.json()) as { data: { rules: unknown[] } }).toMatchObject({ data: { rules: [] } })
})

test("rejects duplicate rules with a conflict code", async () => {
  const { server } = await startService()
  const payload = { action: "write", resource: "notes.md", effect: "allow" }

  expect((await fetch(policyUrl(server), jsonRequest("POST", payload))).status).toBe(200)
  const duplicated = await fetch(policyUrl(server), jsonRequest("POST", payload))

  expect(duplicated.status).toBe(409)
  expect((await duplicated.json()) as { errorCode: string }).toMatchObject({
    errorCode: "NEXUM_PERMISSION_POLICY_CONFLICT",
  })
})

test("updates and deletes a rule and reports missing rules", async () => {
  const { server } = await startService()
  const created = await fetch(policyUrl(server), jsonRequest("POST", {
    action: "shell",
    resource: "npm publish",
    effect: "ask",
  }))
  const rule = (await created.json()) as { data: { id: string } }

  const updated = await fetch(policyUrl(server, `/${rule.data.id}`), jsonRequest("PUT", { effect: "deny" }))
  expect(updated.status).toBe(200)
  expect((await updated.json()) as { data: { effect: string } }).toMatchObject({ data: { effect: "deny" } })

  const invalidUpdate = await fetch(policyUrl(server, `/${rule.data.id}`), jsonRequest("PUT", { action: "s*" }))
  expect(invalidUpdate.status).toBe(400)

  const missingUpdate = await fetch(policyUrl(server, "/hpr_missing"), jsonRequest("PUT", { effect: "deny" }))
  expect(missingUpdate.status).toBe(404)
  expect((await missingUpdate.json()) as { errorCode: string }).toMatchObject({
    errorCode: "NEXUM_PERMISSION_POLICY_NOT_FOUND",
  })

  const removed = await fetch(policyUrl(server, `/${rule.data.id}`), { method: "DELETE" })
  expect(removed.status).toBe(200)
  expect((await removed.json()) as { data: unknown }).toMatchObject({ data: { id: rule.data.id, deleted: true } })

  const missingDelete = await fetch(policyUrl(server, `/${rule.data.id}`), { method: "DELETE" })
  expect(missingDelete.status).toBe(404)
})

test("rejects unsupported methods on the policy route", async () => {
  const { server } = await startService()

  const response = await fetch(policyUrl(server), { method: "DELETE" })
  expect(response.status).toBe(405)
  expect((await response.json()) as { errorCode: string }).toMatchObject({ errorCode: "NEXUM_METHOD_NOT_ALLOWED" })
})

test("keeps the single approval flow working next to stored policies", async () => {
  const { server, permissionBroker, session } = await startService()
  await fetch(policyUrl(server), jsonRequest("POST", { action: "read", resource: "docs/*", effect: "allow" }))

  const evaluation = permissionBroker.evaluate({
    sessionID: session.sessionID,
    toolName: "read",
    action: "read",
    resource: "src/index.ts",
    input: { path: "src/index.ts" },
  })
  await Bun.sleep(0)
  const pending = (await permissionBroker.list(session.sessionID))[0]!

  expect(pending).toMatchObject({ action: "read", resource: "src/index.ts" })
  await permissionBroker.reply({ sessionID: session.sessionID, requestID: pending.id, decision: "allow_once" })
  expect(await evaluation).toBe("allow")

  const secondEvaluation = permissionBroker.evaluate({
    sessionID: session.sessionID,
    toolName: "read",
    action: "read",
    resource: "src/index.ts",
    input: { path: "src/index.ts" },
  })
  await Bun.sleep(0)
  expect(await permissionBroker.list(session.sessionID)).toHaveLength(1)
  await permissionBroker.cancel(session.sessionID)
  expect(await secondEvaluation).toBe("deny")
})

test("restores persisted policies after a service restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-policy-api-file-"))
  const directory = await mkdtemp(join(tmpdir(), "nexum-policy-api-file-project-"))
  directories.push(root, directory)
  const filePath = join(root, "permission-policies.json")
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const first = await startNexumServer({
    port: 0,
    sessionService,
    permissionPolicyStore: createFilePermissionPolicyStore({ filePath }),
  })
  servers.push(first)
  const created = await fetch(policyUrl(first), jsonRequest("POST", {
    action: "write",
    resource: "reports/*",
    effect: "allow",
  }))
  expect(created.status).toBe(200)
  await first.stop(true)

  const second = await startNexumServer({
    port: 0,
    sessionService,
    permissionPolicyStore: createFilePermissionPolicyStore({ filePath }),
  })
  servers.push(second)
  const listed = await fetch(policyUrl(second, "", `?sessionID=${session.sessionID}`))

  expect((await listed.json()) as { data: { rules: Array<{ action: string; resource: string }> } }).toMatchObject({
    data: { rules: [{ action: "write", resource: "reports/*" }] },
  })
})
