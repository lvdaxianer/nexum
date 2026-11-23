/** Skill 注册状态的 JSON 文件持久化实现。 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type {
  NexumSkillRegistration,
  NexumSkillRegistrationStore,
  NexumSkillSourceType,
  NexumSkillStatus,
} from "@nexum/core"

const fileVersion = 1
const localSourceType: NexumSkillSourceType = "local-directory"

/** 文件 Skill 注册存储的配置。 */
export interface FileSkillRegistrationStoreOptions {
  readonly filePath: string
}

/** 创建进程内 Skill 注册存储。 */
export function createInMemorySkillRegistrationStore(): NexumSkillRegistrationStore {
  let registrations = new Map<string, NexumSkillRegistration>()
  return {
    async list() {
      return sortRegistrations([...registrations.values()])
    },
    async save(registration) {
      registrations = new Map(registrations).set(registration.address, registration)
    },
    async remove(address) {
      registrations = new Map(registrations)
      registrations.delete(address)
    },
  }
}

/** 创建基于 JSON 文件的 Skill 注册存储。 */
export function createFileSkillRegistrationStore(options: FileSkillRegistrationStoreOptions): NexumSkillRegistrationStore {
  let loaded: Promise<Map<string, NexumSkillRegistration>> | undefined
  let writeQueue: Promise<void> = Promise.resolve()

  const load = async () => {
    if (!loaded) loaded = readRegistrationFile(options.filePath)
    return loaded
  }

  return {
    async list() {
      return sortRegistrations([...((await load()).values())])
    },
    async save(registration) {
      const operation = writeQueue.then(async () => {
        const registrations = new Map(await load()).set(registration.address, registration)
        await writeRegistrationFile(options.filePath, registrations)
        loaded = Promise.resolve(registrations)
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
    async remove(address) {
      const operation = writeQueue.then(async () => {
        const registrations = new Map(await load())
        registrations.delete(address)
        await writeRegistrationFile(options.filePath, registrations)
        loaded = Promise.resolve(registrations)
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
  }
}

async function readRegistrationFile(filePath: string): Promise<Map<string, NexumSkillRegistration>> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  if (text === undefined) return new Map()
  try {
    const payload = JSON.parse(text) as unknown
    if (!isRegistrationFile(payload)) return new Map()
    return new Map(payload.registrations.map((registration) => [registration.address, registration]))
  } catch {
    return new Map()
  }
}

async function writeRegistrationFile(
  filePath: string,
  registrations: ReadonlyMap<string, NexumSkillRegistration>,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const payload = JSON.stringify({ version: fileVersion, registrations: sortRegistrations([...registrations.values()]) }, null, 2)
  await writeFile(temporaryPath, `${payload}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporaryPath, filePath)
}

function sortRegistrations(registrations: readonly NexumSkillRegistration[]): NexumSkillRegistration[] {
  return [...registrations].sort((left, right) => left.address.localeCompare(right.address))
}

function isRegistrationFile(value: unknown): value is { readonly version: 1; readonly registrations: readonly NexumSkillRegistration[] } {
  return isRecord(value) && value.version === fileVersion && Array.isArray(value.registrations) && value.registrations.every(isRegistration)
}

function isRegistration(value: unknown): value is NexumSkillRegistration {
  return (
    isRecord(value) &&
    typeof value.address === "string" &&
    value.sourceType === localSourceType &&
    typeof value.registeredAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.skillID === undefined || typeof value.skillID === "string") &&
    (value.digest === undefined || typeof value.digest === "string") &&
    (value.status === undefined || isSkillStatus(value.status)) &&
    (value.diagnostics === undefined || Array.isArray(value.diagnostics) && value.diagnostics.every((item) => typeof item === "string"))
  )
}

function isSkillStatus(value: unknown): value is NexumSkillStatus {
  return value === "ready" || value === "invalid" || value === "conflict"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}
