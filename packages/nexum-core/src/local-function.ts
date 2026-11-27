/** Nexum 进程内本地 JS 函数的 Core 契约。 */

/** 本地函数执行期间可用的运行上下文。 */
export interface NexumLocalFunctionContext {
  readonly sessionID: string
  readonly signal: AbortSignal
}

/** 单个本地函数的模型描述与执行器。 */
export interface NexumLocalFunction {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly execute: (input: Record<string, unknown>, context: NexumLocalFunctionContext) => Promise<unknown>
}

/** 一组共享稳定 provider 身份的本地函数。 */
export interface NexumLocalFunctionProvider {
  readonly providerID: string
  readonly providerName: string
  readonly functions: readonly NexumLocalFunction[]
}

/** 可持久化的本地函数元数据，不包含进程内执行器。 */
export interface NexumLocalFunctionMetadata {
  readonly providerID: string
  readonly providerName: string
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
}
