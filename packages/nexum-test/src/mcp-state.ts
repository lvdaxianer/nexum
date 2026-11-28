import type { NexumMcpServer } from "@nexum/client"

export function mergeMcpServers(current: NexumMcpServer[], next: readonly NexumMcpServer[]): NexumMcpServer[] {
  if (current.length === next.length && current.every((server, index) => server.id === next[index]?.id && sameMcpServer(server, next[index]!))) {
    return current
  }

  const previous = new Map(current.map((server) => [server.id, server]))
  return next.map((server) => {
    const existing = previous.get(server.id)
    return existing && sameMcpServer(existing, server) ? existing : server
  })
}

export function mcpStatusLabel(status: NexumMcpServer["status"]) {
  return {
    disabled: "已断开",
    pending: "初始化中",
    retrying: "重试中",
    connected: "已连接",
    failed: "连接失败",
    needs_auth: "等待授权",
    available: "可用",
    unavailable: "不可用",
  }[status]
}

function sameMcpServer(left: NexumMcpServer, right: NexumMcpServer) {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.status === right.status &&
    left.url === right.url &&
    left.retryAttempt === right.retryAttempt &&
    left.nextRetryAt === right.nextRetryAt &&
    left.error?.code === right.error?.code &&
    left.error?.message === right.error?.message
  )
}
