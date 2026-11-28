# Nexum Surfaces

`nexum-ai/surfaces` 是可嵌入的完整 Web 工作台组件。用户安装统一包后，可以直接通过 `import` 将它挂载到自己的前端页面。

```bash
npm install nexum-ai
```

```tsx
import { render } from "solid-js/web"
import { NexumSurfaces } from "nexum-ai/surfaces"
import "nexum-ai/surfaces/styles.css"

render(() => <NexumSurfaces apiBaseUrl="http://127.0.0.1:4097" />, document.getElementById("root")!)
```

组件把 Protocol/Client 事件投影成聊天、权限、Question、工具和状态视图，不承载 Core 的工具执行、权限决策或 Session 业务规则。`apiBaseUrl` 可选；省略时使用构建环境配置或当前页面主机的默认 Nexum API 地址。

仓库内开发仍可运行 `bun run dev:surface`，验证命令为 `bun run --cwd packages/nexum-surfaces typecheck:tsc`、`bun run --cwd packages/nexum-surfaces build` 和 `bun test --cwd packages/nexum-surfaces`。
