import type { NexumSession } from "@nexum/client"

/**
 * 按稳定 Session ID 增量合并运行终态，保持未变化列表项和列表引用稳定。
 *
 * @param sessions - 当前宿主维护的 Session 列表
 * @param sessionID - 收到状态变化的 Session 标识
 * @param status - 要合并的最新状态
 * @returns 合并后的 Session 列表
 * @author lvdaxianer@yeah.net
 * @date 2026-11-24
 */
export function mergeSessionStatus(sessions: NexumSession[], sessionID: string, status: NexumSession["status"]): NexumSession[] {
  const current = sessions.find((session) => session.id === sessionID)
  if (!current || current.status === status) return sessions
  return sessions.map((session) => session.id === sessionID ? { ...session, status } : session)
}

/** 按稳定 ID 合并 Server 返回的最新 Session 快照，保持其他列表项引用稳定。 */
export function mergeSessionSnapshot(sessions: NexumSession[], snapshot: NexumSession): NexumSession[] {
  const current = sessions.find((session) => session.id === snapshot.id)
  if (!current) return sessions
  const next = { ...current, ...snapshot }
  if (
    current.name === next.name &&
    current.directory === next.directory &&
    current.status === next.status &&
    current.mode === next.mode &&
    current.createdAt === next.createdAt &&
    current.updatedAt === next.updatedAt
  ) return sessions
  return sessions.map((session) => session.id === snapshot.id ? next : session)
}
