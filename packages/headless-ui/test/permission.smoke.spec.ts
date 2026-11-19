import { chromium, expect, type Browser } from "@playwright/test"
import { afterEach, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join, normalize } from "node:path"
import { tmpdir } from "node:os"
import { startHeadlessServer, type HeadlessServer } from "../../headless-server/src/index.ts"

const uiOrigin = "http://127.0.0.1:5173"
const distDirectory = normalize(join(import.meta.dir, "../dist"))

let browser: Browser | undefined
let apiServer: HeadlessServer | undefined
let uiServer: Bun.Server<undefined> | undefined
let upstream: Bun.Server<undefined> | undefined
let directory: string | undefined

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
})

test("denying a tool request fails the task without writing to the session directory", async () => {
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

async function serveBuiltUi(request: Request): Promise<Response> {
  const pathname = decodeURIComponent(new URL(request.url).pathname)
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1)
  const filePath = normalize(join(distDirectory, relativePath))
  if (!filePath.startsWith(`${distDirectory}/`)) return new Response("Not found", { status: 404 })
  const file = Bun.file(filePath)
  if (!(await file.exists())) return new Response("Not found", { status: 404 })
  return new Response(file)
}
