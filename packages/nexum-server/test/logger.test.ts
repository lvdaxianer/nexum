import { expect, test } from "bun:test"
import { createNexumLogger, withNexumLogContext } from "../src/logger.ts"

test("writes structured error logs with trace context and global redaction", async () => {
  const lines: string[] = []
  const logger = createNexumLogger({ write: (line) => lines.push(line) })

  await withNexumLogContext("trace_logger_001", async () => {
    logger.error("request.failed", { authorization: "Bearer secret-token", path: "/api/nexum" }, new Error("token=secret-token"))
  })

  const output = lines.join("\n")
  expect(output).not.toContain("secret-token")
  expect(JSON.parse(lines[0]!)).toMatchObject({
    level: "ERROR",
    event: "request.failed",
    traceId: "trace_logger_001",
    authorization: "[REDACTED]",
    error: { name: "Error", message: "token=[REDACTED]" },
  })
})

test("limits oversized diagnostic fields", () => {
  const lines: string[] = []
  const logger = createNexumLogger({ write: (line) => lines.push(line) })

  logger.warn("diagnostic.large", { detail: "x".repeat(5_000) })

  expect(JSON.parse(lines[0]!).detail).toHaveLength(4_096 + "...[truncated]".length)
})
