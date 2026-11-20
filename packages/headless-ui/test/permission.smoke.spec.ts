import { chromium, expect, type Browser } from "@playwright/test"
import { afterEach, describe, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join, normalize } from "node:path"
import { tmpdir } from "node:os"
import {
  createHeadlessCodingLoop,
  createHeadlessProjectContextPort,
  createHeadlessQuestionPort,
  createHeadlessSessionService,
  type ContextCompactionPort,
  type ModelPort,
  type PermissionPort,
  type ToolPort,
} from "@opencode/headless-core"
import { createHeadlessEventHub } from "../../headless-server/src/events.ts"
import { startHeadlessServer, type HeadlessServer } from "../../headless-server/src/index.ts"

const uiOrigin = "http://127.0.0.1:5173"
const distDirectory = normalize(join(import.meta.dir, "../dist"))

let browser: Browser | undefined
let apiServer: HeadlessServer | undefined
let uiServer: Bun.Server<undefined> | undefined
let upstream: Bun.Server<undefined> | undefined
let directory: string | undefined
let skillRoot: string | undefined

afterEach(async () => {
  await browser?.close()
  await apiServer?.stop(true)
  await upstream?.stop(true)
  uiServer?.stop(true)
  if (directory) await rm(directory, { recursive: true, force: true })
  apiServer = undefined
  browser = undefined
  upstream = undefined
  uiServer = undefined
  directory = undefined
  if (skillRoot) await rm(skillRoot, { recursive: true, force: true })
  skillRoot = undefined
})

