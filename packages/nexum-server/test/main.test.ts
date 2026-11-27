import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { createNexumRuntimeOptions } from "../src/main.ts"

test("服务 Runtime 启动配置包含默认项目 Skill root", () => {
  expect(createNexumRuntimeOptions().skillRoots).toEqual([resolve(process.cwd(), "skills")])
})
