import { existsSync } from "node:fs"
import { join, relative } from "node:path"
import { artifactRoot, releasePackageName, releasePackageRegistry } from "./nexum-package"

const args = Bun.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log("用法: bun run release:nexum:prepare --version <version> --tag <tag> [--registry <url>]")
  process.exit(0)
}

const options = new Map<string, string>()
const errors: string[] = []
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index]
  if (!argument.startsWith("--")) {
    errors.push(`无法识别参数: ${argument}`)
    continue
  }
  const [name, inlineValue] = argument.split("=", 2)
  const value = inlineValue ?? args[++index]
  if (!value || value.startsWith("--")) {
    errors.push(`${name} 需要一个值`)
    if (value?.startsWith("--")) index -= 1
    continue
  }
  if (!["--version", "--tag", "--registry"].includes(name)) {
    errors.push(`无法识别参数: ${name}`)
    continue
  }
  options.set(name, value)
}

const version = options.get("--version")
const tag = options.get("--tag")
const registry = options.get("--registry") ?? releasePackageRegistry
if (!version) errors.push("必须传入 --version")
if (!tag) errors.push("必须传入 --tag")
if (version && !isSemver(version)) errors.push(`--version 不是合法的 semver: ${version}`)
if (tag && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)) errors.push(`--tag 不是合法的 dist-tag: ${tag}`)
if (!isRegistry(registry)) errors.push(`--registry 必须是 HTTP(S) 地址且不能包含凭据: ${registry}`)

if (errors.length > 0) {
  console.error(["发包准备参数无效:", ...errors.map((error) => `- ${error}`)].join("\n"))
  process.exit(1)
}

const releaseEnvironment = {
  ...process.env,
  NEXUM_RELEASE_VERSION: version,
  NEXUM_RELEASE_TAG: tag,
  NEXUM_RELEASE_REGISTRY: registry,
}

runStage("项目检查", ["check"], releaseEnvironment)
runStage("文档检查", ["verify:docs"], releaseEnvironment)
runStage("构建发布产物", ["build:packages"], releaseEnvironment)
runStage("打包 tarball", ["pack:nexum"], releaseEnvironment)
runStage("验证发布产物", ["verify:nexum"], releaseEnvironment)

const tarball = join(artifactRoot, `${releasePackageName}-${version}.tgz`)
if (!existsSync(tarball)) {
  console.error(`发包准备失败：未找到预期 tarball ${relative(process.cwd(), tarball)}`)
  process.exit(1)
}

console.log("Release preparation passed")
console.log(`Package: ${releasePackageName}`)
console.log(`Version: ${version}`)
console.log(`Dist-tag: ${tag}`)
console.log(`Registry: ${registry}`)
console.log(`Tarball: ${relative(process.cwd(), tarball)}`)
console.log("Manual publish command (run only after human review):")
console.log(`npm publish ${relative(process.cwd(), tarball)} --tag ${tag} --registry=${registry}`)
console.log("Manual verification command:")
console.log(`npm view ${releasePackageName} version dist-tags --registry=${registry} --json`)

/**
 * 执行一个发布准备阶段，并在失败时停止后续阶段。
 * @author lvdaxianer@yeah.net
 */
function runStage(stage: string, script: string[], env: Record<string, string | undefined>) {
  console.log(`\n==> ${stage}`)
  const result = Bun.spawnSync(["bun", "run", ...script], {
    cwd: process.cwd(),
    env,
    stdout: "inherit",
    stderr: "inherit",
  })
  if (result.exitCode !== 0) {
    console.error(`\n发包准备失败：${stage} 退出码 ${result.exitCode}`)
    process.exit(result.exitCode || 1)
  }
}

/**
 * 校验发布版本是否符合 semver 基本格式。
 * @author lvdaxianer@yeah.net
 */
function isSemver(value: string) {
  const pattern = new RegExp(
    "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)" +
      "(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?" +
      "(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$",
  )
  return pattern.test(value)
}

/**
 * 校验 registry 是否为不含凭据的 HTTP(S) 地址。
 * @author lvdaxianer@yeah.net
 */
function isRegistry(value: string) {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
}
