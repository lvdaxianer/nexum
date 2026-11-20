import { expect, test } from "bun:test"
import { Schema } from "effect"
import { OpenApi } from "effect/http-api"
import { ClientApi } from "../src/client.js"
import { HeadlessContextCompactionEventData, HeadlessQuestionRequest } from "../src/groups/headless.js"

const expectedRoutes = [
  "/api/experimental/headless/session",
  "/api/experimental/headless/capabilities",
  "/api/experimental/headless/session/{sessionID}/prompt",
  "/api/experimental/headless/session/{sessionID}/cancel",
  "/api/experimental/headless/session/{sessionID}/events",
  "/api/experimental/headless/session/{sessionID}/state",
  "/api/experimental/headless/session/{sessionID}/permission",
  "/api/experimental/headless/session/{sessionID}/permission/{requestID}/reply",
  "/api/experimental/headless/session/{sessionID}/question",
  "/api/experimental/headless/session/{sessionID}/question/{requestID}/reply",
  "/api/experimental/headless/session/{sessionID}/question/{requestID}/cancel",
  "/api/experimental/headless/model",
  "/api/experimental/headless/model/probe",
  "/api/experimental/headless/skills",
  "/api/experimental/headless/skills/{skillID}",
  "/api/experimental/headless/skills/register",
  "/api/experimental/headless/skills/refresh",
  "/api/experimental/headless/skills/validate",
  "/api/experimental/headless/skills/{skillID}/activate",
]

test("headless protocol exposes isolated session, event, and permission routes", () => {
  const document = OpenApi.fromApi(ClientApi)
  const routePaths = Object.keys(document.paths)

  expect(routePaths).toEqual(expect.arrayContaining(expectedRoutes))
  expect(routePaths.filter((path) => path.includes("/headless/")).length).toBe(expectedRoutes.length)
})

test("headless protocol operations remain experimental", () => {
  const document = OpenApi.fromApi(ClientApi)
  const operationIds = Object.values(document.paths).flatMap((path) =>
    Object.values(path).flatMap((operation) =>
      operation && "operationId" in operation ? [operation.operationId] : [],
    ),
  )

  const headlessOperationIds = operationIds.filter((identifier) => identifier.includes("headless"))
  expect(headlessOperationIds).toEqual(
    expect.arrayContaining([
      "experimental.headless.session.create",
      "experimental.headless.capabilities",
      "experimental.headless.session.prompt",
      "experimental.headless.session.cancel",
      "experimental.headless.session.events",
      "experimental.headless.session.state",
      "experimental.headless.session.permission.list",
      "experimental.headless.session.permission.reply",
      "experimental.headless.session.question.list",
      "experimental.headless.session.question.reply",
      "experimental.headless.session.question.cancel",
      "experimental.headless.model.get",
      "experimental.headless.model.update",
      "experimental.headless.model.probe",
      "experimental.headless.session.list",
      "experimental.headless.skill.list",
      "experimental.headless.skill.detail",
      "experimental.headless.skill.register",
      "experimental.headless.skill.refresh",
      "experimental.headless.skill.validate",
      "experimental.headless.skill.activate",
    ]),
  )
})

test("headless protocol decodes structured questions and compaction status", () => {
  const question = Schema.decodeUnknownSync(HeadlessQuestionRequest)({
    id: "question_001",
    sessionID: "session_001",
    toolCallID: "call_question_001",
    questions: [
      {
        header: "目录",
        question: "选择目录",
        options: [{ label: "src", description: "源代码目录" }],
      },
    ],
  })
  const compaction = Schema.decodeUnknownSync(HeadlessContextCompactionEventData)({
    status: "completed",
    summaryLength: 12,
    keptMessages: 3,
  })

  expect(question.questions[0]?.options[0]?.label).toBe("src")
  expect(compaction).toMatchObject({ status: "completed", summaryLength: 12, keptMessages: 3 })
})
