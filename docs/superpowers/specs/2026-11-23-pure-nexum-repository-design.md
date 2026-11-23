# 纯 Nexum 仓库迁移设计

## 目标

将当前 `dev-v0.0.1` 变成只包含 Nexum Runtime 的工作分支。`dev` 继续作为原 OpenCode 分支存在，不参与本次迁移。迁移完成后，根 workspace 只发现 `@nexum/*` 包，默认开发命令直接启动 Nexum Test Workbench，模型、Session、Skill 和默认角色提示词的既有持久化行为保持不变。

## 边界判断

### 保留

- `packages/nexum-core`：运行语义与端口。
- `packages/nexum-adapters`：默认模型、文件持久化和 Runtime Composer。
- `packages/nexum-protocol`、`packages/nexum-client`、`packages/nexum-server`：协议、客户端和 HTTP/SSE 绑定。
- `packages/nexum-surfaces`、`packages/nexum-test`：参考 Surface 与跨层验证工作台。
- `apis/nexum.md`、Nexum 包 README、OpenSpec 和设计/计划/审查记录。
- `skills/`：外部 Skill 注册目录说明；具体 Skill 仍由地址注册到 Nexum 管理。

### 删除

- 原 OpenCode 产品包：`ai`、`app`、`cli`、`client`、`codemode`、`core`、`desktop`、`gui-plugins`、`http-recorder`、`httpapi-codegen`、`latex`、`merman`、`nav-menus`、`patchmark`、`plugin`、`plugin-browser`、`protocol`、`schema`、`script`、`sdk`、`server`、`session-ui`、`simulation`、`stories`、`theme`、`tui`、`ui`、`util`。
- 原 OpenCode 的数据、插件、进程和 Drizzle 工具目录：`packages/data`、`packages/plugins`、`packages/process-daemon`、`packages/effect-drizzle-sqlite`、`packages/identity`。
- 仅服务于旧产品的根 `script/`、`patches/`、安装器、Nix/旧服务入口和旧产品说明；历史设计资料不删除，避免破坏项目决策追溯。

## 根 workspace 设计

根 `package.json` 使用 `name: "nexum"`，workspace 只匹配 `packages/nexum-*`。根脚本只保留：启动 Test Workbench、启动 Surface、lint、typecheck、完整 check、安装后维护和显式禁止从根运行测试。根配置不再出现 `@opencode/*`、`OPENCODE_*` 或旧仓库地址。

Turbo 只保留适用于 Nexum 的通用 `typecheck`、`typecheck:tsc`、`build`、`test` 和依赖传递任务，不再写入原产品包名。Bun 配置保留安装安全策略和根测试保护，但移除旧 OpenCode 包的版本例外。补丁目录删除后，根 `patchedDependencies` 和 lockfile 重新生成。

## 验证策略

1. 先添加仓库边界测试，验证 workspace 清单和活跃配置不得含 `@opencode/*`。
2. 在删除旧目录和改根配置后运行 `bun install`，确认 workspace 只解析七个 Nexum 包。
3. 分别运行 Nexum Core、Adapters、Protocol、Client、Server、Test 的测试与类型检查，运行 Surface 类型检查和构建。
4. 运行根 `bun run check`、`git diff --check`、OpenSpec 校验，并记录任何来自旧基线或外部环境的失败。
5. 重启本地 Server + Surface，用浏览器通过 Nexum 页面重新注册用户给出的 Skill 地址，刷新页面确认 Skill 列表和模型/Session 持久化仍可用。

## 非目标

- 不修改 `dev` 分支。
- 不把 OpenCode 的包改名后继续保留为 Nexum 依赖；已经存在的独立 `@nexum/*` 包是本分支唯一运行时实现。
- 不迁移历史文档中的每一条 OpenCode 变更记录；历史资料不参与构建和发布。
