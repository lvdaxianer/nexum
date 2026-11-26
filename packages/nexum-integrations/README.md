# Nexum Integrations

Integrations 是环境能力适配层，发布入口为 `nexum/integrations`。它提供 OpenAI-compatible Model、本地 Host、目录校验、项目上下文、Skill 文件来源和 MCP 连接器。

```bash
npm install nexum
```

```ts
import { createOpenAICompatibleModelPort, createLocalHostAdapter } from "nexum/integrations"

const model = createOpenAICompatibleModelPort({ baseUrl, apiKey, model })
const host = createLocalHostAdapter({ directory: process.cwd() })
```

Application 会把这些适配器注入 Core Runtime。Integrations 不负责 Persistence、Session 编排或 UI；替换模型网关、文件系统边界、MCP Transport 时在这里实现或选择适配器。

运行约束：API key、工作目录、Shell 权限和 MCP 凭据由宿主安全配置；不要把凭据写入模型配置回显或前端包。

仓库内开发：`bun test --cwd packages/nexum-integrations`、`bun run --cwd packages/nexum-integrations typecheck`。
