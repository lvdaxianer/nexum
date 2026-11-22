/** Nexum 本地工作目录校验适配器。 */

import { constants } from "node:fs"
import { access, stat } from "node:fs/promises"
import { NexumSessionError, type NexumDirectoryValidator } from "@nexum/core"

/**
 * 创建检查本地目录存在性、类型和读写权限的校验器。
 *
 * Core 只负责路径语义；文件系统状态属于 Adapter，避免把 Node 文件系统
 * 依赖泄漏到可移植的 Core。
 */
export function createLocalDirectoryValidator(): NexumDirectoryValidator {
  return {
    async validate(directory) {
      try {
        const info = await stat(directory)
        if (!info.isDirectory()) throw new Error("not_directory")
        await access(directory, constants.R_OK | constants.W_OK)
      } catch {
        throw new NexumSessionError("invalid_directory", "工作目录不存在或不可读写")
      }
    },
  }
}
