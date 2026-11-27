# Skill 能力

[English](../../capabilities/skills.md)

状态：现状基线

权威来源：`packages/nexum-core/src/skill-registry.ts`、`packages/nexum-core/src/skill-invocation.ts`、`packages/nexum-integrations/src/local-skill-source.ts`、`packages/nexum-application/src/skill-registry.ts`

最后核对：2026-11-24

## 1. Skill 包与安全摘要

当前只支持 `local-directory` 来源。一个可用 Skill 是目录中的 `SKILL.md` 加可选的 `references/`、`scripts/` 等相对文件。`SKILL.md` 必须有 frontmatter 的 `name` 和 `description`；`version` 可选，Skill ID 必须匹配小写字母、数字和连字符。

Registry 对外只返回安全摘要：

| 字段                                   | 说明                                               |
| -------------------------------------- | -------------------------------------------------- |
| `id`、`name`、`description`、`version` | Skill 元数据                                       |
| `digest`                               | 所有相对文件路径和内容生成的稳定 SHA-256 摘要      |
| `fileCount`、`files`                   | 文件数量和完整相对清单                             |
| `status`                               | `ready`、`invalid` 或 `conflict`                   |
| `diagnostics`                          | 可展示的校验诊断，不含绝对路径、凭据或原始命令输出 |
| `sourceType`                           | 当前为 `local-directory`                           |

扫描会拒绝缺少 `SKILL.md`、非法 frontmatter、符号链接、越界路径、不可读文件、超出单文件大小限制的目录。多个来源出现相同 Skill ID 时状态为 `conflict`，不会静默择一；`invalid` 和 `conflict` Skill 不能激活。

## 2. Registry 生命周期

Application 负责把 Integration 的 `NexumSkillSource` 和 Persistence 的注册 Store 组合为 Registry：

```text
配置 roots / 注册 address
  → LocalSkillSource 扫描目录
  → Application 聚合候选并处理 duplicate
  → Persistence 保存注册地址、digest、status、diagnostics
  → Server 暴露安全摘要
```

首次加载已有注册记录；没有注册记录时扫描配置 roots 并持久化发现结果。重复注册同一规范化地址是幂等的；注销只删除注册记录和 Registry 条目，不删除 Skill 源目录。

## 3. 显式激活

用户在 Prompt 中写入 `@<skill-id>` 时，Invocation Port：

1. 按原始输入顺序解析 mention，保留 UTF-16 `start`、`end` 和原文 `text`。
2. 对相同 ID 只保留首次 mention，避免重复审批和重复注入。
3. 查询 Registry 摘要；不存在返回 `skill_not_found`，非 `ready` 返回 `skill_not_ready`。
4. 对每个 Skill 串行发起 `skill.use` Permission 请求。
5. 允许后读取 `SKILL.md`，生成带 `sourceID: skill:<id>` 的临时 system message。
6. Coding Loop 发布 `skill.activated`；激活失败发布 `skill.failed`，并按 Session 失败/取消语义收敛。

Skill 原文进入本轮模型上下文，不进入普通 canonical history。Skill 触发的 shell、读写和外部调用仍必须经过正常 Tool/Permission 边界，Skill 不能绕过沙箱或权限。

## 4. 页面和 API 行为

页面加载 Skill 列表后支持 `@` 建议、选择和已附加 chip；发送 Prompt 后根据 `skill.activated` 或 `skill.failed` 更新运行时间线。校验失败保留诊断，并允许 refresh 或 unregister，不得显示为 ready。

对应 HTTP 操作包括列表、详情、注册、刷新、校验、激活和注销；端点字段与错误码见 [Nexum HTTP API](../../../apis/zh-CN/nexum.md)。

## 5. 相关入口

- [Skill Registry 规范](../../../openspec/specs/headless-skill-registry/spec.md)
- [Skill 控制规范](../../../openspec/specs/headless-skill-control/spec.md)
- [Skill Invocation 规范](../../../openspec/specs/headless-skill-invocation/spec.md)
- [Skill Registry 测试](../../../packages/nexum-core/test/skill-registry.test.ts)
- [Skill Invocation 测试](../../../packages/nexum-core/test/skill-invocation.test.ts)
- [Skill API 测试](../../../packages/nexum-server/test/skill-api.test.ts)
