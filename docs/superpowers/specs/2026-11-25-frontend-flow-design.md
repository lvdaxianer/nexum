# 前端运行状态反馈设计

## Reasoning 展示

- `assistant.thinking` 只表示运行中，不代表模型一定会返回 reasoning 文本。
- `assistant.reasoning` 只有带非空 `content` 时才创建或更新 reasoning 面板。
- 面板没有可展示内容时显示稳定占位文案，模型实际返回的 reasoning 仍按协议增量显示。

## 权限模式切换

旧规则删除全部完成后才创建新规则；删除阶段、目标风险规则创建阶段分别使用 `Promise.all`，任一请求失败则保留错误状态并重新加载服务端规则。
