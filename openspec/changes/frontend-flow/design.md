# Design

`ChatSurface` 只展示协议明确返回的 `assistant.reasoning` 内容，不推断或暴露模型隐藏思维链。没有内容时保留 thinking heartbeat 状态，并用明确文案说明“若模型提供思考内容会显示”；空 reasoning 项不再覆盖该状态。收到非空 reasoning 增量后，按原有 run 归并逻辑渲染折叠面板。

权限模式切换先并行删除所有旧的全局规则，删除阶段完成后再创建目标规则；同一阶段的请求彼此独立，不改变先清理后写入的语义。
