import { AsyncLocalStorage } from "node:async_hooks"
import { redactNexumSensitiveValue } from "@nexum/core"

/** 受控日志字段；调用方不得写入未经脱敏的请求体。 */
export interface NexumLogFields {
  readonly [key: string]: unknown
}

/** Nexum HTTP 服务的最小日志端口。 */
export interface NexumLogger {
  readonly info: (event: string, fields?: NexumLogFields) => void
  readonly warn: (event: string, fields?: NexumLogFields) => void
  readonly error: (event: string, fields?: NexumLogFields, error?: unknown) => void
}

/** 日志输出边界，默认写入服务标准错误流。 */
export interface NexumLogSink {
  readonly write: (line: string) => void
}

const logContext = new AsyncLocalStorage<{ readonly traceId: string }>()
const defaultSink: NexumLogSink = { write: (line) => process.stderr.write(`${line}\n`) }

/** 创建带统一脱敏、限长和结构化输出的服务日志器。 */
export function createNexumLogger(sink: NexumLogSink = defaultSink): NexumLogger {
  return {
    info(event, fields = {}) {
      writeLog(sink, "INFO", event, fields)
    },
    warn(event, fields = {}) {
      writeLog(sink, "WARN", event, fields)
    },
    error(event, fields = {}, error) {
      writeLog(sink, "ERROR", event, fields, error)
    },
  }
}

/** 在异步 HTTP 链路中传播并自动清理 trace context。 */
export function withNexumLogContext<T>(traceId: string, operation: () => Promise<T>): Promise<T> {
  return logContext.run({ traceId }, operation)
}

function writeLog(sink: NexumLogSink, level: "INFO" | "WARN" | "ERROR", event: string, fields: NexumLogFields, error?: unknown): void {
  const context = logContext.getStore()
  const safeError = error === undefined ? undefined : normalizeError(error)
  const record = redactNexumSensitiveValue({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(context ? { traceId: context.traceId } : {}),
    ...fields,
    ...(safeError ? { error: safeError } : {}),
  })
  sink.write(JSON.stringify(limitLogRecord(record)))
}

function normalizeError(error: unknown): NexumLogFields {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    }
  }
  return { value: String(error) }
}

function limitLogRecord(value: unknown): unknown {
  if (typeof value === "string") return value.length > 4_096 ? `${value.slice(0, 4_096)}...[truncated]` : value
  if (Array.isArray(value)) return value.slice(0, 100).map(limitLogRecord)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, limitLogRecord(item)]))
  }
  return value
}
