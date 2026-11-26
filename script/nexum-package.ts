import { join } from "node:path"

export const artifactRoot = join(process.cwd(), "artifacts", "nexum")

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
  "@nexum/core": "nexum/core",
  "@nexum/protocol": "nexum/protocol",
  "@nexum/application": "nexum/application",
  "@nexum/persistence": "nexum/persistence",
  "@nexum/persistence-memory": "nexum/persistence/memory",
  "@nexum/persistence-file": "nexum/persistence/file",
  "@nexum/persistence-sqlite": "nexum/persistence/sqlite",
  "@nexum/integrations": "nexum/integrations",
  "@nexum/client": "nexum/client",
  "@nexum/server": "nexum/server",
  "@nexum/surface-adapter": "nexum/surface-adapter",
  "@nexum/chat-surface": "nexum/chat-surface",
  "@nexum/cli": "nexum/cli",
} as const

export function outputPath(entry: (typeof publicEntries)[keyof typeof publicEntries]) {
  return join(artifactRoot, "dist", `${entry.output}.js`)
}

export function declarationPath(entry: (typeof publicEntries)[keyof typeof publicEntries]) {
  return join(artifactRoot, "dist", `${entry.output}.d.ts`)
}
