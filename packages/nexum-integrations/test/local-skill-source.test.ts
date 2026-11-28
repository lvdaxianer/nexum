import { expect, test } from "bun:test"
import { lstat, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createLocalSkillSource } from "../src/local-skill-source.ts"

test("removes only a real direct-child Skill directory under a configured root", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-local-skill-root-"))
  const skill = join(root, "skill")
  await mkdir(skill)
  const source = createLocalSkillSource({ roots: [root] })

  expect(source.isConfiguredAddress?.(skill)).toBe(true)
  await source.remove?.(skill)

  await expect(Bun.file(skill).exists()).resolves.toBe(false)
})

test("rejects removing a root, an outside directory, or a symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-local-skill-root-"))
  const outside = await mkdtemp(join(tmpdir(), "nexum-local-skill-outside-"))
  const linked = join(root, "linked")
  await symlink(outside, linked)
  const source = createLocalSkillSource({ roots: [root] })

  await expect(source.remove?.(root)).rejects.toThrow()
  await expect(source.remove?.(outside)).rejects.toThrow()
  await expect(source.remove?.(linked)).rejects.toThrow()
  expect((await lstat(linked)).isSymbolicLink()).toBe(true)
})

test("rejects a configured root that is itself a symlink", async () => {
  const realRoot = await mkdtemp(join(tmpdir(), "nexum-local-skill-real-root-"))
  const linkedRoot = join(tmpdir(), `nexum-local-skill-linked-root-${Date.now()}`)
  await symlink(realRoot, linkedRoot)
  const skill = join(linkedRoot, "skill")
  await mkdir(skill)
  const source = createLocalSkillSource({ roots: [linkedRoot] })

  await expect(source.remove?.(skill)).rejects.toThrow()
  await rm(linkedRoot, { force: true })
  await rm(realRoot, { recursive: true, force: true })
})
