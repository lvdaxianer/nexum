/** Nexum 持久化适配器的公共组合契约。 */

export type { NexumPersistence } from "./composition.ts"
export { createNexumEventHub, NexumEventStoreError } from "./events.ts"
export type { NexumEventHub, NexumEventHubOptions, NexumEventSubscriptionOptions } from "./events.ts"