describe.serial("Headless UI smoke", () => {
  test.serial("denying a tool request fails the task without writing to the session directory", async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    upstream = Bun.serve({
      port: 0,
      async fetch() {
        return Response.json({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_denied_write",
                    type: "function",
                    function: {
                      name: "write",
                      arguments: JSON.stringify({ path: "denied.txt", content: "must not exist" }),
                    },
                  },
                ],
              },
            },
          ],
        })
      },
    })
    apiServer = await startHeadlessServer({ port: 4097, corsOrigins: [uiOrigin] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "headless-ui-deny-"))

    await page.goto(uiOrigin)
    await page.getByLabel("Base URL").fill(upstream.url.toString().replace(/\/$/, ""))
    await page.getByLabel("Model").fill("fixture-model")
    await page.getByRole("button", { name: "Save model config" }).click()
    await expect(page.getByText("Model fixture-model is armed")).toBeVisible()

    await page.getByLabel("Working directory").fill(directory)
    await page.getByRole("button", { name: /Create session/ }).click()
    await expect(page.getByText(/is waiting for a prompt/)).toBeVisible()

    await page.getByPlaceholder("Describe the next coding move…").fill("写入 denied.txt")
    await page.getByRole("button", { name: /^Send/ }).click()
    await page.getByRole("button", { name: "Deny" }).click()

    await expect(page.locator(".pill-failed")).toBeVisible()
    await expect(page.getByText("session.failed")).toBeVisible()
    await expect(page.getByRole("button", { name: "Deny" })).toHaveCount(0)
    expect(await Bun.file(join(directory, "denied.txt")).exists()).toBe(false)
  })

  test.serial("allowing a tool completes the task without exposing credential-shaped output", async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    let upstreamCalls = 0
    upstream = Bun.serve({
      port: 0,
      async fetch() {
        upstreamCalls += 1
        if (upstreamCalls > 1) return Response.json({ choices: [{ message: { content: "命令已执行" } }] })
        return Response.json({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_shell_secret",
                    type: "function",
                    function: {
                      name: "shell",
                      arguments: JSON.stringify({ command: "printf 'Authorization: Bearer super-secret-token'" }),
                    },
                  },
                ],
              },
            },
          ],
        })
      },
    })
    apiServer = await startHeadlessServer({ port: 4097, corsOrigins: [uiOrigin] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "headless-ui-allow-"))

    await page.goto(uiOrigin)
    await page.getByLabel("Base URL").fill(upstream.url.toString().replace(/\/$/, ""))
    await page.getByLabel("Model").fill("fixture-model")
    await page.getByRole("button", { name: "Save model config" }).click()
    await page.getByLabel("Working directory").fill(directory)
    await page.getByRole("button", { name: /Create session/ }).click()
    await page.getByPlaceholder("Describe the next coding move…").fill("查看环境")
    await page.getByRole("button", { name: /^Send/ }).click()
    await page.getByRole("button", { name: "Allow once" }).click()

    await expect(page.locator(".pill-completed")).toBeVisible()
    await expect(page.getByText("tool.result")).toBeVisible()
    await expect(page.locator("body")).not.toContainText("super-secret-token")
  })

  test.serial("answers a Question and shows compaction plus project context states", async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const sessions = createHeadlessSessionService()
    const questions = createHeadlessQuestionPort()
    const eventHub = createHeadlessEventHub()
    const projectContext = createHeadlessProjectContextPort({
      sources: [{ sourceID: "instruction:project", kind: "instruction", path: "AGENTS.md" }],
      readFile: async () => "仅允许 Headless API",
    })
    let step = 0
    const model: ModelPort = {
      async *prompt() {
        step += 1
        if (step === 1) {
          yield {
            type: "question",
            questionID: "question_ui_001",
            toolCallID: "call_question_ui_001",
            questions: [{ header: "目录", question: "选择目录", options: [{ label: "src", description: "源代码" }] }],
          }
          return
        }
        if (step === 2) {
          yield {
            type: "tool-call",
            toolCallID: "call_read_ui_001",
            toolName: "read",
            toolInput: { path: "README.md" },
          }
          return
        }
        yield { type: "completed" }
      },
    }
    const permission: PermissionPort = {
      async evaluate() {
        return "allow"
      },
    }
    const tool: ToolPort = {
      async execute() {
        return { ok: true, output: "README 内容" }
      },
    }
    const compaction: ContextCompactionPort = {
      estimate: (messages) => (messages.some((message) => message.role === "tool") ? 100 : 1),
      async compact() {
        return { summary: "UI smoke summary", recentMessages: [], context: [] }
      },
    }
    const codingLoop = createHeadlessCodingLoop({
      model,
      tool,
      permission,
      sessions,
      events: eventHub,
      question: questions,
      projectContext,
      contextCompaction: compaction,
      compactionThreshold: 10,
    })
    apiServer = await startHeadlessServer({
      port: 4097,
      corsOrigins: [uiOrigin],
      sessionService: sessions,
      eventHub,
      codingLoop,
      questionPort: questions,
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "headless-ui-question-"))

    await page.goto(uiOrigin)
    await page.getByLabel("Working directory").fill(directory)
    await page.getByRole("button", { name: /Create session/ }).click()
    await page.getByPlaceholder("Describe the next coding move…").fill("先确认目录，再读取 README")
    await page.getByRole("button", { name: /^Send/ }).click()
    await expect(page.getByText("选择目录", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: /^src/ }).click()
    await page.getByRole("button", { name: "Submit answers" }).click()

    await expect(page.locator(".pill-completed")).toBeVisible()
    await expect(page.locator(".context-value").filter({ hasText: "completed" })).toBeVisible()
    await expect(page.getByText("AGENTS.md", { exact: true })).toBeVisible()
    await expect(
      page.locator(".event-body strong").filter({ hasText: "context.compaction.completed" }).first(),
    ).toBeVisible()
  })

  test.serial("loads project Skills, completes @ autocomplete, and validates the active Skill", async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    skillRoot = await mkdtemp(join(tmpdir(), "headless-ui-skill-root-"))
    const skillDirectory = join(skillRoot, "metric-view-lifecycle")
    await mkdir(skillDirectory)
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      "---\nname: metric-view-lifecycle\ndescription: Metric view lifecycle test skill\nversion: 0.1.0\n---\n\n# Test Skill\n",
    )
    apiServer = await startHeadlessServer({ port: 4097, corsOrigins: [uiOrigin], skillRoots: [skillRoot] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })

    await page.goto(uiOrigin)
    await expect(page.getByText("metric-view-lifecycle", { exact: true }).first()).toBeVisible()
    directory = await mkdtemp(join(tmpdir(), "headless-ui-skill-session-"))
    await page.getByLabel("Working directory").fill(directory)
    await page.getByRole("button", { name: /Create session/ }).click()
    await expect(page.getByText(/is waiting for a prompt/)).toBeVisible()
    await page.getByPlaceholder("Describe the next coding move…").fill("@met")
    await expect(page.getByRole("option", { name: "@metric-view-lifecycle" })).toBeVisible()
    await page.getByRole("option", { name: "@metric-view-lifecycle" }).click()
    await expect(page.locator(".skill-chip")).toContainText("metric-view-lifecycle")
    await page.getByRole("button", { name: "Validate" }).click()
    await expect(page.getByText("validated / ready", { exact: true })).toBeVisible()
  })

  test.serial("controls model probe and restores the selected session from the page", async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    apiServer = await startHeadlessServer({
      port: 4097,
      modelProbe: {
        async probe(input) {
          expect(input).toEqual({ mode: "both" })
          return { text: "pass", functionCalling: "pass" }
        },
      },
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "headless-ui-control-plane-"))

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "Probe model" }).click()
    await expect(page.getByText("Text response: pass", { exact: true })).toBeVisible()
    await expect(page.getByText("Function Calling: pass", { exact: true })).toBeVisible()

    await page.getByLabel("Working directory").fill(directory)
    await page.getByRole("button", { name: /Create session/ }).click()
    await expect(page.getByText(/is waiting for a prompt/)).toBeVisible()
    const activeSession = await page.locator(".session-id").innerText()

    await page.reload()
    await expect(page.locator(".session-id")).toHaveText(activeSession)
    await page.getByRole("button", { name: "Reconnect events" }).click()
    await expect(page.getByText("event stream live", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Refresh runtime" }).click()
    await expect(page.getByText("Runtime state refreshed.", { exact: true })).toBeVisible()
  })
})

async function serveBuiltUi(request: Request): Promise<Response> {
  const pathname = decodeURIComponent(new URL(request.url).pathname)
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1)
  const filePath = normalize(join(distDirectory, relativePath))
  if (!filePath.startsWith(`${distDirectory}/`)) return new Response("Not found", { status: 404 })
  const file = Bun.file(filePath)
  if (!(await file.exists())) return new Response("Not found", { status: 404 })
  return new Response(file)
}
