import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { ChatSurface } from "./chat-surface"
import type { ChatProtocolAdapter, ChatSurfaceProps } from "./index"

/** 注册 ChatSurface 的 light-DOM Web Component。 */
export function defineChatSurfaceElement(registry: CustomElementRegistry = globalThis.customElements) {
  if (registry.get("nexum-chat")) return

  class NexumChatElement extends HTMLElement {
    static observedAttributes = ["session-id", "api-base-url", "theme"]
    private adapterValue: ChatProtocolAdapter | undefined
    private dispose: (() => void) | undefined
    private setSessionID: ((value: string) => void) | undefined
    private setTheme: ((value: string | undefined) => void) | undefined

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
      this.setTheme = undefined
      this.replaceChildren()
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
      if (oldValue === newValue) return
      if (name === "session-id") this.setSessionID?.(newValue ?? "")
      if (name === "theme") this.setTheme?.(newValue ?? undefined)
      if (name === "api-base-url" && this.isConnected) this.mount()
    }

    private mount() {
      this.dispose?.()
      this.dispose = undefined
      // 收集宿主通过 [slot="composer-extras"] 注入的 light-DOM 节点，移入组件插槽位置。
      const slotted = [...this.querySelectorAll<HTMLElement>('[slot="composer-extras"]')]
      const extrasHolder = document.createElement("span")
      extrasHolder.className = "nexum-chat-composer-extras-host"
      for (const node of slotted) extrasHolder.appendChild(node)
      const composerExtras = slotted.length > 0 ? extrasHolder : undefined
      this.replaceChildren()
      const [sessionID, setSessionID] = createSignal(this.getAttribute("session-id") ?? "")
      const [theme, setTheme] = createSignal(this.getAttribute("theme") ?? undefined)
      const [adapter] = createSignal<ChatProtocolAdapter | undefined>(this.adapterValue)
      this.setSessionID = setSessionID
      this.setTheme = setTheme
      const client = this.getAttribute("api-base-url") ? { baseUrl: this.getAttribute("api-base-url")! } satisfies NonNullable<ChatSurfaceProps["client"]> : undefined
      this.dispose = render(
        () => (
          <ChatSurface
            sessionID={sessionID()}
            adapter={adapter()}
            client={client}
            theme={theme()}
            composerExtras={composerExtras}
            onOpenPermissionSettings={() => this.dispatchEvent(new CustomEvent("permission-settings", { bubbles: true, composed: true }))}
          />
        ),
        this,
      )
      this.dispatchEvent(new CustomEvent("nexum-chat-ready", { detail: { sessionID: sessionID() } }))
    }
  }

  registry.define("nexum-chat", NexumChatElement)
}

if (typeof globalThis.customElements !== "undefined") defineChatSurfaceElement()
