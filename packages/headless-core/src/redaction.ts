/**
 * Headless 事件、交互记录和权限策略共用的凭据脱敏规则。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */

/** 对权限展示和运行事件中的文本做凭据值脱敏。 */
export function redactHeadlessSensitiveText(value: string): string {
  return value.replace(
    /((?:authorization|api[_-]?key|token|password|secret)\s*[:=]\s*(?:bearer\s+)?)([^\s'",;]+)/gi,
    "$1[REDACTED]",
  )
}

/** 递归脱敏权限事件中的字符串、数组和对象值。 */
export function redactHeadlessSensitiveValue(value: unknown): unknown {
  if (typeof value === "string") return redactHeadlessSensitiveText(value)
  if (Array.isArray(value)) return value.map(redactHeadlessSensitiveValue)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactHeadlessSensitiveValue(item)]))
  }
  return value
}
