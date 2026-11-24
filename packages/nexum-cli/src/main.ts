#!/usr/bin/env bun
/** Nexum CLI 入口:参数解析、子命令分发、退出码约定(0 成功/1 失败/2 用法错误/130 取消)。 */

import { createInterface } from "node:readline/promises"
import { parseArgs } from "node:util"
import { Nexum, NexumClientError } from "@nexum/client"
import { ChatProtocolError, createChatProtocolAdapter } from "@nexum/surface-adapter"
import {
  cmdDoctor,
  cmdMcpAdd,
  cmdMcpConnect,
  cmdMcpDisconnect,
  cmdMcpList,
  cmdMcpPrompts,
  cmdMcpRemove,
  cmdMcpResources,
  cmdMcpTools,
  cmdModelGet,
  cmdModelProbe,
  cmdModelSet,
  cmdRolePromptGet,
  cmdRolePromptReset,
  cmdRolePromptSet,
  cmdSkillDetail,
  cmdSkillList,
  cmdSkillRefresh,
  cmdSkillRegister,
  cmdSkillUnregister,
  cmdSkillValidate,
  cmdStatus,
  cmdTheme,
} from "./admin"
import { cmdPrompt, cmdResume, cmdSessionCreate, cmdSessionList, resolveSessionID } from "./commands"
import { logoLines } from "./anim"
import { loadCliConfig, resolveTheme } from "./config"
import type { Prompter } from "./interact"
import { createIO } from "./io"
import { readlineLineSource, runRepl } from "./repl"
import { detectCaps, paint } from "./term"

export const USAGE = `Nexum CLI — 与 Web UI 同级的终端 Surface

用法: nexum [--server <url>] [--session <id>] [--theme <主题>] [--no-anim] [命令]

  (无命令)                进入 REPL(复用最近会话或新建)
  resume                  交互式选择会话恢复(-c/--continue 跳过选择直接恢复最近)
  session list            列出会话
  session create [--dir <路径>] [--name <名称>]
  prompt <文本> [--session <id>]   流式执行,退出码 0/1/130
  status                  连接与配置总览
  doctor                  逐项诊断(存在失败项时退出码 1)
  theme [dark|light|auto] 查看/切换主题(写入 ~/.nexum/cli.json)
  model get | model set | model probe
  role-prompt get | role-prompt set <文件> | role-prompt reset
  skill list | skill detail <id> | skill validate [id] | skill refresh [id] | skill register <地址> | skill unregister <id>
  mcp list | mcp add | mcp connect <id> | mcp disconnect <id> | mcp remove <id> | mcp tools <id> | mcp resources <id> | mcp prompts <id>

选项:
  --server    Server 地址(默认 $NEXUM_API_URL 或 http://127.0.0.1:4097)
  --session   指定会话 ID
  -c, --continue  恢复最近会话
  --theme     dark|light|auto(优先级高于配置文件)
  --no-anim   禁用动画(非 TTY 自动禁用)
  --version   显示版本
  --help      显示帮助`

export function resolveBaseUrl(flag: string | undefined, env: Record<string, string | undefined>): string {
  return flag ?? env.NEXUM_API_URL ?? "http://127.0.0.1:4097"
}

/** 一次性命令的问答器:无提示符、按需创建,避免 readlineLineSource 的 "nexum ▸ " 污染输出。 */
function questionPrompter(): { prompter: Prompter; close(): void } {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return { prompter: (query) => rl.question(query), close: () => rl.close() }
}

