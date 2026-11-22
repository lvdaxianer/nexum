import { chromium, expect, type Browser, type Page } from "@playwright/test"
import { afterEach, describe, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join, normalize } from "node:path"
import { tmpdir } from "node:os"
import {
  createHeadlessCodingLoop,
  createHeadlessPermissionBroker,
  createHeadlessProjectContextPort,
  createHeadlessQuestionPort,
  createHeadlessSessionService,
  createHeadlessSkillInvocationPort,
  createHeadlessSkillRegistry,
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
const extraDirectories: string[] = []

afterEach(async () => {
  await browser?.close()
  await apiServer?.stop(true)
  await upstream?.stop(true)
  await uiServer?.stop(true)
  if (directory) await rm(directory, { recursive: true, force: true })
  await Promise.all(extraDirectories.splice(0).map((item) => rm(item, { recursive: true, force: true })))
  apiServer = undefined
  browser = undefined
  upstream = undefined
  uiServer = undefined
  directory = undefined
  if (skillRoot) await rm(skillRoot, { recursive: true, force: true })
  skillRoot = undefined
})

describe.serial("Headless UI smoke", () => {
  test.serial("uses the served UI host for default API requests", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const remoteUiOrigin = "http://localhost:5173"
    const remoteApiOrigin = "http://localhost:4097"
    apiServer = await startHeadlessServer({
      port: 4097,
      corsOrigins: [remoteUiOrigin],
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
    const apiRequest = page.waitForRequest(
      (request) =>
        request.method() === "GET" && request.url().startsWith(`${remoteApiOrigin}/api/experimental/headless/`),
    )

    await page.goto(remoteUiOrigin)
    await apiRequest
    await expect(page.getByRole("heading", { name: "Agent 工作台" })).toBeVisible()
  })

  test.serial("renders the internal Agent workbench shell", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })

    await page.goto(uiOrigin)
    await expect(page.getByRole("heading", { name: "Agent 工作台" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Coding Loop" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "运行状态" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "对话" })).toBeVisible()
    await expect(page.getByRole("tab", { name: /事件/ })).toBeVisible()
    await expect(page.getByText("上下文", { exact: true })).toBeVisible()
    await openDrawer(page, /模型配置/)
    await expect(page.getByLabel("服务地址")).toHaveValue("")
    await expect(page.getByLabel("模型名称")).toHaveValue("")
    await closeDrawer(page)
    await openDrawer(page, /Skills/)
    await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible()
  })

  test.serial("keeps name and directory attached to each session", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const eventHub = createHeadlessEventHub()
    apiServer = await startHeadlessServer({ port: 4097, corsOrigins: [uiOrigin], eventHub })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
    const firstDirectory = await mkdtemp(join(tmpdir(), "headless-ui-session-a-"))
    const secondDirectory = await mkdtemp(join(tmpdir(), "headless-ui-session-b-"))
    directory = firstDirectory
    extraDirectories.push(secondDirectory)

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("Session 名称").fill("前端应用")
    await page.getByLabel("工作目录").fill(firstDirectory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByRole("button", { name: /前端应用/ })).toBeVisible()
    await expect(page.locator(".current-session-directory")).toHaveText(firstDirectory)

    const secondEventsResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/experimental/headless/session/") && response.url().endsWith("/events"),
    )
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(secondDirectory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.locator(".current-session-directory")).toHaveText(secondDirectory)
    await secondEventsResponse
    const secondID = await page.locator(".session-id").innerText()
    await eventHub.publish({
      eventID: "event_session_storage",
      runID: "run_session_storage",
      sessionID: secondID,
      type: "assistant.text",
      sequence: 1,
      occurredAt: "2026-11-21T00:00:00.000Z",
      data: { content: "session storage check" },
    })
    await page.getByRole("tab", { name: /事件/ }).click()
    await expect(page.getByText("assistant.text", { exact: true })).toBeVisible()
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual(["headless.sessionID"])
    await page.getByRole("button", { name: /前端应用/ }).click()
    await expect(page.locator(".current-session-directory")).toHaveText(firstDirectory)

    await page.getByRole("button", { name: "会话操作" }).click()
    await page.getByRole("dialog", { name: "会话操作" }).getByLabel("Session 名称").fill("前端重命名")
    await page.getByRole("button", { name: "保存名称" }).click()
    await expect(page.getByRole("button", { name: /前端重命名/ })).toBeVisible()
  })

  test.serial("validates model and workspace inputs before sending requests", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    let modelUpdateCalls = 0
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/experimental/headless/model"))
        modelUpdateCalls += 1
    })
    apiServer = await startHeadlessServer({ port: 4097, corsOrigins: [uiOrigin] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })

    await page.goto(uiOrigin)
    await openDrawer(page, /模型配置/)
    await page.getByLabel("服务地址").fill("not-a-url")
    await page.getByLabel("模型名称").fill("   ")
    await page.getByRole("button", { name: "保存模型配置" }).click()

    await expect(page.getByText("请输入有效的 HTTP 或 HTTPS 服务地址", { exact: true })).toBeVisible()
    await expect(page.getByText("请输入模型名称", { exact: true })).toBeVisible()
    await expect(page.getByText("请填写凭据引用或凭据值", { exact: true })).toBeVisible()
    expect(modelUpdateCalls).toBe(0)
    await closeDrawer(page)

    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill("relative/project")
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.locator("#session-directory-error")).toHaveText(
      "请输入服务器上的绝对路径，例如 /workspace/project",
    )
  })

  test.serial("keeps an invalid workspace input after server-side validation fails", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    apiServer = await startHeadlessServer({ port: 4097, corsOrigins: [uiOrigin] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })

    const invalidDirectory = "/tmp/headless-ui-directory-does-not-exist"
    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(invalidDirectory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()

    await expect(page.locator("#session-directory-error")).toHaveText("工作目录不存在或不可访问")
    await expect(page.getByLabel("工作目录")).toHaveValue(invalidDirectory)
    await expect(page.getByRole("button", { name: "保存并创建 Session" })).toBeEnabled()
  })

  test.serial(
    "prevents duplicate session creation while the directory check is pending",
    { timeout: 15_000 },
    async () => {
      browser = await chromium.launch({ headless: true })
      const page = await browser.newPage()
      let validations = 0
      const sessions = createHeadlessSessionService({
        directoryValidator: {
          async validate() {
            validations += 1
            await new Promise((resolve) => setTimeout(resolve, 120))
          },
        },
      })
      apiServer = await startHeadlessServer({ port: 4097, corsOrigins: [uiOrigin], sessionService: sessions })
      uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
      directory = await mkdtemp(join(tmpdir(), "headless-ui-create-pending-"))

      await page.goto(uiOrigin)
      await page.getByRole("button", { name: "新建 Session" }).click()
      await page.getByLabel("工作目录").fill(directory)
      await page.getByRole("button", { name: "保存并创建 Session" }).dblclick()
      await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
      expect(validations).toBe(1)
    },
  )

  test.serial("asks for confirmation before cancelling a run", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    apiServer = await startHeadlessServer({ port: 4097, corsOrigins: [uiOrigin] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "headless-ui-cancel-"))

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()

    await page.getByRole("button", { name: "取消运行" }).click()
    await expect(page.getByRole("alertdialog")).toBeVisible()
    await expect(page.getByText("取消后正在执行的 Agent 任务会立即停止", { exact: false })).toBeVisible()

    await page.getByRole("button", { name: "返回" }).click()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await expect(page.getByText("已请求取消运行", { exact: true })).toHaveCount(0)

    await page.getByRole("button", { name: "取消运行" }).click()
    await page.getByRole("button", { name: "确认取消运行" }).click()
    await expect(page.getByText("已请求取消运行", { exact: true })).toBeVisible()
    await expect(page.locator(".pill-cancelled")).toBeVisible()
  })

  test.serial("ignores a stale session snapshot when switching sessions quickly", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    apiServer = await startHeadlessServer({ port: 4097, corsOrigins: [uiOrigin] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
    const firstDirectory = await mkdtemp(join(tmpdir(), "headless-ui-race-a-"))
    const secondDirectory = await mkdtemp(join(tmpdir(), "headless-ui-race-b-"))
    directory = firstDirectory
    extraDirectories.push(secondDirectory)

    let stateCalls = 0
    await page.route("**/api/experimental/headless/session/*/state", async (route) => {
      stateCalls += 1
      if (stateCalls === 1) await new Promise((resolve) => setTimeout(resolve, 400))
      await route.continue()
    })

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(firstDirectory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
    const firstID = await page.locator(".session-id").innerText()

    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(secondDirectory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.locator(".session-id")).not.toHaveText(firstID)
    const secondID = await page.locator(".session-id").innerText()

    await page.locator(".session-item", { hasText: firstDirectory }).click()
    await page.locator(".session-item", { hasText: secondDirectory }).click()
    await page.waitForTimeout(700)

    expect(stateCalls).toBe(2)
    await expect(page.locator(".session-id")).toHaveText(secondID)
    await rm(secondDirectory, { recursive: true, force: true })
  })

  test.serial(
    "denying a tool request fails the task without writing to the session directory",
    { timeout: 15_000 },
    async () => {
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
      await openDrawer(page, /模型配置/)
      await page.getByLabel("服务地址").fill(upstream.url.toString().replace(/\/$/, ""))
      await page.getByLabel("模型名称").fill("fixture-model")
      await page.getByLabel("凭据值").fill("fixture-secret")
      await page.getByRole("button", { name: "保存模型配置" }).click()
      await expect(page.getByText("模型 fixture-model 已就绪")).toBeVisible()
      await closeDrawer(page)

      await page.getByRole("button", { name: "新建 Session" }).click()
      await page.getByLabel("工作目录").fill(directory)
      await page.getByRole("button", { name: "保存并创建 Session" }).click()
      await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()

      await page.getByPlaceholder("描述下一步 Coding 任务…").fill("写入 denied.txt")
      await page.getByRole("button", { name: /发送 Prompt/ }).click()
      await page.getByTestId("permission-actions").getByRole("button", { name: "拒绝" }).click()

      await expect(page.locator(".pill-failed")).toBeVisible()
      await page.getByRole("tab", { name: /事件/ }).click()
      await expect(page.getByText("session.failed")).toBeVisible()
      await expect(page.getByRole("button", { name: "拒绝" })).toHaveCount(0)
      expect(await Bun.file(join(directory, "denied.txt")).exists()).toBe(false)
    },
  )

  test.serial(
    "allowing a tool completes the task without exposing credential-shaped output",
    { timeout: 15_000 },
    async () => {
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
      await openDrawer(page, /模型配置/)
      await page.getByLabel("服务地址").fill(upstream.url.toString().replace(/\/$/, ""))
      await page.getByLabel("模型名称").fill("fixture-model")
      await page.getByLabel("凭据值").fill("fixture-secret")
      await page.getByRole("button", { name: "保存模型配置" }).click()
      await closeDrawer(page)
      await page.getByRole("button", { name: "新建 Session" }).click()
      await page.getByLabel("工作目录").fill(directory)
      await page.getByRole("button", { name: "保存并创建 Session" }).click()
      await page.getByPlaceholder("描述下一步 Coding 任务…").fill("查看环境")
      await page.getByRole("button", { name: /发送 Prompt/ }).click()
      const permissionActions = page.getByTestId("permission-actions")
      await expect(permissionActions).toBeVisible()
      await permissionActions.getByRole("button", { name: "允许一次" }).click()

      await expect(page.locator(".pill-completed")).toBeVisible()
      await expect(page.locator(".chat-message.user")).toContainText("查看环境")
      await expect(page.locator(".chat-message.assistant")).toContainText("命令已执行")
      await expect(page.locator(".act-row").filter({ hasText: "工具结果" })).toContainText("已完成")
      await page.getByRole("tab", { name: /事件/ }).click()
      await expect(page.getByText("tool.result")).toBeVisible()
      await expect(page.locator("body")).not.toContainText("super-secret-token")
    },
  )

  test.serial("answers a Question and shows compaction plus project context states", { timeout: 15_000 }, async () => {
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
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await page.getByPlaceholder("描述下一步 Coding 任务…").fill("先确认目录，再读取 README")
    await page.getByRole("button", { name: /发送 Prompt/ }).click()
    await expect(page.getByText("选择目录", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: /^src/ }).click()
    await page.getByRole("button", { name: "提交回答" }).click()

    await expect(page.locator(".pill-completed")).toBeVisible()
    await expect(page.locator(".context-value").filter({ hasText: "completed" })).toBeVisible()
    await expect(page.getByText("AGENTS.md", { exact: true })).toBeVisible()
    await page.getByRole("tab", { name: /事件/ }).click()
    await expect(
      page.locator(".event-body strong").filter({ hasText: "context.compaction.completed" }).first(),
    ).toBeVisible()
  })

  test.serial(
    "loads project Skills, completes @ autocomplete, and validates the active Skill",
    { timeout: 15_000 },
    async () => {
      browser = await chromium.launch({ headless: true })
      const page = await browser.newPage()
      skillRoot = await mkdtemp(join(tmpdir(), "headless-ui-skill-root-"))
      const skillDirectory = join(skillRoot, "example-skill")
      await mkdir(skillDirectory)
      await writeFile(
        join(skillDirectory, "SKILL.md"),
        "---\nname: example-skill\ndescription: Example test skill\nversion: 0.1.0\n---\n\n# Test Skill\n",
      )
      apiServer = await startHeadlessServer({ port: 4097, corsOrigins: [uiOrigin], skillRoots: [skillRoot] })
      uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })

      await page.goto(uiOrigin)
      await openDrawer(page, /Skills/)
      await expect(page.getByText("example-skill", { exact: true }).first()).toBeVisible()
      await closeDrawer(page)
      directory = await mkdtemp(join(tmpdir(), "headless-ui-skill-session-"))
      await page.getByRole("button", { name: "新建 Session" }).click()
      await page.getByLabel("工作目录").fill(directory)
      await page.getByRole("button", { name: "保存并创建 Session" }).click()
      await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
      await page.getByPlaceholder("描述下一步 Coding 任务…").fill("@exa")
      await expect(page.getByRole("option", { name: "@example-skill" })).toBeVisible()
      await page.getByRole("option", { name: "@example-skill" }).click()
      await expect(page.locator(".skill-chip")).toContainText("example-skill")
      await openDrawer(page, /Skills/)
      await page.getByRole("button", { name: "校验" }).click()
      await expect(page.getByText("validated / ready", { exact: true })).toBeVisible()
    },
  )

  test.serial("controls model probe and restores the selected session from the page", { timeout: 15_000 }, async () => {
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
    await openDrawer(page, /模型配置/)
    await page.getByLabel("服务地址").fill("https://model.example.com/v1")
    await page.getByLabel("模型名称").fill("fixture-model")
    await page.getByLabel("凭据值").fill("fixture-secret")
    await page.getByRole("button", { name: "探测模型能力" }).click()
    await expect(page.getByText("文本响应：pass", { exact: true })).toBeVisible()
    await expect(page.getByText("Function Calling：pass", { exact: true })).toBeVisible()
    await closeDrawer(page)

    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
    const activeSession = await page.locator(".session-id").innerText()

    await page.reload()
    await expect(page.locator(".session-id")).toHaveText(activeSession)
    await page.getByRole("button", { name: "会话操作" }).click()
    const opsDialog = page.getByRole("dialog", { name: "会话操作" })
    await opsDialog.getByRole("button", { name: "重新连接" }).click()
    await expect(page.getByText("事件流已连接", { exact: true })).toBeVisible()
    await opsDialog.getByRole("button", { name: "刷新状态" }).click()
    await expect(page.getByText("运行状态已刷新", { exact: true })).toBeVisible()
  })
  test.serial(
    "streams assistant deltas and renders markdown bold instead of raw asterisks",
    { timeout: 15_000 },
    async () => {
      browser = await chromium.launch({ headless: true })
      const page = await browser.newPage()
      const deltas = ["第一段**重点**", "说明"]
      upstream = Bun.serve({
        port: 0,
        async fetch() {
          const encoder = new TextEncoder()
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              for (const content of deltas) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`),
                )
                await new Promise((resolve) => setTimeout(resolve, 300))
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"))
              controller.close()
            },
          })
          return new Response(stream, { headers: { "content-type": "text/event-stream" } })
        },
      })
      apiServer = await startHeadlessServer({ port: 4097, corsOrigins: [uiOrigin] })
      uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
      directory = await mkdtemp(join(tmpdir(), "headless-ui-stream-markdown-"))

      await page.goto(uiOrigin)
      await openDrawer(page, /模型配置/)
      await page.getByLabel("服务地址").fill(upstream.url.toString().replace(/\/$/, ""))
      await page.getByLabel("模型名称").fill("fixture-model")
      await page.getByLabel("凭据值").fill("fixture-secret")
      await page.getByRole("button", { name: "保存模型配置" }).click()
      await expect(page.getByText("模型 fixture-model 已就绪")).toBeVisible()
      await closeDrawer(page)
      await page.getByRole("button", { name: "新建 Session" }).click()
      await page.getByLabel("工作目录").fill(directory)
      await page.getByRole("button", { name: "保存并创建 Session" }).click()
      await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()

      await page.getByPlaceholder("描述下一步 Coding 任务…").fill("打个招呼")
      await page.getByRole("button", { name: /发送 Prompt/ }).click()

      await expect(page.getByLabel("Coding Prompt")).toBeDisabled()
      await expect(page.getByRole("button", { name: "发送 Prompt" })).toBeDisabled()
      await expect(page.locator(".pill-completed")).toBeVisible()
      await expect(page.getByLabel("Coding Prompt")).toBeEnabled()
      const assistant = page.locator(".chat-message.assistant")
      await expect(assistant).toContainText("第一段重点说明")
      await expect(assistant.locator("strong", { hasText: "重点" })).toBeVisible()
      expect(await assistant.innerText()).not.toContain("**")
    },
  )
  test.serial("runs a configured Skill from page mention through Core permission", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const sessions = createHeadlessSessionService()
    const eventHub = createHeadlessEventHub()
    const permission = createHeadlessPermissionBroker()
    skillRoot = await mkdtemp(join(tmpdir(), "headless-ui-project-skill-root-"))
    const projectSkillDirectory = join(skillRoot, "example-skill")
    await mkdir(projectSkillDirectory)
    await writeFile(
      join(projectSkillDirectory, "SKILL.md"),
      "---\nname: example-skill\ndescription: Example project skill\nversion: 0.1.0\n---\n\n# Example Skill\n",
    )
    const projectSkillRoot = normalize(skillRoot)
    const registry = createHeadlessSkillRegistry({ roots: [projectSkillRoot] })
    await registry.refresh()
    const skills = createHeadlessSkillInvocationPort({ registry, permission })
    const model: ModelPort = {
      async *prompt(input) {
        expect(
          input.messages?.some((message) => message.role === "system" && message.sourceID === "skill:example-skill"),
        ).toBe(true)
        yield { type: "completed" }
      },
    }
    const tool: ToolPort = {
      async execute() {
        return { ok: true, output: "unused" }
      },
    }
    const codingLoop = createHeadlessCodingLoop({
      model,
      tool,
      permission,
      sessions,
      events: eventHub,
      skills,
    })
    apiServer = await startHeadlessServer({
      port: 4097,
      corsOrigins: [uiOrigin],
      sessionService: sessions,
      eventHub,
      codingLoop,
      permissionBroker: permission,
      skillRegistry: registry,
      skillInvocation: skills,
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "headless-ui-project-skill-"))

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await page.getByPlaceholder("描述下一步 Coding 任务…").fill("@example-skill 验证 Skill 激活")
    await page.getByRole("button", { name: /发送 Prompt/ }).click()
    await expect(page.getByTestId("permission-actions").getByRole("button", { name: "允许一次" })).toBeVisible()
    await page.getByTestId("permission-actions").getByRole("button", { name: "允许一次" }).click()
    await page.getByRole("tab", { name: /事件/ }).click()
    await expect(page.locator(".event-body strong").filter({ hasText: "skill.activated" })).toBeVisible()
    await expect(page.locator(".pill-completed")).toBeVisible()
  })

  test.serial("shows a thinking animation until the first assistant event arrives", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const sessions = createHeadlessSessionService()
    const eventHub = createHeadlessEventHub()
    let releaseRun: (() => void) | undefined
    const runReleased = new Promise<void>((resolve) => {
      releaseRun = resolve
    })
    const codingLoop = {
      async run(input: { sessionID: string }) {
        await sessions.setStatus(input.sessionID, "running")
        await runReleased
        const runID = crypto.randomUUID()
        await eventHub.publish({
          eventID: `thinking-${runID}`,
          runID,
          sessionID: input.sessionID,
          type: "assistant.text",
          sequence: 1,
          data: { content: "延迟回答已到达" },
        })
        await sessions.setStatus(input.sessionID, "completed")
        await eventHub.publish({
          eventID: `completed-${runID}`,
          runID,
          sessionID: input.sessionID,
          type: "session.completed",
          sequence: 2,
        })
        return (await sessions.get(input.sessionID))!
      },
      async cancel(sessionID: string) {
        return sessions.setStatus(sessionID, "cancelled")
      },
    }
    apiServer = await startHeadlessServer({
      port: 4097,
      corsOrigins: [uiOrigin],
      sessionService: sessions,
      eventHub,
      codingLoop,
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: 5173, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "headless-ui-thinking-"))

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await page.getByPlaceholder("描述下一步 Coding 任务…").fill("请慢一点回答")
    await page.getByRole("button", { name: /发送 Prompt/ }).click()

    await expect(page.getByText("正在思考", { exact: true })).toBeVisible()
    await expect(page.locator(".thinking-dots")).toBeVisible()
    releaseRun?.()
    await expect(page.locator(".chat-message.assistant")).toContainText("延迟回答已到达")
    await expect(page.getByText("正在思考", { exact: true })).toHaveCount(0)
  })
})

async function openDrawer(page: Page, name: RegExp) {
  await page.getByRole("button", { name }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
}

async function closeDrawer(page: Page) {
  await page.getByRole("button", { name: "关闭抽屉" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

async function serveBuiltUi(request: Request): Promise<Response> {
  const pathname = decodeURIComponent(new URL(request.url).pathname)
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1)
  const filePath = normalize(join(distDirectory, relativePath))
  if (!filePath.startsWith(`${distDirectory}/`)) return new Response("Not found", { status: 404 })
  const file = Bun.file(filePath)
  if (!(await file.exists())) return new Response("Not found", { status: 404 })
  return new Response(file)
}
