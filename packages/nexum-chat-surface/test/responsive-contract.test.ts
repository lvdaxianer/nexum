import { expect, test } from "bun:test"

test("ChatSurface composer publishes semantic information and action rows", async () => {
  const source = await Bun.file(`${import.meta.dir}/../src/chat-surface.tsx`).text()
  expect(source).toContain('class="nexum-chat-composer-info-row"')
  expect(source).toContain('class="nexum-chat-composer-action-row"')
})

test("ChatSurface composer keeps actions usable in narrow containers", async () => {
  const styles = await Bun.file(`${import.meta.dir}/../src/styles.css`).text()
  expect(styles).toContain("@container (max-width: 480px)")
  expect(styles).toContain(".nexum-chat-composer-action-row")
  expect(styles).toContain("flex-wrap: wrap")
  expect(styles).toContain("min-height: var(--nexum-chat-tap-min)")
  expect(styles).not.toContain(".nexum-chat-composer-action-row { display: none")
})
