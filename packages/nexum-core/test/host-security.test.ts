import { expect, test } from "bun:test"
import {
  isDangerousNexumToolRequest,
  normalizeNexumHostResource,
  normalizeNexumToolRequest,
  type ToolRequest,
} from "../src/index.ts"

function request(action: string, resource: string): ToolRequest {
  return { sessionID: "session-host", toolName: action, action, resource, input: {} }
}

test("normalizes Host resources and classifies network and credential risk", () => {
  expect(normalizeNexumHostResource("read", "  src\\index.ts  ")).toEqual({
    action: "read",
    resource: "src/index.ts",
    risk: "filesystem",
  })
  expect(normalizeNexumHostResource("shell", " curl -H 'Authorization: Bearer secret' https://example.com ")).toEqual({
    action: "shell",
    resource: "curl -H 'Authorization: Bearer secret' https://example.com",
    risk: "credential",
  })
})

test("marks network clients, redirects, and nested shells as dangerous", () => {
  expect(isDangerousNexumToolRequest(request("shell", "curl https://example.com"))).toBe(true)
  expect(isDangerousNexumToolRequest(request("shell", "printf ok > output.txt"))).toBe(true)
  expect(isDangerousNexumToolRequest(request("shell", "sh -c 'echo nested'"))).toBe(true)
})

test("attaches normalized Host risk to built-in tool requests", () => {
  expect(normalizeNexumToolRequest("session-host", "shell", { command: "wget https://example.com" })).toMatchObject({
    action: "shell",
    resource: "wget https://example.com",
    risk: "network",
  })
})
