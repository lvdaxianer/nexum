import { expect, test } from "bun:test"
import { OpenApi } from "effect/http-api"
import { ClientApi } from "../src/client.js"

const expectedRoutes = [
  "/api/experimental/headless/session",
  "/api/experimental/headless/session/{sessionID}/prompt",
  "/api/experimental/headless/session/{sessionID}/cancel",
  "/api/experimental/headless/session/{sessionID}/events",
  "/api/experimental/headless/session/{sessionID}/permission",
  "/api/experimental/headless/session/{sessionID}/permission/{requestID}/reply",
  "/api/experimental/headless/model",
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
      "experimental.headless.session.prompt",
      "experimental.headless.session.cancel",
      "experimental.headless.session.events",
      "experimental.headless.session.permission.list",
      "experimental.headless.session.permission.reply",
      "experimental.headless.model.get",
      "experimental.headless.model.update",
    ]),
  )
})
