/** 管理面一次性命令:model / role-prompt / skill / mcp,直接消费 @nexum/client。 */

import { spawn } from "node:child_process"
import type { Prompter } from "./interact"
import { paint, style } from "./term"
import type { CliIO } from "./io"
import type { NexumClient } from "./commands"

function statusPaint(io: CliIO, status: string): string {
  if (status === "connected" || status === "available" || status === "ready") return paint(io.caps, "green", status)
  if (status === "needs_auth" || status === "invalid") return paint(io.caps, "yellow", status)
  if (status === "retrying") return paint(io.caps, "cyan", status)
  if (status === "failed" || status === "unavailable" || status === "conflict") return paint(io.caps, "red", status)
  return paint(io.caps, "dim", status)
}

export async function cmdModelGet(client: NexumClient, io: CliIO): Promise<void> {
  const config = (await client.experimental.nexum.model.get()).data
  if (!config) {
    io.line(paint(io.caps, "dim", "未配置模型,nexum model set 进行配置"))
    return
  }
  io.line(`${paint(io.caps, "dim", "baseUrl   ")}${config.baseUrl}`)
  io.line(`${paint(io.caps, "dim", "model     ")}${config.model}`)
  const credential = config.credentialConfigured ? `${paint(io.caps, "green", "已配置")}${config.credentialRef ? paint(io.caps, "dim", `(${config.credentialRef})`) : ""}` : paint(io.caps, "yellow", "未配置")
  io.line(`${paint(io.caps, "dim", "凭据      ")}${credential}`)
}

export async function cmdModelSet(client: NexumClient, io: CliIO, prompter: Prompter): Promise<void> {
  const current = (await client.experimental.nexum.model.get()).data
  const baseUrl = (await prompter(`baseUrl › `)).trim() || current?.baseUrl || ""
  const model = (await prompter(`model › `)).trim() || current?.model || ""
  const credential = (await prompter(paint(io.caps, "dim", "API Key(留空保持不变) › "))).trim()
  if (!baseUrl || !model) {
    io.line(paint(io.caps, "red", "baseUrl 与 model 不能为空"))
    return
  }
  await client.experimental.nexum.model.update({ baseUrl, model, ...(credential ? { credential } : {}) })
  io.line(`${paint(io.caps, "green", "✓")} 模型配置已保存`)
}

export async function cmdModelProbe(client: NexumClient, io: CliIO): Promise<void> {
  const probe = (await client.experimental.nexum.model.probe({ mode: "both" })).data
  const mark = (value: string) => (value === "pass" ? paint(io.caps, "green", "pass") : paint(io.caps, "yellow", "skipped"))
  io.line(`${paint(io.caps, "dim", "文本通道          ")}${mark(probe.text)}`)
  io.line(`${paint(io.caps, "dim", "Function Calling  ")}${mark(probe.functionCalling)}`)
}

export async function cmdRolePromptGet(client: NexumClient, io: CliIO): Promise<void> {
  const rolePrompt = (await client.experimental.nexum.rolePrompt.get()).data
  io.line(paint(io.caps, "dim", `来源 ${rolePrompt.source}${rolePrompt.updatedAt ? ` · 更新于 ${rolePrompt.updatedAt.slice(0, 10)}` : ""}`))
  io.line(`"${rolePrompt.prompt.slice(0, 60)}${rolePrompt.prompt.length > 60 ? "……" : ""}"`)
}

export async function cmdRolePromptSet(client: NexumClient, io: CliIO, file: string): Promise<void> {
  const prompt = await Bun.file(file).text()
  await client.experimental.nexum.rolePrompt.update({ prompt })
  io.line(`${paint(io.caps, "green", "✓")} 角色 Prompt 已更新(${[...prompt].length} 字)`)
}

export async function cmdRolePromptReset(client: NexumClient, io: CliIO): Promise<void> {
  await client.experimental.nexum.rolePrompt.reset()
  io.line(`${paint(io.caps, "green", "✓")} 已重置为默认角色 Prompt`)
}

