# Nexum CLI

CLI 是 Nexum 的终端 Surface。安装 `nexum` 后即可使用 `nexum` 可执行文件；程序化入口为 `nexum/cli`。

```bash
npm install nexum
npx nexum --help
npx nexum --server http://127.0.0.1:4097
```

CLI 复用 `nexum/surface-adapter` 和 `nexum/client`，提供 REPL、Session、Model、Skill、MCP、Permission 和 Question 命令，不直接依赖 Core 或 Server 执行实现。Server 需要由宿主或单独的 Nexum 服务启动。

仓库内开发使用源码入口：`bun run --cwd packages/nexum-cli start -- --help`。源码包只用于 workspace 开发，发布物中的 CLI 已经编译到 `nexum` tarball，不要求用户下载仓库源码。
