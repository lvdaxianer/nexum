import { existsSync, mkdtempSync } from "node:fs"
import { join, relative } from "node:path"
import { tmpdir } from "node:os"
import {
  artifactRoot,
  declarationPath,
  outputPath,
  publicEntries,
  publicSubpaths,
  releasePackageName,
  releasePackageTag,
  releasePackageVersion,
} from "./nexum-package"

const failures: string[] = []

function fail(message: string) {
  failures.push(message)
}

if (!existsSync(artifactRoot)) {
  fail(`缺少发布产物目录: ${relative(process.cwd(), artifactRoot)}`)
}

const manifestPath = join(artifactRoot, "package.json")
if (!existsSync(manifestPath)) {
  fail("缺少 artifacts/nexum/package.json")
} else {
  const manifest = await Bun.file(manifestPath).json()
  if (manifest.name !== releasePackageName) fail(`发布包名必须是 ${releasePackageName}，当前为 ${String(manifest.name)}`)
  if (manifest.version !== releasePackageVersion) {
    fail(`发布包版本必须是 ${releasePackageVersion}，当前为 ${String(manifest.version)}`)
  }
  if (manifest.engines?.bun !== ">=1.4.4") fail("发布包必须声明 Bun >=1.4.4")
  if (manifest.publishConfig?.tag !== releasePackageTag) fail(`发布包必须使用 ${releasePackageTag} dist-tag`)
  if (manifest.private === true) fail("发布包不能标记为 private")
  if (manifest.dependencies && Object.keys(manifest.dependencies).some((name) => name.startsWith("@nexum/"))) {
    fail("发布 dependencies 不能包含 @nexum/*")
  }
  if (manifest.dependencies && Object.values(manifest.dependencies).some((version) => String(version).startsWith("workspace:"))) {
    fail("发布 dependencies 不能包含 workspace: 版本")
  }
  const exports = manifest.exports ?? {}
  for (const subpath of publicSubpaths) {
    const entry = publicEntries[subpath as keyof typeof publicEntries]
    const configured = exports[subpath]
    if (!configured) {
      fail(`exports 缺少 ${subpath}`)
      continue
    }
    const jsTarget = typeof configured === "string" ? configured : configured.default
    const typesTarget = typeof configured === "string" ? undefined : configured.types
    if (jsTarget !== `./dist/${entry.output}.js`) fail(`${subpath} 的 JS export 不指向 dist/${entry.output}.js`)
    if (typesTarget !== `./dist/${entry.output}.d.ts`) fail(`${subpath} 的 types export 不指向 dist/${entry.output}.d.ts`)
    if (!existsSync(outputPath(entry))) fail(`缺少 ${relative(process.cwd(), outputPath(entry))}`)
    if (!existsSync(declarationPath(entry))) fail(`缺少 ${relative(process.cwd(), declarationPath(entry))}`)
  }
  if (exports["./chat-surface/styles.css"] !== "./dist/chat-surface.css") {
    fail("./chat-surface/styles.css 没有指向 dist/chat-surface.css")
  }
  if (exports["./surfaces/styles.css"] !== "./dist/surfaces.css") {
    fail("./surfaces/styles.css 没有指向 dist/surfaces.css")
  }
  if (!existsSync(join(artifactRoot, "dist", "chat-surface.css"))) fail("缺少 dist/chat-surface.css")
  if (!existsSync(join(artifactRoot, "dist", "surfaces.css"))) fail("缺少 dist/surfaces.css")
}

for (const forbidden of ["src", "test", ".turbo", "node_modules", "packages"]) {
  if (existsSync(join(artifactRoot, forbidden))) fail(`发布目录不能包含 ${forbidden}/`)
}

if (existsSync(artifactRoot)) {
  for (const file of await Array.fromAsync(new Bun.Glob("dist/**/*.{js,d.ts,css}").scan({ cwd: artifactRoot, onlyFiles: true }))) {
    const contents = await Bun.file(join(artifactRoot, file)).text()
    if (contents.includes("@nexum/")) fail(`${file} 泄漏了 @nexum/* 引用`)
    if (contents.includes("nexum-ai/persistence/internal/")) fail(`${file} 泄漏了 persistence internal 引用`)
    if (contents.includes("/src/") || contents.includes("packages/")) fail(`${file} 泄漏了源码路径`)
    if (file === "dist/surfaces.js" && contents.includes("import.meta")) fail(`${file} 不能包含不兼容 webpack 4 的 import.meta 语法`)
  }
}

const tarballs = existsSync(artifactRoot)
  ? (await Array.fromAsync(new Bun.Glob("*.tgz").scan({ cwd: artifactRoot, onlyFiles: true }))).map((file) => join(artifactRoot, file))
  : []
if (tarballs.length === 1) await verifyConsumer(tarballs[0])
if (tarballs.length > 1) fail("artifacts/nexum 只能包含一个待验证 tarball")

if (failures.length > 0) {
  console.error(["nexum release verification failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"))
  process.exit(1)
}

console.log(`nexum release verification passed (${publicSubpaths.length} public entrypoints)`)

