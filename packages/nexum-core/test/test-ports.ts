import type {
  MessageStore,
  NexumCodingLoopOptions,
  NexumPermissionBrokerOptions,
  NexumSessionServiceOptions,
  SessionStore,
} from "../src/index.ts"
import { createInMemoryMessageStore, createInMemoryPermissionPolicyStore, createInMemorySessionStore } from "../../nexum-persistence/src/index.ts"

const core = await import("../src/index.ts")

export function createNexumSessionService(
  options: Omit<NexumSessionServiceOptions, "store"> & { readonly store?: SessionStore } = {},
) {
  return core.createNexumSessionService({ store: options.store ?? createInMemorySessionStore(), ...options })
}

export function createNexumPermissionBroker(
  options: Omit<NexumPermissionBrokerOptions, "policyStore"> & {
    readonly policyStore?: NexumPermissionBrokerOptions["policyStore"]
  } = {},
) {
  return core.createNexumPermissionBroker({
    policyStore: options.policyStore ?? createInMemoryPermissionPolicyStore(),
    ...options,
  })
}

export function createNexumCodingLoop(options: Omit<NexumCodingLoopOptions, "messageStore"> & { readonly messageStore?: MessageStore }) {
  return core.createNexumCodingLoop({ messageStore: options.messageStore ?? createInMemoryMessageStore(), ...options })
}
