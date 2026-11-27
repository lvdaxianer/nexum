# Skill 启动扫描与手动注册设计

## 背景

Nexum 的 Skill Registry 已支持配置 root 扫描和按本地地址注册，但独立服务入口创建 Runtime 时没有传入默认 root。结果是服务启动时无法发现项目 `skills/` 目录中的内置 Skill，而外部产品在运行期间仍需要通过接口加入自己管理的 Skill。

## 设计

- 独立服务入口默认把当前工作目录下的 `skills/` 配置为 Skill root。
- 启动时扫描 root 下的一级子目录，并复用现有 `SKILL.md` 校验、摘要、持久化和冲突处理。
- 外部产品新增 Skill 时继续调用现有地址注册接口；注册只保存地址和元数据，不复制源文件。
- 不增加 refresh 自动发现、目录监听或批量注册接口。
- 现有 `docs/zh-CN/capabilities/skills.md` 与 `docs/capabilities/skills.md` 作为独立能力文档，直接补充生命周期说明。

## 验收

- 服务启动时能发现默认 `./skills/` 下的多个有效 Skill。
- 外部产品可以通过现有 register API 手动加入新增 Skill。
- 已有注册记录可以在重启后恢复。
- 文档明确说明启动扫描、手动注册、源目录不复制和新增目录不自动发现。
