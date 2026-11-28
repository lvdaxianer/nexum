import { join } from "node:path"

export const artifactRoot = join(process.cwd(), "artifacts", "nexum")
export const releasePackageName = "nexum-ai"
export const releasePackageVersion = process.env.NEXUM_RELEASE_VERSION ?? "0.1.0-beta.0"
export const releasePackageTag = process.env.NEXUM_RELEASE_TAG ?? "beta"
export const releasePackageRegistry = process.env.NEXUM_RELEASE_REGISTRY ?? "https://registry.npmjs.org/"

export const publicEntries = {
  ".": { source: "script/nexum-entry.ts", output: "index" },
  "./core": { source: "packages/nexum-core/src/index.ts", output: "core" },
  "./protocol": { source: "packages/nexum-protocol/src/index.ts", output: "protocol" },
  "./application": { source: "packages/nexum-application/src/index.ts", output: "application" },
  "./persistence": { source: "packages/nexum-persistence/src/index.ts", output: "persistence" },
  "./persistence/memory": { source: "packages/nexum-persistence-memory/src/index.ts", output: "persistence-memory" },
  "./persistence/file": { source: "packages/nexum-persistence-file/src/index.ts", output: "persistence-file" },
  "./persistence/sqlite": { source: "packages/nexum-persistence-sqlite/src/index.ts", output: "persistence-sqlite" },
  "./integrations": { source: "packages/nexum-integrations/src/index.ts", output: "integrations" },
  "./client": { source: "packages/nexum-client/src/index.ts", output: "client" },
  "./server": { source: "packages/nexum-server/src/index.ts", output: "server" },
  "./surface-adapter": { source: "packages/nexum-surface-adapter/src/index.ts", output: "surface-adapter" },
  "./chat-surface": { source: "packages/nexum-chat-surface/src/index.ts", output: "chat-surface" },
  "./cli": { source: "packages/nexum-cli/src/main.ts", output: "cli" },
} as const

export const publicSubpaths = Object.keys(publicEntries)

export const workspacePackageToSubpath = {
  "@nexum/core": `${releasePackageName}/core`,
  "@nexum/protocol": `${releasePackageName}/protocol`,
  "@nexum/application": `${releasePackageName}/application`,
  "@nexum/persistence": `${releasePackageName}/persistence`,
  "@nexum/persistence-memory": `${releasePackageName}/persistence/memory`,
  "@nexum/persistence-file": `${releasePackageName}/persistence/file`,
  "@nexum/persistence-sqlite": `${releasePackageName}/persistence/sqlite`,
  "@nexum/integrations": `${releasePackageName}/integrations`,
  "@nexum/client": `${releasePackageName}/client`,
  "@nexum/server": `${releasePackageName}/server`,
  "@nexum/surface-adapter": `${releasePackageName}/surface-adapter`,
  "@nexum/chat-surface": `${releasePackageName}/chat-surface`,
  "@nexum/cli": `${releasePackageName}/cli`,
} as const

export function outputPath(entry: (typeof publicEntries)[keyof typeof publicEntries]) {
  return join(artifactRoot, "dist", `${entry.output}.js`)
}

export function declarationPath(entry: (typeof publicEntries)[keyof typeof publicEntries]) {
  return join(artifactRoot, "dist", `${entry.output}.d.ts`)
}
