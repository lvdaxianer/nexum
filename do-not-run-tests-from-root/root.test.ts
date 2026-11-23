import { expect, test } from "bun:test"

test("测试必须从 Nexum 包目录启动", () => {
  expect(process.cwd()).not.toBe(import.meta.dir.replace(/\/do-not-run-tests-from-root$/, ""))
})
