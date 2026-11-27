import { chromium, expect, type Browser, type Page } from "@playwright/test"
import { afterEach, describe, test } from "bun:test"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { join, normalize } from "node:path"
import { tmpdir } from "node:os"
import {
  createNexumCodingLoop,
  createNexumPermissionBroker,
  createNexumSessionService,
  createNexumSkillInvocationPort,
  type ContextCompactionPort,
  type ModelPort,
  type PermissionPort,
  type ToolPort,
} from "@nexum/core"
import {
  createInMemoryMessageStore,
  createInMemoryPermissionPolicyStore,
  createInMemorySessionStore,
} from "@nexum/persistence-memory"
import { createNexumQuestionPort, createNexumSkillRegistry } from "@nexum/application"
import { createNexumProjectContextPort } from "@nexum/integrations"
import { createNexumEventHub } from "../../nexum-server/src/events.ts"
import { startNexumServer, type NexumServer } from "../../nexum-server/src/index.ts"

const uiPort = Number(process.env.NEXUM_SMOKE_UI_PORT ?? "5173")
const uiOrigin = `http://127.0.0.1:${uiPort}`
const apiHost = process.env.NEXUM_SMOKE_API_HOST ?? "localhost"
const apiPort = Number(process.env.NEXUM_SMOKE_API_PORT ?? "4097")
const distDirectory = normalize(join(import.meta.dir, "../dist"))

let browser: Browser | undefined
let apiServer: NexumServer | undefined
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