async function verifyConsumer(tarball: string) {
  const consumer = mkdtempSync(join(tmpdir(), "nexum-consumer-"))
  await Bun.write(
    join(consumer, "package.json"),
    `${JSON.stringify({ type: "module", private: true, dependencies: { [releasePackageName]: `file:${tarball}` }, scripts: { typecheck: "tsc --noEmit" } }, null, 2)}\n`,
  )
  const install = Bun.spawnSync(["bun", "install", "--no-progress"], { cwd: consumer, stdout: "pipe", stderr: "pipe" })
  if (install.exitCode !== 0) {
    fail(`仓库外 consumer 安装失败:\n${new TextDecoder().decode(install.stderr)}`)
    return
  }
  await Bun.write(
    join(consumer, "imports.mjs"),
    `
      await import("${releasePackageName}")
      await import("${releasePackageName}/core")
      await import("${releasePackageName}/protocol")
      await import("${releasePackageName}/application")
      await import("${releasePackageName}/persistence")
      await import("${releasePackageName}/persistence/memory")
      await import("${releasePackageName}/persistence/file")
      await import("${releasePackageName}/persistence/sqlite")
      await import("${releasePackageName}/integrations")
      await import("${releasePackageName}/client")
      await import("${releasePackageName}/server")
      await import("${releasePackageName}/surface-adapter")
      await import("${releasePackageName}/chat-surface")
      await import("${releasePackageName}/cli")
    `,
  )
  const imports = Bun.spawnSync(["bun", "run", "imports.mjs"], { cwd: consumer, stdout: "pipe", stderr: "pipe" })
  if (imports.exitCode !== 0) fail(`仓库外 consumer ESM 导入失败:\n${new TextDecoder().decode(imports.stderr)}`)

  await Bun.write(
    join(consumer, "types.ts"),
    `/// <reference types="bun" />\nimport { createEmbeddedRuntime } from "${releasePackageName}/application"\nimport { Nexum } from "${releasePackageName}/client"\nimport { createMemoryPersistence } from "${releasePackageName}/persistence/memory"\nimport { NexumSurfaces } from "${releasePackageName}/surfaces"\nimport type { NexumSurfacesProps } from "${releasePackageName}/surfaces"\nvoid createEmbeddedRuntime\nvoid Nexum\nvoid createMemoryPersistence\nvoid NexumSurfaces\nconst surfacesProps: NexumSurfacesProps = { apiBaseUrl: "http://127.0.0.1:4097" }\nvoid surfacesProps\n`,
  )
  const typecheck = Bun.spawnSync(
    ["bunx", "--bun", "tsc", "--noEmit", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "types.ts"],
    { cwd: consumer, stdout: "pipe", stderr: "pipe" },
  )
  if (typecheck.exitCode !== 0) {
    fail(
      `仓库外 consumer TypeScript 检查失败:\n${new TextDecoder().decode(typecheck.stdout)}${new TextDecoder().decode(typecheck.stderr)}`,
    )
  }

  await Bun.write(
    join(consumer, "surface-import.ts"),
    `import { NexumSurfaces } from "${releasePackageName}/surfaces"\nimport type { NexumSurfacesProps } from "${releasePackageName}/surfaces"\nimport "${releasePackageName}/surfaces/styles.css"\nvoid NexumSurfaces\nconst props: NexumSurfacesProps = { apiBaseUrl: "http://127.0.0.1:4097" }\nvoid props\n`,
  )
  const surfaceBundle = Bun.spawnSync(
    [
      "bun",
      "build",
      "surface-import.ts",
      "--target=browser",
      "--format=esm",
      "--outdir=surface-dist",
      "--external=solid-js",
    ],
    { cwd: consumer, stdout: "pipe", stderr: "pipe" },
  )
  if (surfaceBundle.exitCode !== 0) {
    fail(`仓库外 consumer Surfaces 浏览器构建失败:\n${new TextDecoder().decode(surfaceBundle.stderr)}`)
  }

  const cli = Bun.spawnSync([join(consumer, "node_modules/.bin/nexum"), "--help"], { cwd: consumer, stdout: "pipe", stderr: "pipe" })
  if (cli.exitCode !== 0) fail(`仓库外 consumer CLI 检查失败:\n${new TextDecoder().decode(cli.stderr)}`)
  if (!existsSync(join(consumer, `node_modules/${releasePackageName}/dist/chat-surface.css`))) fail("仓库外 consumer 缺少 Chat Surface CSS")
  if (!existsSync(join(consumer, `node_modules/${releasePackageName}/dist/surfaces.css`))) fail("仓库外 consumer 缺少 Surfaces CSS")

  const tar = Bun.spawnSync(["tar", "-tzf", tarball], { stdout: "pipe", stderr: "pipe" })
  if (tar.exitCode !== 0) {
    fail(`tarball 清单读取失败:\n${new TextDecoder().decode(tar.stderr)}`)
    return
  }
  const files = new TextDecoder().decode(tar.stdout).split("\n").filter(Boolean)
  for (const forbidden of ["src/", "test/", ".turbo/", "node_modules/", "packages/", "bun.lock"]) {
    if (files.some((file) => file.includes(`package/${forbidden}`) || file.endsWith(forbidden))) fail(`tarball 包含禁止文件: ${forbidden}`)
  }
  console.log(`external consumer verification passed (${files.length} tarball files)`)
}
