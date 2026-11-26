import { existsSync } from "node:fs"
import { join } from "node:path"
import { artifactRoot } from "./nexum-package"

if (!existsSync(join(artifactRoot, "package.json"))) {
  throw new Error("未找到 artifacts/nexum/package.json，请先运行 bun run build:packages")
}

const result = Bun.spawnSync(["bun", "pm", "pack"], {
  cwd: artifactRoot,
  stdout: "pipe",
  stderr: "pipe",
})
if (result.exitCode !== 0) {
  throw new Error(`${new TextDecoder().decode(result.stdout)}${new TextDecoder().decode(result.stderr)}`)
}

const output = new TextDecoder().decode(result.stdout).trim()
const tarball = output
  .split(/\r?\n/)
  .map((line) => line.trim())
  .reverse()
  .find((line) => line.endsWith(".tgz"))
if (!tarball || !tarball.endsWith(".tgz")) throw new Error(`无法解析 bun pm pack 输出:\n${output}`)
console.log(`nexum tarball: ${tarball}`)