describe.serial("Nexum UI smoke", () => {
  test.serial("creates a Session with the selected Agent mode and shows it in the page", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const sessionService = createNexumSessionService({ store: createInMemorySessionStore() })
    apiServer = await startNexumServer({ hostname: apiHost, port: apiPort, corsOrigins: [uiOrigin], sessionService })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-mode-create-"))

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByLabel("Plan 模式").check()
    const createRequest = page.waitForRequest(
      (request) => request.url().includes("/api/nexum/session") && request.method() === "POST",
    )
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    const request = await createRequest

    expect(request.postDataJSON()).toMatchObject({ mode: "plan" })
    await expect(page.locator(".session-mode-pill")).toContainText("PLAN")
    await expect(page.getByLabel("当前 Agent 模式：PLAN")).toBeVisible()
  })

  test.serial("uses the served UI host for default API requests", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const remoteUiOrigin = `http://localhost:${uiPort}`
    const remoteApiOrigin = `http://${apiHost}:${apiPort}`
    apiServer = await startNexumServer({
      port: apiPort,
      corsOrigins: [remoteUiOrigin],
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    const apiRequest = page.waitForRequest(
      (request) =>
        request.method() === "GET" && request.url().startsWith(`${remoteApiOrigin}/api/nexum/`),
    )

    await page.goto(remoteUiOrigin)
    await apiRequest
    await expect(page.locator(".nexum-chat-surface")).toBeVisible()
  })

  test.serial("restores paged conversation history and keeps live events incremental", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const eventHub = createNexumEventHub()
    const sessionService = createNexumSessionService({ store: createInMemorySessionStore() })
    const messageStore = createInMemoryMessageStore()
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-history-"))
    const session = await sessionService.create({ directory, name: "历史恢复" })
    await messageStore.save(
      session.sessionID,
      Array.from({ length: 52 }, (_, index) => ({ role: "user" as const, content: `历史-${index}` })),
    )
    await eventHub.publish({
      eventID: "history-old-event",
      runID: "history-run",
      sessionID: session.sessionID,
      type: "assistant.text",
      sequence: 1,
      occurredAt: "2026-11-23T00:00:00.000Z",
      data: { content: "旧实时事件" },
    })
    apiServer = await startNexumServer({
      port: apiPort,
      corsOrigins: [uiOrigin],
      sessionService,
      messageStore,
      eventHub,
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    let failHistoryOnce = true
    await page.route("**/api/experimental/nexum/session/*/messages*", async (route) => {
      if (!failHistoryOnce) {
        await route.continue()
        return
      }
      failHistoryOnce = false
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ errorCode: "NEXUM_TEST_HISTORY_UNAVAILABLE", message: "历史服务暂时不可用" }),
      })
    })

    await page.goto(uiOrigin)
    await expect(page.getByRole("alert")).toContainText("历史服务暂时不可用")
    await page.getByRole("button", { name: "重试" }).click()
    await expect(page.getByText("历史-51", { exact: true })).toBeVisible()
    await expect(page.getByText("历史-0", { exact: true })).toHaveCount(0)

    const olderPage = page.waitForResponse(
      (response) => response.url().includes(`/api/experimental/nexum/session/${session.sessionID}/messages?before=2`),
    )
    await page.locator(".nexum-chat-body").evaluate((element) => {
      element.scrollTop = 0
      element.dispatchEvent(new Event("scroll", { bubbles: true }))
    })
    await olderPage
    await expect(page.getByText("历史-0", { exact: true })).toBeVisible()

    await eventHub.publish({
      eventID: "history-live-event",
      runID: "history-live-run",
      sessionID: session.sessionID,
      type: "assistant.text",
      sequence: 2,
      occurredAt: "2026-11-23T00:00:01.000Z",
      data: { content: "实时回答" },
    })
    await expect(page.getByText("实时回答", { exact: true })).toHaveCount(1)
    await page.reload()
    await expect(page.getByText("历史-51", { exact: true })).toBeVisible()
  })

  test.serial("renders the internal Agent workbench shell", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })

    await page.goto(uiOrigin)
    await expect(page.locator(".nexum-chat-surface")).toBeVisible()
    await expect(page.locator(".nexum-chat-composer")).toBeVisible()
    await expect(page.locator(".app-sidebar").getByRole("button", { name: /权限策略/ })).toBeVisible()
    await openDrawer(page, /模型配置/)
    await expect(page.getByLabel("服务地址")).toHaveValue("")
    await expect(page.getByLabel("模型名称")).toHaveValue("")
    await closeDrawer(page)
    await openDrawer(page, /Skills/)
    await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible()
  })

  test.serial("reads a local Markdown file into the submitted Prompt", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const sessionService = createNexumSessionService({ store: createInMemorySessionStore() })
    const messageStore = createInMemoryMessageStore()
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-file-context-"))
    apiServer = await startNexumServer({
      port: apiPort,
      corsOrigins: [uiOrigin],
      sessionService,
      messageStore,
      codingLoop: {
        async run(input) {
          await messageStore.save(input.sessionID, [{ role: "user", content: input.text }])
          return (await sessionService.get(input.sessionID))!
        },
        async continueStart(sessionID) {
          const admission = sessionService.setStatus(sessionID, "running")
          return { accepted: true, admission, promise: admission.then(() => sessionService.get(sessionID).then((value) => value!)) }
        },
        async cancel(sessionID) {
          return sessionService.setStatus(sessionID, "cancelled")
        },
      },
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByRole("heading", { name: /nexum-ui-file-context-/ })).toBeVisible()
    await page.getByLabel("Coding Prompt").fill("请总结文件")
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# 标题\n正文"),
    })
    await expect(page.locator(".nexum-chat-file-name")).toHaveText(/notes\.md/)

    const promptRequest = page.waitForRequest((request) => request.method() === "POST" && request.url().includes("/prompt"))
    await page.getByRole("button", { name: "发送 Prompt" }).click()
    const requestBody = (await promptRequest).postDataJSON() as { text: string }
    expect(requestBody.text).toBe("请总结文件\n\n【本地上传文件上下文开始】\n以下正文已经由浏览器读取并随本条消息发送。请直接使用正文回答，不要根据文件名调用 read、ls 或其他工作目录工具查找文件。\n文件名：notes.md\n【文件正文开始】\n# 标题\n正文\n【文件正文结束】\n【本地上传文件上下文结束】")
    await expect(page.locator(".chat-message.user")).toContainText("请总结文件")
    await expect(page.locator(".nexum-chat-user-attachment")).toContainText("notes.md")
    await expect(page.locator(".chat-message.user")).toHaveCount(1)
    await expect.poll(async () => page.locator(".nexum-chat-body").evaluate((element) => element.scrollTop >= element.scrollHeight - element.clientHeight - 1)).toBe(true)
    await expect(page.getByLabel("Coding Prompt")).toHaveValue("")
    await expect(page.locator(".nexum-chat-file-name")).toHaveCount(0)
    await page.reload()
    await expect(page.locator(".chat-message.user")).toContainText("请总结文件")
    await expect(page.locator(".nexum-chat-user-attachment")).toContainText("notes.md")
    await expect(page.locator(".chat-message.user")).toHaveCount(1)
  })

  test.serial("offers one continue action after a settled failed run", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const eventHub = createNexumEventHub()
    const sessionService = createNexumSessionService({ store: createInMemorySessionStore() })
    let continueCalls = 0
    apiServer = await startNexumServer({
      port: apiPort,
      corsOrigins: [uiOrigin],
      eventHub,
      sessionService,
      codingLoop: {
        async run(input) {
          return (await sessionService.get(input.sessionID))!
        },
        async continueStart(sessionID) {
          continueCalls += 1
          const admission = sessionService.setStatus(sessionID, "running")
          return { accepted: true, admission, promise: admission.then(() => sessionService.get(sessionID).then((value) => value!)) }
        },
        async cancel(sessionID) {
          return sessionService.setStatus(sessionID, "cancelled")
        },
      },
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-continue-"))

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.locator(".session-id")).toBeVisible()
    const sessionID = await page.locator(".session-id").innerText()

    await eventHub.publish({
      eventID: "continue-retry",
      runID: "continue-run",
      sessionID,
      type: "model.retry",
      sequence: 1,
      occurredAt: "2026-11-23T00:00:00.000Z",
      data: { attempt: 1, maxRetries: 2, delayMs: 250, willRetry: true },
    })
    await eventHub.publish({
      eventID: "continue-failed",
      runID: "continue-run",
      sessionID,
      type: "session.failed",
      sequence: 2,
      occurredAt: "2026-11-23T00:00:00.001Z",
      data: { code: "timeout", message: "运行超时" },
    })

    await expect(page.getByText("模型重试", { exact: true })).toBeVisible()
    const continueButton = page.getByRole("button", { name: "继续运行" })
    await expect(continueButton).toHaveCount(0)
    await eventHub.publish({
      eventID: "continue-settled",
      runID: "continue-run",
      sessionID,
      type: "run.settled",
      sequence: 3,
      occurredAt: "2026-11-23T00:00:00.002Z",
      data: { result: "failed" },
    })
    await expect(continueButton).toBeVisible()
    await continueButton.click()
    await expect(continueButton).toBeDisabled()
    await expect.poll(() => continueCalls).toBe(1)
    await continueButton.click({ force: true }).catch(() => undefined)
    expect(continueCalls).toBe(1)

    await eventHub.publish({
      eventID: "continue-completed",
      runID: "continue-run-2",
      sessionID,
      type: "run.settled",
      sequence: 4,
      occurredAt: "2026-11-23T00:00:00.003Z",
      data: { result: "completed" },
    })
    await expect(continueButton).toHaveCount(0)
  })

  test.serial("keeps name and directory attached to each session", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const eventHub = createNexumEventHub()
    apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin], eventHub })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    const firstDirectory = await mkdtemp(join(tmpdir(), "nexum-ui-session-a-"))
    const secondDirectory = await mkdtemp(join(tmpdir(), "nexum-ui-session-b-"))
    directory = firstDirectory
    extraDirectories.push(secondDirectory)

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("Session 名称").fill("前端应用")
    await page.getByLabel("工作目录").fill(firstDirectory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByRole("button", { name: /前端应用/ })).toBeVisible()
    await expect(page.locator(".current-session-directory")).toHaveText(firstDirectory)

    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(secondDirectory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.locator(".current-session-directory")).toHaveText(secondDirectory)
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual(["nexum.sessionID"])
    await page.getByRole("button", { name: /前端应用/ }).click()
    await expect(page.locator(".current-session-directory")).toHaveText(firstDirectory)

    await page.getByRole("button", { name: "会话操作" }).click()
    await page.getByRole("dialog", { name: "会话操作" }).getByLabel("Session 名称").fill("前端重命名")
    await page.getByRole("button", { name: "保存名称" }).click()
    await expect(page.getByRole("button", { name: /前端重命名/ })).toBeVisible()
  })

  test.serial("confirms Session deletion and preserves its working directory", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    let deleteCalls = 0
    let releaseDelete = () => {}
    const deleteGate = new Promise<void>((resolve) => {
      releaseDelete = resolve
    })
    page.on("request", (request) => {
      if (request.method() === "DELETE" && request.url().includes("/api/nexum/session/")) deleteCalls += 1
    })
    await page.route("**/api/nexum/session/*", async (route) => {
      if (route.request().method() === "DELETE") await deleteGate
      await route.continue()
    })
    apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    const firstDirectory = await mkdtemp(join(tmpdir(), "nexum-ui-delete-a-"))
    const secondDirectory = await mkdtemp(join(tmpdir(), "nexum-ui-delete-b-"))
    directory = firstDirectory
    extraDirectories.push(secondDirectory)

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(firstDirectory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
    const firstID = await page.locator(".session-id").innerText()

    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(secondDirectory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.locator(".current-session-directory")).toHaveText(secondDirectory)
    await page.locator(".session-item", { hasText: firstDirectory }).click()
    await expect(page.locator(".session-id")).toHaveText(firstID)

    await page.getByRole("button", { name: "会话操作" }).click()
    const drawer = page.getByRole("dialog", { name: "会话操作" })
    const deleteButton = drawer.getByRole("button", { name: "删除 Session" })
    await expect(deleteButton).toBeVisible()
    await deleteButton.click()
    await expect(page.getByRole("alertdialog")).toBeVisible()
    expect(deleteCalls).toBe(0)

    await page.getByRole("button", { name: "返回" }).click()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    expect(deleteCalls).toBe(0)
    await expect(page.locator(".session-id")).toHaveText(firstID)

    await drawer.getByRole("button", { name: "删除 Session" }).click()
    const deleteResponse = page.waitForResponse(
      (response) => response.request().method() === "DELETE" && response.url().includes(`/api/nexum/session/${firstID}`),
    )
    const confirmButton = page.getByRole("button", { name: "确认删除 Session" })
    await confirmButton.click()
    await expect(page.getByRole("alertdialog").getByRole("button", { name: "处理中…" })).toBeDisabled()
    releaseDelete()
    await expect((await deleteResponse).status()).toBe(200)
    await expect(page.getByText("Session 已删除", { exact: true })).toBeVisible()
    expect(deleteCalls).toBe(1)
    await expect(page.locator(".session-item", { hasText: firstDirectory })).toHaveCount(0)
    await expect(page.locator(".current-session-directory")).toHaveText(secondDirectory)
    expect((await stat(firstDirectory)).isDirectory()).toBe(true)

    await page.getByRole("button", { name: "会话操作" }).click()
    await page.getByRole("dialog", { name: "会话操作" }).getByRole("button", { name: "删除 Session" }).click()
    const lastDeleteResponse = page.waitForResponse(
      (response) => response.request().method() === "DELETE" && response.url().includes("/api/nexum/session/"),
    )
    await page.getByRole("button", { name: "确认删除 Session" }).click()
    await expect((await lastDeleteResponse).status()).toBe(200)
    await expect(page.getByText(/还没有 Session/)).toBeVisible()
    expect(deleteCalls).toBe(2)
    expect(await page.evaluate(() => sessionStorage.getItem("nexum.sessionID"))).toBeNull()
    expect((await stat(secondDirectory)).isDirectory()).toBe(true)
  })

  test.serial("keeps a Session available after a failed delete and allows retry", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    let failNextDelete = true
    let deleteCalls = 0
    await page.route("**/api/nexum/session/*", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue()
        return
      }
      deleteCalls += 1
      if (failNextDelete) {
        failNextDelete = false
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ errorCode: "NEXUM_SESSION_DELETE_FAILED", message: "删除失败" }),
        })
        return
      }
      await route.continue()
    })
    apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-delete-retry-"))

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
    const sessionID = await page.locator(".session-id").innerText()

    await page.getByRole("button", { name: "会话操作" }).click()
    const drawer = page.getByRole("dialog", { name: "会话操作" })
    await drawer.getByRole("button", { name: "删除 Session" }).click()
    await page.getByRole("button", { name: "确认删除 Session" }).click()
    await expect(drawer.getByText("删除失败", { exact: true })).toBeVisible()
    await expect(page.locator(".session-id")).toHaveText(sessionID)
    await expect(drawer.getByRole("button", { name: "删除 Session" })).toBeVisible()

    await drawer.getByRole("button", { name: "删除 Session" }).click()
    const retryResponse = page.waitForResponse(
      (response) => response.request().method() === "DELETE" && response.url().includes(`/api/nexum/session/${sessionID}`),
    )
    await page.getByRole("button", { name: "确认删除 Session" }).click()
    await expect((await retryResponse).status()).toBe(200)
    await expect(page.getByText(/还没有 Session/)).toBeVisible()
    expect(deleteCalls).toBe(2)
    expect((await stat(directory)).isDirectory()).toBe(true)
  })

  test.serial("validates model and workspace inputs before sending requests", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    let modelUpdateCalls = 0
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/nexum/model"))
        modelUpdateCalls += 1
    })
    apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })

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
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })

    const invalidDirectory = "/tmp/nexum-ui-directory-does-not-exist"
    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(invalidDirectory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()

    await expect(page.locator("#session-directory-error")).toHaveText("工作目录不存在或不可读写")
    await expect(page.getByLabel("工作目录")).toHaveValue(invalidDirectory)
    await expect(page.getByRole("button", { name: "保存并创建 Session" })).toBeEnabled()
  })

  test.serial(
    "prevents duplicate session creation while the directory check is pending",
    { timeout: 15_000 },
    async () => {
      browser = await chromium.launch({ nexum: true })
      const page = await browser.newPage()
      let validations = 0
      const sessions = createNexumSessionService({
        store: createInMemorySessionStore(),
        directoryValidator: {
          async validate() {
            validations += 1
            await new Promise((resolve) => setTimeout(resolve, 120))
          },
        },
      })
      apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin], sessionService: sessions })
      uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
      directory = await mkdtemp(join(tmpdir(), "nexum-ui-create-pending-"))

      await page.goto(uiOrigin)
      await page.getByRole("button", { name: "新建 Session" }).click()
      await page.getByLabel("工作目录").fill(directory)
      await page.getByRole("button", { name: "保存并创建 Session" }).dblclick()
      await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
      expect(validations).toBe(1)
    },
  )

  test.serial("asks for confirmation before cancelling a run", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const eventHub = createNexumEventHub()
    const sessions = createNexumSessionService({ store: createInMemorySessionStore() })
    apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin], eventHub, sessionService: sessions })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-cancel-"))

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
    const sessionList = (await (await fetch(`http://127.0.0.1:${apiPort}/api/nexum/session`)).json()) as { readonly data: readonly { readonly id: string }[] }
    const sessionID = sessionList.data.at(-1)!.id
    await sessions.setStatus(sessionID, "running")
    await expect(page.getByRole("button", { name: "取消运行" })).toHaveCount(0)

    await eventHub.publish({
      eventID: "cancel-active-run",
      runID: "cancel-active-run",
      sessionID,
      type: "model.attempt",
      sequence: 1,
      occurredAt: "2026-11-26T00:00:00.000Z",
      data: { attempt: 1, maxRetries: 0 },
    })
    await expect(page.getByRole("button", { name: "取消运行" })).toBeVisible()

    await page.getByRole("button", { name: "取消运行" }).click()
    await expect(page.getByText("确认取消运行？", { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "返回" }).click()
    await expect(page.getByText("确认取消运行？", { exact: true })).toHaveCount(0)
    await expect(page.getByText("已请求取消运行", { exact: true })).toHaveCount(0)

    await page.getByRole("button", { name: "取消运行" }).click()
    await page.getByRole("button", { name: "确认" }).click()
    await expect(page.getByText("已请求取消运行", { exact: true })).toBeVisible()
    await expect(page.locator(".pill-cancelled")).toBeVisible()
    await expect(page.getByRole("button", { name: "取消运行" })).toHaveCount(0)
  })

  test.serial("hides the cancel action after a run completes", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const eventHub = createNexumEventHub()
    const sessions = createNexumSessionService({ store: createInMemorySessionStore() })
    apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin], eventHub, sessionService: sessions })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-complete-cancel-"))

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
    const sessionList = (await (await fetch(`http://127.0.0.1:${apiPort}/api/nexum/session`)).json()) as { readonly data: readonly { readonly id: string }[] }
    const sessionID = sessionList.data.at(-1)!.id
    const runID = "completed-cancel-run"
    await sessions.setStatus(sessionID, "running")

    await sessions.setStatus(sessionID, "completed")
    await eventHub.publish({
      eventID: "completed-cancel-attempt",
      runID,
      sessionID,
      type: "model.attempt",
      sequence: 1,
      occurredAt: "2026-11-26T00:00:00.000Z",
      data: { attempt: 1, maxRetries: 0 },
    })
    await expect(page.getByRole("button", { name: "取消运行" })).toBeVisible()

    await eventHub.publish({
      eventID: "completed-cancel-settled",
      runID,
      sessionID,
      type: "run.settled",
      sequence: 2,
      occurredAt: "2026-11-26T00:00:01.000Z",
      data: { result: "completed" },
    })
    await expect(page.locator(".pill-completed")).toBeVisible()
    await expect(page.getByRole("button", { name: "取消运行" })).toHaveCount(0)
  })

  test.serial("ignores a stale session snapshot when switching sessions quickly", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin] })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    const firstDirectory = await mkdtemp(join(tmpdir(), "nexum-ui-race-a-"))
    const secondDirectory = await mkdtemp(join(tmpdir(), "nexum-ui-race-b-"))
    directory = firstDirectory
    extraDirectories.push(secondDirectory)

    let stateCalls = 0
    await page.route("**/api/nexum/session/*/state", async (route) => {
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

    expect(stateCalls).toBeGreaterThanOrEqual(2)
    await expect(page.locator(".session-id")).toHaveText(secondID)
    await rm(secondDirectory, { recursive: true, force: true })
  })

  test.serial(
    "denying a tool request fails the task without writing to the session directory",
    { timeout: 15_000 },
    async () => {
      browser = await chromium.launch({ nexum: true })
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
      apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin] })
      uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
      directory = await mkdtemp(join(tmpdir(), "nexum-ui-deny-"))

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
      await expect(page.locator(".nexum-chat-status-item").filter({ hasText: "运行失败" })).toBeVisible()
      await expect(page.getByRole("button", { name: "取消运行" })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "拒绝" })).toHaveCount(0)
      expect(await Bun.file(join(directory, "denied.txt")).exists()).toBe(false)
    },
  )

  test.serial(
    "allowing a tool completes the task without exposing credential-shaped output",
    { timeout: 15_000 },
    async () => {
      browser = await chromium.launch({ nexum: true })
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
      apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin] })
      uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
      directory = await mkdtemp(join(tmpdir(), "nexum-ui-allow-"))

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
      const promptPermission = page.getByTestId("prompt-permission")
      await expect(promptPermission).toBeVisible()
      await expect(promptPermission.getByRole("button", { name: "允许一次" })).toBeVisible()
      await permissionActions.getByRole("button", { name: "允许一次" }).click()

      await expect(page.locator(".pill-completed")).toBeVisible()
      await expect(page.locator(".chat-message.user")).toContainText("查看环境")
      await expect(page.locator(".chat-message.assistant")).toContainText("命令已执行")
      await expect(page.locator(".act-row").filter({ hasText: "工具结果" })).toContainText("已完成")
      await expect(page.locator(".act-row").filter({ hasText: "模型尝试" })).toContainText("已完成")
      await expect(page.locator("body")).not.toContainText("super-secret-token")
    },
  )

  test.serial(
    "approves permission requests at phone and tablet viewports",
    { timeout: 25_000 },
    async () => {
      browser = await chromium.launch({ nexum: true })
      const page = await browser.newPage()
      let upstreamCalls = 0
      upstream = Bun.serve({
        port: 0,
        async fetch() {
          upstreamCalls += 1
          // 奇数次调用返回工具调用（触发权限请求），偶数次返回完成文本；两轮视口各消费一对。
          if (upstreamCalls % 2 === 0) return Response.json({ choices: [{ message: { content: "窄屏端已执行" } }] })
          return Response.json({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "call_narrow_shell",
                      type: "function",
                      function: {
                        name: "shell",
                        arguments: JSON.stringify({ command: "pwd" }),
                      },
                    },
                  ],
                },
              },
            ],
          })
        },
      })
      apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin] })
      uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
      directory = await mkdtemp(join(tmpdir(), "nexum-ui-narrow-"))

      await page.goto(uiOrigin)
      await openDrawer(page, /模型配置/)
      await page.getByLabel("服务地址").fill(upstream.url.toString().replace(/\/$/, ""))
      await page.getByLabel("模型名称").fill("fixture-model")
      await page.getByLabel("凭据值").fill("fixture-secret")
      await page.getByRole("button", { name: "保存模型配置" }).click()
      await expect(page.getByText("模型 fixture-model 已就绪")).toBeVisible()
      await closeDrawer(page)

      // 同一流程分别压测手机（紧凑档）与 Pad（平板档）容器宽度。
      for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
        await page.setViewportSize(viewport)
        await page.getByRole("button", { name: "新建 Session" }).click()
        await page.getByLabel("工作目录").fill(directory)
        await page.getByRole("button", { name: "保存并创建 Session" }).click()
        await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
        await page.getByPlaceholder("描述下一步 Coding 任务…").fill("查看目录")
        await page.getByRole("button", { name: /发送 Prompt/ }).click()
        await page.getByTestId("permission-actions").getByRole("button", { name: "允许一次" }).click()

        await expect(page.locator(".pill-completed")).toBeVisible()
        await expect(page.locator(".chat-message.assistant")).toContainText("窄屏端已执行")
        await page.getByRole("button", { name: "会话操作" }).click()
        await page.getByRole("dialog", { name: "会话操作" }).getByRole("button", { name: "删除 Session" }).click()
        await page.getByRole("button", { name: "确认删除 Session" }).click()
        await expect(page.getByRole("alertdialog")).toHaveCount(0)
      }
    },
  )

  test.serial(
    "applies a permission mode as action-agnostic global rules",
    { timeout: 20_000 },
    async () => {
      browser = await chromium.launch({ nexum: true })
      const page = await browser.newPage()
      const policyWrites: Array<{ method: string; body: unknown }> = []
      page.on("request", (request) => {
        if (!request.url().includes("/permission/policy")) return
        if (request.method() !== "POST" && request.method() !== "PUT") return
        policyWrites.push({ method: request.method(), body: JSON.parse(request.postData() ?? "null") })
      })
      apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin] })
      uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
      directory = await mkdtemp(join(tmpdir(), "nexum-ui-policy-"))

      await page.goto(uiOrigin)
      await page.getByRole("button", { name: "新建 Session" }).click()
      await page.getByLabel("工作目录").fill(directory)
      await page.getByRole("button", { name: "保存并创建 Session" }).click()
      await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()

      await page.locator(".app-sidebar").getByRole("button", { name: /权限策略/ }).click()
      const panel = page.locator(".policy-popover")
      await expect(panel.getByRole("radio", { name: /每次询问/ })).toBeVisible()
      await expect(panel.getByRole("radio", { name: /完全访问/ })).toBeVisible()

      await panel.getByRole("radio", { name: /完全访问/ }).click()
      await expect(page.getByText("权限模式已切换：完全访问")).toBeVisible()

      expect(policyWrites).toEqual([
        { method: "POST", body: { action: "*", resource: "*", effect: "allow", scope: "global" } },
      ])

      const persisted = (await (
        await fetch(new URL("/api/nexum/permission/policy", apiServer!.url))
      ).json()) as { data: { rules: unknown[] } }
      expect(persisted.data.rules).toMatchObject([
        { action: "*", resource: "*", effect: "allow", scope: "global" },
      ])

      await page.locator(".app-sidebar").getByRole("button", { name: /权限策略/ }).click()
      await page.locator(".policy-popover").getByRole("radio", { name: /智能审批/ }).click()
      await expect(page.getByText("权限模式已切换：智能审批")).toBeVisible()

      expect(policyWrites.slice(1)).toEqual([
        { method: "POST", body: { action: "*", resource: "*", effect: "allow", scope: "global" } },
        { method: "POST", body: { action: "*", resource: "rm *", effect: "ask", scope: "global" } },
        { method: "POST", body: { action: "*", resource: "sudo *", effect: "ask", scope: "global" } },
        { method: "POST", body: { action: "*", resource: "mv *", effect: "ask", scope: "global" } },
        { method: "POST", body: { action: "*", resource: "dd *", effect: "ask", scope: "global" } },
        { method: "POST", body: { action: "*", resource: "chmod *", effect: "ask", scope: "global" } },
        { method: "POST", body: { action: "*", resource: "chown *", effect: "ask", scope: "global" } },
      ])
    },
  )

  test.serial(
    "always-allow from the permission queue stores an action-agnostic rule",
    { timeout: 20_000 },
    async () => {
      browser = await chromium.launch({ nexum: true })
      const page = await browser.newPage()
      let upstreamCalls = 0
      upstream = Bun.serve({
        port: 0,
        async fetch() {
          upstreamCalls += 1
          if (upstreamCalls > 1) return Response.json({ choices: [{ message: { content: "已写入" } }] })
          return Response.json({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "call_write_always",
                      type: "function",
                      function: {
                        name: "write",
                        arguments: JSON.stringify({ path: "notes.txt", content: "记录" }),
                      },
                    },
                  ],
                },
              },
            ],
          })
        },
      })
      apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin] })
      uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
      directory = await mkdtemp(join(tmpdir(), "nexum-ui-always-"))

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

      await page.getByPlaceholder("描述下一步 Coding 任务…").fill("写入 notes.txt")
      await page.getByRole("button", { name: /发送 Prompt/ }).click()
      await page.getByTestId("permission-actions").getByRole("button", { name: "始终允许" }).click()

      await expect(page.locator(".pill-completed")).toBeVisible()
      await expect(page.getByText(/已保存全局「始终允许」策略/)).toBeVisible()
      expect(await Bun.file(join(directory, "notes.txt")).text()).toBe("记录")

      const persisted = (await (
        await fetch(new URL("/api/nexum/permission/policy", apiServer!.url))
      ).json()) as { data: { rules: unknown[] } }
      expect(persisted.data.rules).toMatchObject([
        { action: "*", resource: "notes.txt", effect: "allow", scope: "global" },
      ])
    },
  )

  test.serial("answers a Question and shows compaction plus project context states", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const sessions = createNexumSessionService({ store: createInMemorySessionStore() })
    const questions = createNexumQuestionPort()
    const eventHub = createNexumEventHub()
    const projectContext = createNexumProjectContextPort({
      sources: [{ sourceID: "instruction:project", kind: "instruction", path: "AGENTS.md" }],
      readFile: async () => "仅允许 Nexum API",
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
    const codingLoop = createNexumCodingLoop({
      model,
      tool,
      permission,
      sessions,
      events: eventHub,
      messageStore: createInMemoryMessageStore(),
      question: questions,
      projectContext,
      contextCompaction: compaction,
      compactionThreshold: 10,
    })
    apiServer = await startNexumServer({
      port: apiPort,
      corsOrigins: [uiOrigin],
      sessionService: sessions,
      eventHub,
      codingLoop,
      questionPort: questions,
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-question-"))

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
    await expect(page.getByText("AGENTS.md", { exact: true })).toBeVisible()
    await expect(page.locator(".nexum-chat-execution").filter({ hasText: "上下文压缩" })).toBeVisible()
  })

  test.serial(
    "loads project Skills, completes @ autocomplete, and validates the active Skill",
    { timeout: 15_000 },
    async () => {
      browser = await chromium.launch({ nexum: true })
      const page = await browser.newPage()
      skillRoot = await mkdtemp(join(tmpdir(), "nexum-ui-skill-root-"))
      const skillDirectory = join(skillRoot, "example-skill")
      await mkdir(skillDirectory)
      await writeFile(
        join(skillDirectory, "SKILL.md"),
        "---\nname: example-skill\ndescription: Example test skill\nversion: 0.1.0\n---\n\n# Test Skill\n",
      )
      apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin], skillRoots: [skillRoot] })
      uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })

      await page.goto(uiOrigin)
      await openDrawer(page, /Skills/)
      await expect(page.getByText("example-skill", { exact: true }).first()).toBeVisible()
      await closeDrawer(page)
      directory = await mkdtemp(join(tmpdir(), "nexum-ui-skill-session-"))
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

  test.serial("refreshes Skills from a live skill.updated event", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const eventHub = createNexumEventHub()
    const sessions = createNexumSessionService({ store: createInMemorySessionStore() })
    const registry = createNexumSkillRegistry({ roots: [] })
    let delaySkillList = false
    let skillListReloadStarted: (() => void) | undefined
    const skillListReload = new Promise<void>((resolve) => {
      skillListReloadStarted = resolve
    })
    apiServer = await startNexumServer({
      port: apiPort,
      corsOrigins: [uiOrigin],
      eventHub,
      sessionService: sessions,
      skillRegistry: registry,
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    await page.route("**/api/nexum/skills**", async (route) => {
      if (route.request().method() !== "GET" || !delaySkillList) {
        await route.continue()
        return
      }
      delaySkillList = false
      skillListReloadStarted?.()
      await new Promise((resolve) => setTimeout(resolve, 1_000))
      await route.continue()
    })
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-skill-event-session-"))
    skillRoot = await mkdtemp(join(tmpdir(), "nexum-ui-skill-event-root-"))
    const skillDirectory = join(skillRoot, "live-skill")
    await mkdir(skillDirectory)
    await writeFile(join(skillDirectory, "SKILL.md"), "---\nname: live-skill\ndescription: Live Skill\n---\n")

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
    await openDrawer(page, /Skills/)
    await expect(page.getByText("暂无已发现的项目 Skill", { exact: true })).toBeVisible()
    await page.locator(".skill-list").evaluate((element) => element.setAttribute("data-test-identity", "stable"))

    delaySkillList = true
    const registerResponse = await fetch(new URL("/api/nexum/skills/register", apiServer.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: skillDirectory }),
    })
    expect(registerResponse.status).toBe(200)
    await skillListReload
    await expect(page.locator(".skill-list")).toHaveAttribute("data-test-identity", "stable")
    await expect(page.getByText("live-skill", { exact: true }).first()).toBeVisible()

    await closeDrawer(page)
    await page.getByPlaceholder("描述下一步 Coding 任务…").fill("@live")
    await expect(page.getByRole("option", { name: "@live-skill" })).toBeVisible()
  })

  test.serial("registers, inspects, validates, refreshes, and unregisters a Skill from the drawer", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    skillRoot = await mkdtemp(join(tmpdir(), "nexum-ui-skill-management-root-"))
    const skillDirectory = join(skillRoot, "managed-skill")
    await mkdir(skillDirectory)
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      "---\nname: managed-skill\ndescription: Managed test skill\nversion: 1.2.3\n---\n\n# Managed Skill\n",
    )
    apiServer = await startNexumServer({
      port: apiPort,
      corsOrigins: [uiOrigin],
      skillRegistry: createNexumSkillRegistry({ roots: [] }),
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })

    await page.goto(uiOrigin)
    await openDrawer(page, /Skills/)
    await expect(page.getByText("暂无已发现的项目 Skill", { exact: true })).toBeVisible()
    await page.getByLabel("Skill 目录地址").fill(skillDirectory)
    await page.getByRole("button", { name: "注册 Skill" }).click()
    await expect(page.getByText("managed-skill", { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/已注册 managed-skill/)).toBeVisible()

    const skillRow = page.locator(".skill-row").filter({ hasText: "managed-skill" })
    await skillRow.getByRole("button", { name: "详情" }).click()
    await expect(skillRow.getByText("SKILL.md", { exact: false })).toBeVisible()
    await expect(skillRow.getByText("Managed test skill", { exact: true }).first()).toBeVisible()
    await page.getByRole("button", { name: "刷新" }).click()
    await expect(page.getByText("Skill 目录已刷新", { exact: true })).toBeVisible()
    await skillRow.getByRole("button", { name: "校验" }).click()
    await expect(skillRow.getByText("validated / ready", { exact: true })).toBeVisible()

    await closeDrawer(page)
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-skill-management-session-"))
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await expect(page.getByText(/已创建，等待 Prompt/)).toBeVisible()
    await page.getByPlaceholder("描述下一步 Coding 任务…").fill("@managed")
    await expect(page.getByRole("option", { name: "@managed-skill" })).toBeVisible()
    await page.getByRole("option", { name: "@managed-skill" }).click()
    await expect(page.locator(".skill-chip")).toContainText("managed-skill")

    await openDrawer(page, /Skills/)
    const managedSkillRow = page.locator(".skill-row").filter({ hasText: "managed-skill" })
    await managedSkillRow.getByRole("button", { name: "取消注册" }).click()
    await expect(page.getByRole("alertdialog")).toContainText("managed-skill")
    await page.getByRole("button", { name: "返回" }).click()
    await expect(managedSkillRow).toBeVisible()
    await managedSkillRow.getByRole("button", { name: "取消注册" }).click()
    await page.getByRole("button", { name: "确认取消注册" }).click()
    await expect(page.getByText("managed-skill", { exact: true })).toHaveCount(0)
    await expect(Bun.file(join(skillDirectory, "SKILL.md")).exists()).resolves.toBe(true)
  })

  test.serial("keeps Skill and role prompt drafts visible while loading or saving fails", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    apiServer = await startNexumServer({
      port: apiPort,
      corsOrigins: [uiOrigin],
      skillRegistry: createNexumSkillRegistry({ roots: [] }),
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    let failRolePromptSave = true
    let failedSkillRequests = 0
    await page.route("**/*", async (route) => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === "/api/nexum/role-prompt" && route.request().method() === "PUT" && failRolePromptSave) {
        failRolePromptSave = false
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ errorCode: "NEXUM_TEST_ROLE_PROMPT_UNAVAILABLE", message: "角色提示词服务暂时不可用" }),
        })
        return
      }
      if (pathname === "/api/nexum/skills" && route.request().method() === "GET" && failedSkillRequests < 4) {
        failedSkillRequests += 1
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ errorCode: "NEXUM_TEST_SKILL_UNAVAILABLE", message: "Skill 列表服务暂时不可用" }),
        })
        return
      }
      if (pathname !== "/api/nexum/skills/refresh" || route.request().method() !== "POST") {
        await route.continue()
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 800))
      await route.continue()
    })
    await page.goto(uiOrigin)
    await openDrawer(page, /Skills/)
    await expect(page.getByRole("dialog", { name: "Skills" }).getByRole("alert")).toContainText("Skill 列表服务暂时不可用")
    await page.getByRole("button", { name: "刷新" }).click()
    await expect(page.getByRole("button", { name: "刷新中…" })).toBeVisible()
    await expect(page.getByText("暂无已发现的项目 Skill", { exact: true })).toBeVisible()
    await closeDrawer(page)
    await openDrawer(page, /角色提示词/)
    const rolePrompt = page.getByRole("textbox", { name: "默认角色提示词" })
    await rolePrompt.fill("失败后仍然保留的中文提示词")
    await page.getByRole("button", { name: "保存角色提示词" }).click()
    await expect(page.locator('p[role="status"]').filter({ hasText: "角色提示词服务暂时不可用" })).toBeVisible()
    await expect(rolePrompt).toHaveValue("失败后仍然保留的中文提示词")
    await expect(page.getByRole("button", { name: "保存角色提示词" })).toBeEnabled()
    await page.getByRole("button", { name: "保存角色提示词" }).click()
    await expect(page.getByText("默认角色提示词已保存；下一次模型调用会使用最新内容", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "恢复内置默认" }).click()
    await expect(page.getByText("已恢复内置默认角色提示词", { exact: true })).toBeVisible()
  })

  test.serial("controls model probe and restores the selected session from the page", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    apiServer = await startNexumServer({
      port: apiPort,
      corsOrigins: [uiOrigin],
      modelProbe: {
        async probe(input) {
          expect(input).toEqual({ mode: "both" })
          return { text: "pass", functionCalling: "pass" }
        },
      },
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-control-plane-"))

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
    await opsDialog.getByRole("button", { name: "刷新状态" }).click()
    await expect(page.getByText("运行状态已刷新", { exact: true })).toBeVisible()
  })
  test.serial(
    "streams assistant deltas and renders markdown bold instead of raw asterisks",
    { timeout: 15_000 },
    async () => {
      browser = await chromium.launch({ nexum: true })
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
      apiServer = await startNexumServer({ port: apiPort, corsOrigins: [uiOrigin] })
      uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
      directory = await mkdtemp(join(tmpdir(), "nexum-ui-stream-markdown-"))

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
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const sessions = createNexumSessionService({ store: createInMemorySessionStore() })
    const eventHub = createNexumEventHub()
    const permission = createNexumPermissionBroker({ policyStore: createInMemoryPermissionPolicyStore() })
    skillRoot = await mkdtemp(join(tmpdir(), "nexum-ui-project-skill-root-"))
    const projectSkillDirectory = join(skillRoot, "example-skill")
    await mkdir(projectSkillDirectory)
    await writeFile(
      join(projectSkillDirectory, "SKILL.md"),
      "---\nname: example-skill\ndescription: Example project skill\nversion: 0.1.0\n---\n\n# Example Skill\n",
    )
    const projectSkillRoot = normalize(skillRoot)
    const registry = createNexumSkillRegistry({ roots: [projectSkillRoot] })
    await registry.refresh()
    const skills = createNexumSkillInvocationPort({ registry, permission })
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
    const codingLoop = createNexumCodingLoop({
      model,
      tool,
      permission,
      sessions,
      events: eventHub,
      messageStore: createInMemoryMessageStore(),
      skills,
    })
    apiServer = await startNexumServer({
      port: apiPort,
      corsOrigins: [uiOrigin],
      sessionService: sessions,
      eventHub,
      codingLoop,
      permissionBroker: permission,
      skillRegistry: registry,
      skillInvocation: skills,
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-project-skill-"))

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await page.getByPlaceholder("描述下一步 Coding 任务…").fill("@example-skill 验证 Skill 激活")
    await page.getByRole("button", { name: /发送 Prompt/ }).click()
    await expect(page.getByTestId("permission-actions").getByRole("button", { name: "允许一次" })).toBeVisible()
    await page.getByTestId("permission-actions").getByRole("button", { name: "允许一次" }).click()
    await expect(page.locator(".nexum-chat-execution").filter({ hasText: "Skill 已进入模型上下文" })).toBeVisible()
    await expect(page.locator(".pill-completed")).toBeVisible()
  })

  test.serial("streams reasoning as a transcript before the final assistant response", { timeout: 15_000 }, async () => {
    browser = await chromium.launch({ nexum: true })
    const page = await browser.newPage()
    const sessions = createNexumSessionService({ store: createInMemorySessionStore() })
    const eventHub = createNexumEventHub()
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
          eventID: `reasoning-1-${runID}`,
          runID,
          sessionID: input.sessionID,
          type: "assistant.reasoning",
          sequence: 1,
          data: { content: "先检查仓库源。" },
        })
        await eventHub.publish({
          eventID: `reasoning-2-${runID}`,
          runID,
          sessionID: input.sessionID,
          type: "assistant.reasoning",
          sequence: 2,
          data: { content: "确认后再继续。" },
        })
        await eventHub.publish({
          eventID: `text-${runID}`,
          runID,
          sessionID: input.sessionID,
          type: "assistant.text",
          sequence: 3,
          data: { content: "延迟回答已到达" },
        })
        await sessions.setStatus(input.sessionID, "completed")
        await eventHub.publish({
          eventID: `completed-${runID}`,
          runID,
          sessionID: input.sessionID,
          type: "session.completed",
          sequence: 4,
        })
        return (await sessions.get(input.sessionID))!
      },
      async cancel(sessionID: string) {
        return sessions.setStatus(sessionID, "cancelled")
      },
    }
    apiServer = await startNexumServer({
      port: apiPort,
      corsOrigins: [uiOrigin],
      sessionService: sessions,
      eventHub,
      codingLoop,
    })
    uiServer = Bun.serve({ hostname: "127.0.0.1", port: uiPort, fetch: serveBuiltUi })
    directory = await mkdtemp(join(tmpdir(), "nexum-ui-thinking-"))

    await page.goto(uiOrigin)
    await page.getByRole("button", { name: "新建 Session" }).click()
    await page.getByLabel("工作目录").fill(directory)
    await page.getByRole("button", { name: "保存并创建 Session" }).click()
    await page.getByPlaceholder("描述下一步 Coding 任务…").fill("请慢一点回答")
    await page.getByRole("button", { name: /发送 Prompt/ }).click()

    await expect(page.getByText("正在思考", { exact: true })).toBeVisible()
    releaseRun?.()
    const fold = page.locator(".reasoning-fold")
    await expect(fold).toHaveCount(1)
    await expect(fold).not.toHaveAttribute("open", "")
    await expect(fold.locator("summary")).toContainText("模型思考")
    await fold.locator("summary").click()
    await expect(fold.locator(".reasoning-copy")).toBeVisible()
    await expect(fold.locator(".reasoning-copy")).toContainText("先检查仓库源。确认后再继续。")
    await expect(page.locator(".chat-message.reasoning")).toHaveCount(1)
    await expect(page.locator(".chat-message.assistant")).toContainText("延迟回答已到达")
    await expect(page.locator(".chat-message.assistant")).not.toContainText("先检查仓库源")
    await expect(page.locator(".thinking-card")).toHaveCount(0)
    await expect(page.locator(".thinking-status")).toHaveCount(0)
    await expect(page.locator(".session-status-completed")).toHaveCount(1)
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
