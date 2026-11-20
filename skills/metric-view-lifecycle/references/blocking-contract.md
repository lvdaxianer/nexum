# 执行模式与阻断契约

模式选择的机器可执行实现是 `scripts/execution_mode.py`。本文只定义对用户和下游编排器可观察的字段，避免把“缺凭据”解释成“可用合成数据”。

## 状态

| state | evidenceStatus | 允许的验证 | 允许 save |
|---|---|---|---|
| `real` | `mysql_verified` | 只读 MySQL 元数据、真实接口测试 | 测试成功且用户确认后 |
| `asserted` | `ddl_asserted_consistent` | 接口和本地结构验证，不能声称实时核验 | 测试成功且用户确认后 |
| `synthetic` | `synthetic_unverified` | 本地 HTTP 合成结构验证 | 不允许自动保存/发布 |
| `blocked` | `blocked` | 不生成真实 DSL/Python，不调用远程测试 | 不允许 |

## 缺凭据的固定报告

默认模式没有完整只读输入时，必须返回等价结构：

```json
{
  "state": "blocked",
  "reasonCode": "MYSQL_CREDENTIALS_REQUIRED",
  "requiredInputs": ["host", "port", "database", "schema", "readonlyUser", "readonlyPassword", "tableScope", "testScope"],
  "nextAction": "补齐只读 MySQL 连接信息，或明确选择 synthetic_unverified/ddl_asserted_consistent",
  "canCallRemoteTest": false,
  "canCallSave": false,
  "canCallSyntheticTest": false,
  "evidenceStatus": "blocked"
}
```

`blocked` 是终态，不需要无限等待用户回答。后续用户若补齐输入或明确选择模式，应从新的请求重新决策；在此之前不得自动降级、轮换凭据、调用 `test/testExecute/save` 或把错误转成 Mock。
