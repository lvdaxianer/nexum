/**
 * Nexum 事件、交互记录和权限策略共用的凭据脱敏规则。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */

/** 对权限展示和运行事件中的文本做凭据值脱敏。 */
export function redactNexumSensitiveText(value: string): string {
  return value.replace(
    /((?:["']?)(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|bearer[_-]?token|client[_-]?secret|private[_-]?key|token|password|secret|credential)(?:["']?\s*[:=]\s*["']?\s*)(?:bearer\s+)?)([^\s'",;}]+)/gi,
    "$1[REDACTED]",
  )
}

/** 递归脱敏权限事件中的字符串、数组和对象值。 */
export function redactNexumSensitiveValue(value: unknown): unknown {
  if (typeof value === "string") return redactNexumSensitiveText(value)
  if (Array.isArray(value)) return value.map(redactNexumSensitiveValue)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactNexumSensitiveValue(item)]))
  }
  return value
}
