# packages

`packages/` 是 OpenCode 的 workspace package 集合。每个子目录对应一个可独立理解、测试或构建的模块；包之间通过 `package.json` 的 workspace 依赖连接。

## 核心链路

```text
任意 UI → headless-ui / client → headless-server → headless-core
                                      ↓
                         protocol / schema / util
```

- `headless-core`：UI 无关的 Coding Loop、工具、权限、Question、上下文和 Skill 运行时。
- `headless-server`：把 Core 能力暴露为 HTTP/SSE 服务。
- `headless-ui`：可替换的参考页面，只负责控制面和状态展示。
- `protocol`：HTTP API、事件和 OpenAPI 契约。
- `client`：从契约生成的 Promise/Effect 客户端。

## 基础运行时

- `core`：原 OpenCode 运行时服务及其基础设施。
- `schema`：共享领域 Schema、ID 和事件数据类型。
- `util`：跨模块通用工具、Effect layer 和运行时适配。
- `server`：完整 OpenCode Server 的路由和服务组合。
- `simulation`：测试和录制场景所需的模拟服务。
- `script`：构建、打包和仓库维护脚本。

## UI 与扩展

- `cli`、`tui`：命令行和终端入口。
- `ui`、`theme`：共享 Solid UI 组件、样式和主题。
- `latex`、`merman`：Markdown 中 LaTeX 与 Mermaid 内容的渲染支持。
- `plugin`、`plugin-browser`：插件运行时与浏览器插件。
- `ai`、`codemode`、`http-recorder`、`httpapi-codegen`：模型、受限代码执行、网络录制和 API 工具。

## 维护边界

模块新增或拆分时，先补充对应子目录 README，再更新这里的分类。`node_modules`、测试 fixture、构建输出和隐藏工具目录不属于可交付模块，不需要单独 README。

## 验证

优先在目标包目录执行其 `package.json` 中的 `test`、`typecheck` 或 `build` 脚本；跨包契约变更还应运行：

```bash
bun test --cwd packages/headless-core
bun test --cwd packages/headless-server
bun run --cwd packages/protocol check:generated
```