export async function cmdSkillList(client: NexumClient, io: CliIO): Promise<void> {
  const skills = (await client.experimental.nexum.skill.list()).data
  io.line(paint(io.caps, "dim", "ID            状态      文件  描述"))
  for (const skill of skills) {
    io.line(`${skill.id.padEnd(12)}  ${statusPaint(io, skill.status).padEnd(8)}  ${String(skill.fileCount).padEnd(4)}  ${skill.description}`)
  }
  if (skills.length === 0) io.line(paint(io.caps, "dim", "暂无 Skill,nexum skill register <address> 注册"))
}

export async function cmdSkillDetail(client: NexumClient, io: CliIO, id: string): Promise<void> {
  const skill = (await client.experimental.nexum.skill.detail({ id })).data
  io.line(`${style(io.caps, ["bold"], skill.name)} ${paint(io.caps, "dim", skill.version ? `v${skill.version} ·` : "")} ${statusPaint(io, skill.status)}`)
  io.line(`${paint(io.caps, "dim", "描述   ")}${skill.description}`)
  io.line(`${paint(io.caps, "dim", "文件   ")}${skill.fileCount} 个(${skill.files.slice(0, 5).join("、")}${skill.fileCount > 5 ? " …" : ""})`)
  io.line(`${paint(io.caps, "dim", "digest ")}${skill.digest.slice(0, 16)}…`)
  for (const diagnostic of skill.diagnostics) io.line(paint(io.caps, "yellow", `  ⚠ ${diagnostic}`))
}

export async function cmdSkillValidate(client: NexumClient, io: CliIO, id?: string): Promise<void> {
  const result = (await client.experimental.nexum.skill.validate(id ? { id } : {})).data
  io.line(result.valid ? `${paint(io.caps, "green", "✓")} valid · ${result.data.length} 个 Skill` : `${paint(io.caps, "red", "✗")} 存在无效 Skill`)
}

export async function cmdSkillRefresh(client: NexumClient, io: CliIO, id?: string): Promise<void> {
  const skills = (await client.experimental.nexum.skill.refresh(id ? { id } : {})).data
  io.line(`${paint(io.caps, "green", "✓")} 已刷新 ${skills.length} 个 Skill`)
}

export async function cmdSkillRegister(client: NexumClient, io: CliIO, address: string): Promise<void> {
  const skill = (await client.experimental.nexum.skill.register({ address })).data
  io.line(`${paint(io.caps, "green", "✓")} 已注册 ${paint(io.caps, "cyan", `@${skill.id}`)}(${statusPaint(io, skill.status)})`)
}

export async function cmdSkillUnregister(client: NexumClient, io: CliIO, id: string): Promise<void> {
  await client.experimental.nexum.skill.unregister({ id })
  io.line(`${paint(io.caps, "green", "✓")} 已注销 @${id}(源目录未改动)`)
}

export async function cmdMcpList(client: NexumClient, io: CliIO): Promise<void> {
  const servers = (await client.experimental.nexum.mcp.list()).data
  io.line(paint(io.caps, "dim", "ID          状态         端点 / 错误"))
  for (const server of servers) {
    const detail = server.error ? `${server.error.code}: ${server.error.message}` : (server.url ?? "")
    const retry = server.status === "retrying" && server.retryAttempt !== undefined ? `第 ${server.retryAttempt} 次重试` : detail
    io.line(`${server.id.padEnd(10)}  ${statusPaint(io, server.status).padEnd(12)}  ${retry}`)
  }
  if (servers.length === 0) io.line(paint(io.caps, "dim", "暂无 MCP Server,nexum mcp add 添加"))
}

export async function cmdMcpAdd(client: NexumClient, io: CliIO, prompter: Prompter): Promise<void> {
  const id = (await prompter("id › ")).trim()
  const name = (await prompter("name › ")).trim() || id
  const url = (await prompter("url › ")).trim()
  if (!id || !url) {
    io.line(paint(io.caps, "red", "id 与 url 不能为空"))
    return
  }
  const server = (await client.experimental.nexum.mcp.add({ id, name, url })).data
  io.line(`${paint(io.caps, "green", "✓")} 已添加 ${server.id}(${statusPaint(io, server.status)})`)
}

