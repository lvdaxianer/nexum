import { expect, test } from "bun:test"
import { OpenCode } from "../src/promise/index.ts"

test("generated promise client exposes the headless experimental surface", () => {
  const client = OpenCode.make({ baseUrl: "http://127.0.0.1:4097" })

  expect(client.experimental.headless.session.create).toBeFunction()
  expect(client.experimental.headless.session.prompt).toBeFunction()
  expect(client.experimental.headless.session.cancel).toBeFunction()
  expect(client.experimental.headless.session.events).toBeFunction()
  expect(client.experimental.headless.session.permission.list).toBeFunction()
  expect(client.experimental.headless.session.permission.reply).toBeFunction()
})