export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      server: { type: "string" },
      session: { type: "string" },
      theme: { type: "string" },
      dir: { type: "string" },
      name: { type: "string" },
      continue: { type: "boolean", default: false, short: "c" },
      "no-anim": { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  })
  if (values.help) {
    console.log(USAGE)
    return 0
  }
  if (values.version) {
    console.log(`nexum 0.1.0 · 协议 nexum.runtime.v1`)
    return 0
  }
  const config = await loadCliConfig()
  const io = createIO({ caps: detectCaps({ noAnim: values["no-anim"], theme: resolveTheme(values.theme, config, process.env) }) })
  const [command, ...rest] = positionals
  // theme 是纯本地命令:不依赖 server,在 capabilities 探测前短路
  if (command === "theme") {
    await cmdTheme(io, rest)
    return 0
  }
  const baseUrl = resolveBaseUrl(values.server, process.env)
  const client = Nexum.make({ baseUrl })
  try {
    await client.capabilities()
  } catch {
    io.line(`无法连接 ${baseUrl}`)
    io.line("请先启动 Server:bun run --cwd packages/nexum-server dev")
    return 1
  }
  const adapter = createChatProtocolAdapter({ baseUrl })
  try {
    if (command === undefined || command === "resume") {
      const skills = await adapter.listSkills()
      for (const logoLine of logoLines(io.caps)) io.line(logoLine)
      io.line(paint(io.caps, "dim", "v0.1.0 · 协议 nexum.runtime.v1"))
      const lineSource = readlineLineSource(() => skills.filter((skill) => skill.status === "ready").map((skill) => skill.id))
      try {
        let sessionID: string | undefined
        if (command === "resume") {
          sessionID = values.continue ? await resolveSessionID(client, io) : await cmdResume(client, io, lineSource.prompter)
          if (!sessionID) return 1
        } else {
          sessionID = await resolveSessionID(client, io, values.session)
        }
        await runRepl({ adapter, client, io, sessionID, lineSource, prompter: lineSource.prompter, baseUrl })
        return 0
      } finally {
        lineSource.close()
      }
    }
    const prompter = questionPrompter()
    try {
      if (command === "status") return await cmdStatus(client, io, { baseUrl }).then(() => 0)
      if (command === "doctor") return await cmdDoctor(client, io)
      if (command === "session") {
        if (rest[0] === "list") return await cmdSessionList(client, io).then(() => 0)
        if (rest[0] === "create") return await cmdSessionCreate(client, io, { directory: values.dir ?? process.cwd(), ...(values.name ? { name: values.name } : {}) }).then(() => 0)
      }
      if (command === "prompt") {
        const text = rest.join(" ").trim()
        if (!text) {
          io.line("用法:nexum prompt <文本> [--session <id>]")
          return 2
        }
        return await cmdPrompt({ client, adapter, io, prompter: prompter.prompter, text, ...(values.session ? { sessionID: values.session } : {}), directory: process.cwd() })
      }
      if (command === "model") {
        if (rest[0] === "get") return await cmdModelGet(client, io).then(() => 0)
        if (rest[0] === "set") return await cmdModelSet(client, io, prompter.prompter).then(() => 0)
        if (rest[0] === "probe") return await cmdModelProbe(client, io).then(() => 0)
      }
      if (command === "role-prompt") {
        if (rest[0] === "get") return await cmdRolePromptGet(client, io).then(() => 0)
        if (rest[0] === "set" && rest[1]) return await cmdRolePromptSet(client, io, rest[1]).then(() => 0)
        if (rest[0] === "reset") return await cmdRolePromptReset(client, io).then(() => 0)
      }
      if (command === "skill") {
        if (rest[0] === "list") return await cmdSkillList(client, io).then(() => 0)
        if (rest[0] === "detail" && rest[1]) return await cmdSkillDetail(client, io, rest[1]).then(() => 0)
        if (rest[0] === "validate") return await cmdSkillValidate(client, io, rest[1]).then(() => 0)
        if (rest[0] === "refresh") return await cmdSkillRefresh(client, io, rest[1]).then(() => 0)
        if (rest[0] === "register" && rest[1]) return await cmdSkillRegister(client, io, rest[1]).then(() => 0)
        if (rest[0] === "unregister" && rest[1]) return await cmdSkillUnregister(client, io, rest[1]).then(() => 0)
      }
      if (command === "mcp") {
        if (rest[0] === "list") return await cmdMcpList(client, io).then(() => 0)
        if (rest[0] === "add") return await cmdMcpAdd(client, io, prompter.prompter).then(() => 0)
        if (rest[0] === "connect" && rest[1]) return await cmdMcpConnect(client, io, prompter.prompter, rest[1])
        if (rest[0] === "disconnect" && rest[1]) return await cmdMcpDisconnect(client, io, rest[1]).then(() => 0)
        if (rest[0] === "remove" && rest[1]) return await cmdMcpRemove(client, io, rest[1]).then(() => 0)
        if (rest[0] === "tools" && rest[1]) return await cmdMcpTools(client, io, rest[1]).then(() => 0)
        if (rest[0] === "resources" && rest[1]) return await cmdMcpResources(client, io, rest[1]).then(() => 0)
        if (rest[0] === "prompts" && rest[1]) return await cmdMcpPrompts(client, io, rest[1]).then(() => 0)
      }
      io.line(`未知命令:${positionals.join(" ")}\n`)
      io.line(USAGE)
      return 2
    } finally {
      prompter.close()
    }
  } catch (error) {
    if (error instanceof ChatProtocolError || error instanceof NexumClientError) {
      process.stderr.write(`${error.code}: ${error.message}${error.traceId ? `(traceId: ${error.traceId})` : ""}\n`)
      return 1
    }
    process.stderr.write(`${error instanceof Error ? error.message : "命令执行失败"}\n`)
    return 1
  }
}

if (import.meta.main) {
  const code = await run(process.argv.slice(2))
  process.exit(code)
}
