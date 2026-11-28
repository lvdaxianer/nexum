import { existsSync } from "node:fs"
import { join } from "node:path"
import { releasePackageName } from "./nexum-package"

const modules = [
  { package: "nexum-core", subpath: `${releasePackageName}/core`, public: true },
  { package: "nexum-protocol", subpath: `${releasePackageName}/protocol`, public: true },
  { package: "nexum-application", subpath: `${releasePackageName}/application`, public: true },
  { package: "nexum-persistence", subpath: `${releasePackageName}/persistence`, public: true },
  { package: "nexum-persistence-memory", subpath: `${releasePackageName}/persistence/memory`, public: true },
  { package: "nexum-persistence-file", subpath: `${releasePackageName}/persistence/file`, public: true },
  { package: "nexum-persistence-sqlite", subpath: `${releasePackageName}/persistence/sqlite`, public: true },
  { package: "nexum-integrations", subpath: `${releasePackageName}/integrations`, public: true },
  { package: "nexum-client", subpath: `${releasePackageName}/client`, public: true },
  { package: "nexum-server", subpath: `${releasePackageName}/server`, public: true },
  { package: "nexum-surface-adapter", subpath: `${releasePackageName}/surface-adapter`, public: true },
  { package: "nexum-chat-surface", subpath: `${releasePackageName}/chat-surface`, public: true },
  { package: "nexum-cli", subpath: `${releasePackageName}/cli`, public: true },
  { package: "nexum-surfaces", subpath: `${releasePackageName}/surfaces`, public: true },
  { package: "nexum-test", subpath: "内部", public: false },
] as const

const failures: string[] = []
for (const module of modules) {
  const packageReadme = join(process.cwd(), "packages", module.package, "README.md")
  const moduleDoc = join(process.cwd(), "docs", "modules", `${module.package}.md`)
  if (!existsSync(packageReadme)) failures.push(`缺少 ${packageReadme}`)
  if (!existsSync(moduleDoc)) failures.push(`缺少 ${moduleDoc}`)
  if (!existsSync(packageReadme) || !existsSync(moduleDoc)) continue
  const packageText = await Bun.file(packageReadme).text()
  const moduleText = await Bun.file(moduleDoc).text()
  if (!packageText.includes(module.subpath)) failures.push(`${module.package}/README.md 未说明 ${module.subpath}`)
  if (!moduleText.includes(module.subpath)) failures.push(`docs/modules/${module.package}.md 未说明 ${module.subpath}`)
  if (module.public && !packageText.includes(`npm install ${releasePackageName}`)) {
    failures.push(`${module.package}/README.md 缺少 npm install ${releasePackageName}`)
  }
  if (!module.public && !packageText.includes("内部")) failures.push(`${module.package}/README.md 未标记内部模块`)
}

if (failures.length > 0) {
  console.error(["nexum docs verification failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"))
  process.exit(1)
}
console.log(`nexum docs verification passed (${modules.length} modules)`)
