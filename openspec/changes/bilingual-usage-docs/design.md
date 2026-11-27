# Design

## 目录与默认语言

- `README.md` 和原有 `docs/`、`apis/` 路径作为英文默认入口。
- `README.zh-CN.md` 保存根目录中文说明。
- `docs/zh-CN/` 镜像公开 `docs/` 使用说明，保持相同的相对目录结构。
- `apis/zh-CN/` 镜像公开 API 说明。

## 双语切换

每份英文文档顶部提供 `中文` 链接，每份中文文档顶部提供 `English` 链接。链接只在语言镜像之间切换，不改变代码示例和 API 路径。

## 范围

纳入：README、文档中心、examples、capabilities、modules、ui、architecture 和公开 API 文档。

排除：`openspec/`、`docs/superpowers/`、测试工作台内部说明、开发计划、审计记录和源码包 README。

## 一致性校验

- 英文和中文镜像的公共代码块、公开入口和 API 名称保持一致。
- 为双语文档增加镜像存在性和语言切换链接检查。
- 继续运行现有 `bun run verify:docs`、内部链接检查和 `bun run check`。
