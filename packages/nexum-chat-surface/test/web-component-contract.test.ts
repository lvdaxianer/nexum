import { expect, test } from "bun:test"
import { CHAT_SURFACE_TAG, defineChatSurfaceElement } from "../src/index.ts"

test("ChatSurface publishes the embeddable custom element contract", () => {
  expect(CHAT_SURFACE_TAG).toBe("nexum-chat")
})

test("nexum-chat observes the embeddable attributes including theme", () => {
  // bun test 无 DOM 环境，提供最小 HTMLElement 基类以完成类定义。
  if (typeof globalThis.HTMLElement === "undefined") {
    globalThis.HTMLElement = class {} as unknown as typeof HTMLElement
  }
  let elementClass: { observedAttributes: readonly string[] } | undefined
  const registry = {
    get: () => undefined,
    define: (_name: string, ctor: { observedAttributes: readonly string[] }) => {
      elementClass = ctor
    },
  } as unknown as CustomElementRegistry

  defineChatSurfaceElement(registry)

  expect(elementClass?.observedAttributes).toEqual(["session-id", "api-base-url", "title", "theme", "show-header"])
})

test("nexum-chat maps show-header false to the ChatSurface header setting", async () => {
  const source = await Bun.file(`${import.meta.dir}/../src/web-component.tsx`).text()
  expect(source).toContain('this.getAttribute("show-header") !== "false"')
  expect(source).toContain("showHeader={showHeader()}")
})
