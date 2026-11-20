import { expect, test } from "bun:test"
import { OpenCode } from "../src/promise/index.ts"

test("generated promise client exposes the headless experimental surface", () => {
  const client = OpenCode.make({ baseUrl: "http://127.0.0.1:4097" })

  expect(client.experimental.headless.capabilities).toBeFunction()
  expect(client.experimental.headless.session.create).toBeFunction()
  expect(client.experimental.headless.session.list).toBeFunction()
  expect(client.experimental.headless.session.state).toBeFunction()
  expect(client.experimental.headless.session.prompt).toBeFunction()
  expect(client.experimental.headless.session.cancel).toBeFunction()
  expect(client.experimental.headless.session.events).toBeFunction()
  expect(client.experimental.headless.session.permission.list).toBeFunction()
  expect(client.experimental.headless.session.permission.reply).toBeFunction()
  expect(client.experimental.headless.session.question.list).toBeFunction()
  expect(client.experimental.headless.session.question.reply).toBeFunction()
  expect(client.experimental.headless.session.question.cancel).toBeFunction()
  expect(client.experimental.headless.model.get).toBeFunction()
  expect(client.experimental.headless.model.update).toBeFunction()
  expect(client.experimental.headless.model.probe).toBeFunction()
  expect(client.experimental.headless.skill.list).toBeFunction()
  expect(client.experimental.headless.skill.detail).toBeFunction()
  expect(client.experimental.headless.skill.register).toBeFunction()
  expect(client.experimental.headless.skill.refresh).toBeFunction()
  expect(client.experimental.headless.skill.validate).toBeFunction()
  expect(client.experimental.headless.skill.activate).toBeFunction()
})
