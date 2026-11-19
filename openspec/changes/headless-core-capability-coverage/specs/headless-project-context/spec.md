# Spec Delta

## Purpose

让 Headless Session 能够把项目 instructions、Skill 和 Reference 等外部约束作为模型上下文补充注入，并在重复加载和上下文压缩后保持一致。

## ADDED Requirements

### Requirement: 项目上下文必须在模型可见历史中可追踪

Runtime MUST 将已发现的项目上下文以可识别来源写入模型消息或等价的上下文层，并保留来源路径、内容和注入顺序。

#### Scenario: 首次加载项目 instructions

- **WHEN** Session 发现可读的项目 instructions、Skill 或 Reference 文件
- **THEN** 下一次模型请求包含对应的上下文内容和来源标识

### Requirement: 同一上下文来源不得重复注入

Runtime MUST 为每个 Session 和来源建立去重依据，重复刷新、重复订阅或多轮 Prompt 不得把同一来源重复追加到模型上下文。

#### Scenario: 重复刷新上下文

- **WHEN** 同一来源被发现两次
- **THEN** 模型历史只包含一份该来源内容，并保留第一次确定的顺序

### Requirement: 压缩后项目上下文必须可恢复

上下文压缩或历史裁剪后，Runtime MUST 能够根据来源记录重新注入仍然有效的项目上下文，且不得绕过权限读取不可访问文件。

#### Scenario: 压缩后继续请求

- **WHEN** 压缩移除了旧的项目上下文消息
- **THEN** 后续模型请求重新包含有效上下文来源，失效或不可读来源不会被伪造
