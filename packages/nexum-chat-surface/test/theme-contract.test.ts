import { expect, test } from "bun:test"

test("ChatSurface 主题契约只允许 light 和 dark", async () => {
  const source = await Bun.file(`${import.meta.dir}/../src/chat-surface.tsx`).text()
  expect(source).toContain('export type ChatSurfaceTheme = "light" | "dark"')
  expect(source).toContain("readonly theme?: ChatSurfaceTheme")
})

test("ChatSurface 默认显示标题并允许通过 showHeader 隐藏", async () => {
  const source = await Bun.file(`${import.meta.dir}/../src/chat-surface.tsx`).text()
  expect(source).toContain("readonly showHeader?: boolean")
  expect(source).toContain("props.showHeader !== false && props.title")
})

test("ChatSurface exposes isolated light and dark theme variables", async () => {
  const styles = await Bun.file(`${import.meta.dir}/../src/styles.css`).text()
  expect(styles).toContain('.nexum-chat-surface[data-theme="light"]')
  expect(styles).toContain('.nexum-chat-surface[data-theme="dark"]')
})
