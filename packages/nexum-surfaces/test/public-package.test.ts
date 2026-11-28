import { expect, test } from "bun:test"
import { publicEntries } from "../../../script/nexum-package"

test("发布配置包含可导入的 surfaces 公共入口", () => {
  expect("./surfaces" in publicEntries).toBe(true)
})
