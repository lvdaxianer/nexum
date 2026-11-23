import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNexumSkillRegistry } from "../../nexum-application/src/index.ts"

async function makeSkill(root: string, directory: string, name = directory) {
  const skillRoot = join(root, directory)
  await mkdir(join(skillRoot, "references"), { recursive: true })
  await mkdir(join(skillRoot, "scripts"), { recursive: true })
  await writeFile(
    join(skillRoot, "SKILL.md"),
    `---\nname: ${name}\ndescription: A test skill\nversion: 0.1.0\n---\n\n# ${name}\n\nUse the registered workflow.\n`,
  )
  await writeFile(join(skillRoot, "references", "contract.md"), "contract")
  await writeFile(join(skillRoot, "scripts", "check.py"), "print('ok')\n")
  return skillRoot
}

test("discovers a complete directory skill with a stable digest and safe file manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-skill-"))
  await makeSkill(root, "example-skill")
  const registry = createNexumSkillRegistry({ roots: [root] })

  await registry.refresh()
  const [summary] = await registry.list()
  const skill = await registry.get("example-skill")

  expect(summary).toMatchObject({
    id: "example-skill",
    name: "example-skill",
    description: "A test skill",
    version: "0.1.0",
    status: "ready",
    fileCount: 3,
  })
  expect(summary?.files).toEqual(["SKILL.md", "references/contract.md", "scripts/check.py"])
  expect(summary?.digest).toMatch(/^[a-f0-9]{64}$/)
  expect(skill).toBeDefined()
  await expect(skill?.read("SKILL.md")).resolves.toContain("Use the registered workflow")
  expect(JSON.stringify(summary)).not.toContain(root)
})

test("marks an incomplete or symlink-escaping skill invalid without exposing its path", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-skill-"))
  const invalid = join(root, "broken")
  await mkdir(invalid, { recursive: true })
  await writeFile(join(invalid, "README.md"), "missing SKILL.md")
  const outside = await mkdtemp(join(tmpdir(), "nexum-skill-outside-"))
  await makeSkill(outside, "outside")
  await symlink(join(outside, "outside", "references"), join(invalid, "references"))

  const registry = createNexumSkillRegistry({ roots: [root] })
  await registry.refresh()
  const [summary] = await registry.list()

  expect(summary?.status).toBe("invalid")
  expect(summary?.diagnostics.join(" ")).not.toContain(root)
  expect(await registry.get("broken")).toBeUndefined()
})

test("reports duplicate skill IDs as conflicts instead of silently overriding a source", async () => {
  const first = await mkdtemp(join(tmpdir(), "nexum-skill-first-"))
  const second = await mkdtemp(join(tmpdir(), "nexum-skill-second-"))
  await makeSkill(first, "first", "shared")
  await makeSkill(second, "second", "shared")
  const registry = createNexumSkillRegistry({ roots: [first, second] })

  await registry.refresh()
  const summaries = await registry.list()

  expect(summaries).toHaveLength(1)
  expect(summaries[0]).toMatchObject({ id: "shared", status: "conflict" })
  expect(summaries[0]?.diagnostics).toContain("duplicate skill id")
  expect(await registry.get("shared")).toBeUndefined()
})

test("does not expose credential-shaped metadata in validation diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-skill-"))
  const skillRoot = join(root, "secret-skill")
  await mkdir(skillRoot, { recursive: true })
  await writeFile(
    join(skillRoot, "SKILL.md"),
    "---\nname: secret-skill\ndescription: token=should-not-leak\n---\n",
  )
  const registry = createNexumSkillRegistry({ roots: [root] })

  await registry.refresh()
  const [summary] = await registry.list()

  expect(JSON.stringify(summary)).not.toContain("should-not-leak")
  expect(summary?.description).toBe("token=[REDACTED]")
})

test("registers an address and restores the Skill after a new registry is created", async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "nexum-skill-source-"))
  const skillRoot = await makeSkill(sourceRoot, "persisted-skill")
  const dataRoot = await mkdtemp(join(tmpdir(), "nexum-skill-data-"))
  const filePath = join(dataRoot, "skills.json")
  const first = createNexumSkillRegistry({ roots: [], filePath })

  await expect(first.register(skillRoot)).resolves.toMatchObject({ id: "persisted-skill", status: "ready" })
  expect(JSON.parse(await readFile(filePath, "utf8")).registrations).toHaveLength(1)

  const second = createNexumSkillRegistry({ roots: [], filePath })
  await second.refresh()
  await expect(second.list()).resolves.toMatchObject([{ id: "persisted-skill", status: "ready" }])
})

test("re-registering an address is idempotent", async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "nexum-skill-source-"))
  const skillRoot = await makeSkill(sourceRoot, "idempotent-skill")
  const dataRoot = await mkdtemp(join(tmpdir(), "nexum-skill-data-"))
  const filePath = join(dataRoot, "skills.json")
  const registry = createNexumSkillRegistry({ roots: [], filePath })

  await registry.register(skillRoot)
  await registry.register(`${skillRoot}/.`)

  await expect(registry.list()).resolves.toHaveLength(1)
  expect(JSON.parse(await readFile(filePath, "utf8")).registrations).toHaveLength(1)
})

test("unregisters a Skill without deleting its source directory", async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "nexum-skill-source-"))
  const skillRoot = await makeSkill(sourceRoot, "removable-skill")
  const dataRoot = await mkdtemp(join(tmpdir(), "nexum-skill-data-"))
  const filePath = join(dataRoot, "skills.json")
  const skillFile = join(skillRoot, "SKILL.md")
  const original = await readFile(skillFile, "utf8")
  const registry = createNexumSkillRegistry({ roots: [], filePath })

  await registry.register(skillRoot)
  await registry.unregister("removable-skill")

  await expect(registry.list()).resolves.toEqual([])
  await expect(readFile(skillFile, "utf8")).resolves.toBe(original)
  expect(JSON.parse(await readFile(filePath, "utf8")).registrations).toEqual([])
})

test("refreshing one registered Skill keeps other registered Skills available", async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "nexum-skill-source-"))
  const firstSkill = await makeSkill(sourceRoot, "first-skill")
  const secondSkill = await makeSkill(sourceRoot, "second-skill")
  const dataRoot = await mkdtemp(join(tmpdir(), "nexum-skill-data-"))
  const registry = createNexumSkillRegistry({ roots: [], filePath: join(dataRoot, "skills.json") })

  await registry.register(firstSkill)
  await registry.register(secondSkill)
  await registry.refresh("first-skill")

  await expect(registry.list()).resolves.toMatchObject([
    { id: "first-skill", status: "ready" },
    { id: "second-skill", status: "ready" },
  ])
})
