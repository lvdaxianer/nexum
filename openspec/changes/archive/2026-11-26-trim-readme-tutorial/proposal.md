# Proposal

## Why

主 README 当前重复展示完整教程的安装、Runtime、Server 和前端代码，导致入口页过长，也让读者不知道应该看哪一份说明。详细内容已经放在独立案例文档中，README 应该只承担导航职责。

## What Changes

- 删除 README 中重复的手把手代码步骤。
- 保留案例目标、组合内容和完整教程链接。
- 明确提示读者从独立教程继续查看 SQLite、Session、Server、Client 和 Chat Surface 的完整用法。

## Capabilities

### New Capabilities

无。本次只调整文档入口。

### Modified Capabilities

无。本次不修改运行时能力或 API 要求。

## Impact

- 只影响根目录 `README.md`。
- 不修改源码、协议、依赖、发布产物或独立教程内容。
