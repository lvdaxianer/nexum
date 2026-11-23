# @nexum/persistence

Nexum Core Port 的默认持久化实现层。这里放文件/内存 Store、Event Hub 和可恢复状态，不承载 Skill、Tool 或 Runtime 业务编排。

当前实现包括 Session、Message、Interaction、Model Config、Role Prompt、Permission Policy 规则、Skill 注册状态、Event 和 Memory。策略判定仍由 Core 负责；本包只保存规则状态。