export async function cmdMcpConnect(client: NexumClient, io: CliIO, prompter: Prompter, id: string): Promise<number> {
  const server = (await client.experimental.nexum.mcp.connect({ id })).data
  if (server.status !== "needs_auth") {
    io.line(`${paint(io.caps, "green", "✓")} 已连接(${statusPaint(io, server.status)})`)
    return 0
  }
  const attempt = (await client.experimental.nexum.mcp.authorize({ id })).data
  if (!attempt.authorizationUrl) {
    io.line(paint(io.caps, "red", "授权失败:未返回授权地址"))
    return 1
  }
  io.line(`授权地址 ${paint(io.caps, "cyan", attempt.authorizationUrl)} ${paint(io.caps, "dim", "(已尝试打开浏览器)")}`)
  openBrowser(attempt.authorizationUrl)
  const redirectUrl = (await prompter("粘贴回调 URL › ")).trim()
  if (!redirectUrl) {
    await client.experimental.nexum.mcp.cancelAuthorization({ attemptID: attempt.id })
    io.line(paint(io.caps, "dim", "已取消授权"))
    return 130
  }
  await client.experimental.nexum.mcp.completeAuthorization({ attemptID: attempt.id, redirectUrl })
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const status = (await client.experimental.nexum.mcp.authorizationStatus({ attemptID: attempt.id })).data
    if (status.status === "authorized") {
      io.line(`${paint(io.caps, "green", "✓")} 已连接(authorized)`)
      return 0
    }
    if (status.status === "failed" || status.status === "expired" || status.status === "cancelled") {
      io.line(paint(io.caps, "red", `授权${status.status === "failed" ? "失败" : status.status === "expired" ? "过期" : "已取消"}`))
      return 1
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  io.line(paint(io.caps, "red", "授权超时"))
  return 1
}

export async function cmdMcpDisconnect(client: NexumClient, io: CliIO, id: string): Promise<void> {
  const server = (await client.experimental.nexum.mcp.disconnect({ id })).data
  io.line(`${paint(io.caps, "green", "✓")} 已断开 ${server.id}(${statusPaint(io, server.status)})`)
}

export async function cmdMcpRemove(client: NexumClient, io: CliIO, id: string): Promise<void> {
  await client.experimental.nexum.mcp.remove({ id })
  io.line(`${paint(io.caps, "green", "✓")} 已移除 ${id}`)
}

export async function cmdMcpTools(client: NexumClient, io: CliIO, id: string): Promise<void> {
  const tools = (await client.experimental.nexum.mcp.tools({ id })).data
  for (const tool of tools) io.line(`${tool.name.padEnd(20)}${paint(io.caps, "dim", tool.description ?? "")}`)
  io.line(paint(io.caps, "dim", `共 ${tools.length} 个工具`))
}

export async function cmdMcpResources(client: NexumClient, io: CliIO, id: string): Promise<void> {
  const resources = (await client.experimental.nexum.mcp.resources({ id })).data
  for (const resource of resources) io.line(`${resource.uri.padEnd(30)}${paint(io.caps, "dim", resource.name)}`)
  io.line(paint(io.caps, "dim", `共 ${resources.length} 个资源`))
}

export async function cmdMcpPrompts(client: NexumClient, io: CliIO, id: string): Promise<void> {
  const prompts = (await client.experimental.nexum.mcp.prompts({ id })).data
  for (const prompt of prompts) io.line(`${prompt.name.padEnd(20)}${paint(io.caps, "dim", prompt.description ?? "")}`)
  io.line(paint(io.caps, "dim", `共 ${prompts.length} 个提示`))
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  const child = spawn(command, [url], { detached: true, stdio: "ignore" })
  child.on("error", () => {})
  child.unref()
}
