import { test } from "bun:test"

test("内存适配器入口可以加载", async () => {
  await import("../src/index.ts")
})
