import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { ChatSurface } from "./chat-surface"
import type { ChatProtocolAdapter, ChatSurfaceProps } from "./index"

/** 注册 ChatSurface 的 light-DOM Web Component。 */
export function defineChatSurfaceElement(registry: CustomElementRegistry = globalThis.customElements) {
  if (registry.get("nexum-chat")) return

  class NexumChatElement extends HTMLElement {
    static observedAttributes = ["session-id", "api-base-url", "title"]
    private adapterValue: ChatProtocolAdapter | undefined
    private dispose: (() => void) | undefined
    private setSessionID: ((value: string) => void) | undefined
    private setTitle: ((value: string) => void) | undefined

    get adapter() {
      return this.adapterValue
    }

    set adapter(value: ChatProtocolAdapter | undefined) {
      this.adapterValue = value
      if (this.isConnected) this.mount()
    }

    connectedCallback() {
      this.mount()
    }

    disconnectedCallback() {
      this.dispose?.()
      this.dispose = undefined
      this.setSessionID = undefined
      this.setTitle = undefined
      this.replaceChildren()
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
      if (oldValue === newValue) return
      if (name === "session-id") this.setSessionID?.(newValue ?? "")
      if (name === "title") this.setTitle?.(newValue ?? "")
      if (name === "api-base-url" && this.isConnected) this.mount()
    }

    private mount() {
      this.dispose?.()
      this.dispose = undefined
      this.replaceChildren()
      const [sessionID, setSessionID] = createSignal(this.getAttribute("session-id") ?? "")
      const [title, setTitle] = createSignal(this.getAttribute("title") ?? undefined)
      const [adapter] = createSignal<ChatProtocolAdapter | undefined>(this.adapterValue)
      this.setSessionID = setSessionID
      this.setTitle = setTitle
      const client = this.getAttribute("api-base-url") ? { baseUrl: this.getAttribute("api-base-url")! } satisfies NonNullable<ChatSurfaceProps["client"]> : undefined
      this.dispose = render(() => <ChatSurface sessionID={sessionID()} adapter={adapter()} client={client} title={title()} />, this)
      this.dispatchEvent(new CustomEvent("nexum-chat-ready", { detail: { sessionID: sessionID() } }))
    }
  }

  registry.define("nexum-chat", NexumChatElement)
}

if (typeof globalThis.customElements !== "undefined") defineChatSurfaceElement()
