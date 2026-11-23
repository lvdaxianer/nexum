# Spec Delta

## Purpose

让 Nexum 页面能够从持久化的 Session canonical 消息历史恢复完整对话，并通过有界分页和向上滚动查看较早消息，同时保持实时事件流与模型上下文的边界清晰。

## ADDED Requirements

### Requirement: 服务 SHALL 分页返回 Session canonical 消息历史

服务 SHALL 为已存在的 Session 提供只读的分页消息历史查询，并返回消息顺序、分页游标和是否还有更早消息。

#### Scenario: 查询最新一页消息
- **WHEN** 客户端以合法 Session ID 查询消息历史且未提供向前游标
- **THEN** 服务返回该 Session 最新的一页 canonical 消息、下一页游标和 `hasMore` 状态

#### Scenario: 查询更早一页消息
- **WHEN** 客户端携带服务返回的向前游标再次查询
- **THEN** 服务返回紧邻当前页之前的消息，且不会重复当前页中的消息

#### Scenario: 查询不存在的 Session
- **WHEN** 客户端使用不存在的 Session ID 查询消息历史
- **THEN** 服务返回稳定的资源不存在错误，不泄露文件路径或内部异常

### Requirement: 消息历史 SHALL 保留模型可恢复的消息类型

消息历史 SHALL 返回用户消息、Assistant 文本与 reasoning、Assistant 工具调用、工具结果以及上下文压缩摘要，并保持它们在 canonical 历史中的顺序。

#### Scenario: 历史包含工具调用
- **WHEN** Session 已完成一次包含工具调用的运行
- **THEN** 消息历史同时返回对应的 Assistant 工具调用消息和 tool 结果消息

#### Scenario: 历史包含上下文压缩
- **WHEN** Session 发生上下文压缩并成功持久化
- **THEN** 消息历史返回压缩摘要消息和压缩后保留的最近消息

### Requirement: 消息历史 SHALL 避免暴露临时注入内容和凭据

普通消息历史 SHALL 不返回默认角色提示词、Skill 原文、项目上下文原文或模型凭据；这些内容仍可在模型请求时由 Core 临时注入。

#### Scenario: 查询包含临时上下文的 Session
- **WHEN** Core 曾为模型请求注入角色提示词、Skill 或项目上下文
- **THEN** 消息历史不包含这些临时内容的原文，也不包含任何模型凭据

### Requirement: 页面 SHALL 恢复并滚动浏览消息历史

页面选择或刷新 Session 时 SHALL 加载最新消息；用户滚动到对话顶部时 SHALL 加载更早消息，并在加载期间保留当前已展示内容。

#### Scenario: 刷新页面恢复对话
- **WHEN** 页面恢复一个已有消息历史的 Session
- **THEN** 对话视图显示最新历史消息，并继续订阅该 Session 的实时事件流

#### Scenario: 向上滚动加载早期消息
- **WHEN** 用户滚动到对话顶部且服务返回 `hasMore: true`
- **THEN** 页面在顶部插入更早消息，保持当前可见内容位置，不重复或清空已展示消息

#### Scenario: 历史加载失败
- **WHEN** 消息历史请求失败或事件流暂时断开
- **THEN** 页面保留已展示的消息，显示可理解的恢复提示，并允许重新加载或重连
