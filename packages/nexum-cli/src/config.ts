/** CLI 本地配置:~/.nexum/cli.json;主题解析 --theme flag > 配置文件 > COLORFGBG > dark。 */

import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { Theme } from "./term"

export type CliConfig = { readonly theme?: "dark" | "light" | "auto" }

export function configPath(): string {
  return join(homedir(), ".nexum", "cli.json")
}

export async function loadCliConfig(file = configPath()): Promise<CliConfig> {
  const config = await Bun.file(file).json().catch(() => ({}))
  return typeof config === "object" && config !== null ? (config as CliConfig) : {}
}

export async function saveCliConfig(config: CliConfig, file = configPath()): Promise<void> {
  mkdirSync(dirname(file), { recursive: true })
  await Bun.write(file, `${JSON.stringify(config, null, 2)}\n`)
}

export function resolveTheme(flag: string | undefined, config: CliConfig, env: Record<string, string | undefined>): Theme {
  const pick = (value: string | undefined): Theme | undefined => (value === "dark" || value === "light" ? value : undefined)
  const fromFlag = pick(flag)
  if (fromFlag) return fromFlag
  const fromConfig = config.theme === "auto" ? undefined : pick(config.theme)
  if (fromConfig) return fromConfig
  if (env.COLORFGBG) {
    const index = Number.parseInt(env.COLORFGBG.split(";").at(-1) ?? "", 10)
    if (Number.isInteger(index)) return index >= 7 ? "light" : "dark"
  }
  return "dark"
}
