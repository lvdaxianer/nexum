# Proposal

## Why

Nexum 的公开使用说明目前只有中文版本，国际用户进入 GitHub 后缺少默认英文入口；同时中文用户也需要保留完整的中文阅读路径。需要为公开使用文档建立稳定的中英文镜像关系。

## What Changes

- 将根 README 和公开使用文档的默认路径切换为英文。
- 为每份公开使用文档提供对应的中文镜像。
- 在文档顶部增加 English / 中文互相切换链接。
- 保持代码、导入路径、API 名称和参数名完全一致，只翻译说明文字。
- 明确排除 OpenSpec、开发计划、审计记录、内部测试和其他仓库内部文档。

## Capabilities

### New Capabilities

无。本次只调整公开文档的语言和导航，不新增运行时行为。

### Modified Capabilities

无。本次不修改协议、API 或产品能力要求。

## Impact

- 影响根 README、`docs/` 下的公开使用说明和 `apis/` 下的公开 API 文档。
- 新增 `README.zh-CN.md`、`docs/zh-CN/` 和 `apis/zh-CN/` 文档镜像。
- 需要同步修正双语文档中的相对链接和文档校验规则。
