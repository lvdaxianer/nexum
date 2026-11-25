# Design

`session.failed.data.message` 只由已知 `NexumModelError`、`NexumRunError` 和 `NexumSkillInvocationError` 的稳定 code 映射得到；其它异常统一为 `Coding Loop 执行失败`。原始异常继续通过运行 Promise 交给内部调用方和日志处理，但不进入事件流。
