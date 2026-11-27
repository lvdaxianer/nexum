import { mkdir, readdir, rm } from "node:fs/promises"
import { basename, dirname, join, relative, resolve } from "node:path"
import {
  artifactRoot,
  declarationPath,
  outputPath,
  publicEntries,
  releasePackageName,
  releasePackageVersion,
  workspacePackageToSubpath,
} from "./nexum-package"

const externalDependencies = ["@modelcontextprotocol/sdk", "dompurify", "marked", "solid-js"]

await rm(artifactRoot, { recursive: true, force: true })
await mkdir(join(artifactRoot, "dist"), { recursive: true })

for (const [subpath, entry] of Object.entries(publicEntries)) {
  const result = await Bun.build({
    entrypoints: [resolve(process.cwd(), entry.source)],
    outfile: outputPath(entry),
    target: "bun",
    format: "esm",
    packages: "bundle",
    external: externalDependencies,
    sourcemap: "none",
    minify: false,
  })
  if (!result.success) {
    throw new Error(`构建 ${subpath} 失败:\n${result.logs.map((log) => log.message).join("\n")}`)
  }
  if (result.outputs.length !== 1) throw new Error(`${subpath} 构建产物数量异常: ${result.outputs.length}`)
  await Bun.write(outputPath(entry), await result.outputs[0].arrayBuffer())
  const compiled = await Bun.file(outputPath(entry)).text()
  await Bun.write(outputPath(entry), compiled.replace(/^\/\/ packages\/.*\r?\n/gm, ""))
  console.log(`built ${subpath} -> ${relative(process.cwd(), outputPath(entry))}`)
}

await Bun.write(join(artifactRoot, "dist", "chat-surface.css"), Bun.file("packages/nexum-chat-surface/src/styles.css"))

for (const [subpath, entry] of Object.entries(publicEntries)) {
  if (subpath === ".") {
    await Bun.write(declarationPath(entry), `export * from "./application.js"\nexport * from "./client.js"\nexport * from "./server.js"\nexport * from "./protocol.js"\n`)
    continue
  }
  const sourceRoot = dirname(entry.source)
  const temporaryTypes = join(artifactRoot, ".types", entry.output)
  const entryDeclarationName = basename(entry.source).replace(/\.(tsx?|mts|cts)$/, ".d.ts")
  await mkdir(temporaryTypes, { recursive: true })
  const command = [
    "bunx",
    "--bun",
    "tsc",
    "--declaration",
    "--emitDeclarationOnly",
    "--declarationMap",
    "false",
    "--skipLibCheck",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    "--target",
    "ES2022",
    "--jsx",
    "preserve",
    "--jsxImportSource",
    "solid-js",
    "--lib",
    "ESNext,DOM,DOM.Iterable",
    "--allowImportingTsExtensions",
    "--types",
    "bun",
    "--ignoreConfig",
    "--rootDir",
    resolve(process.cwd(), sourceRoot),
    "--outDir",
    temporaryTypes,
    resolve(process.cwd(), entry.source),
  ]
  const typecheck = Bun.spawnSync(command, { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" })
  if (typecheck.exitCode !== 0) {
    throw new Error(
      `生成 ${subpath} 类型声明失败:\n${new TextDecoder().decode(typecheck.stdout)}${new TextDecoder().decode(typecheck.stderr)}`,
    )
  }
  const generated = await findDeclaration(temporaryTypes, entryDeclarationName)
  if (!generated) throw new Error(`没有找到 ${subpath} 的入口声明`)
  await copyDeclarations(temporaryTypes, join(artifactRoot, "dist", entry.output))
  await Bun.write(
    declarationPath(entry),
    `export * from "./${entry.output}/${entryDeclarationName.replace(/\.d\.ts$/, ".js")}"\n`,
  )
}

const manifest = {
  name: releasePackageName,
  version: releasePackageVersion,
  description: "Composable, UI-agnostic Agent Runtime",
  type: "module",
  engines: { bun: ">=1.4.4" },
  repository: { type: "git", url: "git+https://github.com/lvdaxianer/nexum.git" },
  homepage: "https://github.com/lvdaxianer/nexum",
  bugs: { url: "https://github.com/lvdaxianer/nexum/issues" },
  keywords: ["agent", "runtime", "ai", "bun"],
  publishConfig: { tag: "beta" },
  bin: { nexum: "dist/cli.js" },
  exports: {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js", default: "./dist/index.js" },
    ...Object.fromEntries(
      Object.entries(publicEntries)
        .filter(([subpath]) => subpath !== ".")
        .map(([subpath, entry]) => [
          subpath,
          { types: `./dist/${entry.output}.d.ts`, import: `./dist/${entry.output}.js`, default: `./dist/${entry.output}.js` },
        ]),
    ),
    "./chat-surface/styles.css": "./dist/chat-surface.css",
  },
  files: ["dist", "README.md", "LICENSE"],
  dependencies: {
    "@modelcontextprotocol/sdk": "1.32.1",
    "@types/bun": "1.4.3",
    "bun-types": "1.4.4",
    dompurify: "3.4.17",
    marked: "18.0.11",
    "solid-js": "1.9.17",
  },
  license: "MIT",
} as const

await Bun.write(join(artifactRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`)
await Bun.write(join(artifactRoot, "README.md"), Bun.file("README.md"))
await Bun.write(join(artifactRoot, "LICENSE"), Bun.file("LICENSE"))

await rewriteDeclarations()
await rm(join(artifactRoot, ".types"), { recursive: true, force: true })
console.log(`nexum package built at ${relative(process.cwd(), artifactRoot)}`)

async function findDeclaration(directory: string, name: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const found = await findDeclaration(path, name)
      if (found) return found
    }
    if (entry.isFile() && entry.name === name) return path
  }
  return undefined
}

async function copyDeclarations(source: string, target: string) {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) {
      await copyDeclarations(from, to)
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".d.ts")) await Bun.write(to, Bun.file(from))
  }
}

async function rewriteDeclarations() {
  for (const file of await Array.fromAsync(new Bun.Glob("dist/**/*.d.ts").scan({ cwd: artifactRoot, onlyFiles: true }))) {
    const path = join(artifactRoot, file)
    const original = await Bun.file(path).text()
    const rewritten = original.replace(/@nexum\/[a-z0-9-]+(?:\/internal)?(?:\/[a-z0-9-]+)*/g, (name) => {
      const base = name.match(/^@nexum\/[a-z0-9-]+/)?.[0]
      if (!base) return name
      const subpath = workspacePackageToSubpath[base as keyof typeof workspacePackageToSubpath]
      if (!subpath) return name
      const suffix = name.slice(base.length)
      return `${subpath}${suffix}`
    }).replace(/nexum-ai\/persistence\/internal\/([a-z0-9-]+)/g, "../persistence/$1.js")
    await Bun.write(path, rewritten)
  }
}
