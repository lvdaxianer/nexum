# 时间语义

所有窗口默认左闭右开：开始条件使用 `gte`，结束条件使用 `lt`；不得生成 `between` 表达时间窗口。开始时间必须早于结束时间。

| logicalType | 输入格式 | 时区要求 | 典型来源 |
|---|---|---|---|
| `date` | `YYYY-MM-DD` | 必须有 `typeContext.timezone` 或 `sessionTimezone` | DATE |
| `local_datetime` | `YYYY-MM-DD HH:mm:ss` 或 `T` 分隔 | 必须有会话/业务时区证据，不把机器本地时区当证据 | DATETIME/DATETIMEV2 |
| `instant` | ISO-8601，带 `Z` 或显式 `±HH:MM` | `TIMESTAMP` 映射到 instant 时仍必须登记来源时区证据 | TIMESTAMP/带时区 TIMESTAMP |

时区字段只表示证据，不允许由语言运行时、服务器所在地或用户输入样例猜测。`typeContext` 可以增加 `timezone` 或 `sessionTimezone`；缺失证据时必须在生成/远程测试前阻断。
