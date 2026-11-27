# Nexum npm 发包准备 Checklist

这份清单是 AI 准备 Nexum npm 产物的唯一操作指引。AI 只负责检查、构建、打包和验证；
最终 `npm publish` 必须由人工确认后执行。

## 1. 发布输入

每次准备版本时，人工先确定以下参数：

- `VERSION`：完整 semver，例如 `0.1.0-beta.1`、`0.1.0-rc.1` 或 `0.1.0`。
- `TAG`：npm dist-tag，例如 `beta`、`next`、`rc` 或 `latest`。
- `REGISTRY`：可选，默认 `https://registry.npmjs.org/`。

版本和 tag 必须通过命令显式传入，不要依赖脚本默认版本。
准备流程不会修改 workspace package.json 的版本号。

## 2. AI 前置检查

- [ ] 已阅读仓库根目录 `AGENTS.md` 及本清单。
- [ ] 当前分支和目标版本符合本次发布意图。
- [ ] 未发现与本次发包无关的未提交代码变更；已有用户修改必须保留，
  不得覆盖、回滚或自动提交。
- [ ] `VERSION`、`TAG`、`REGISTRY` 已明确且合法。
- [ ] 不要求 AI 登录 npm，不向 AI 提供 npm token、密码或 OTP。

若前置条件不满足，立即停止并报告具体原因。

## 3. 标准准备命令

在仓库根目录执行：

```bash
bun run release:nexum:prepare --version <VERSION> --tag <TAG>
```

指定 registry 时执行：

```bash
bun run release:nexum:prepare --version <VERSION> --tag <TAG> --registry <REGISTRY>
```

例如：

```bash
bun run release:nexum:prepare --version 0.1.0-beta.1 --tag beta
```

统一入口会依次执行：

1. `bun run check`
2. `bun run verify:docs`
3. `bun run build:packages`
4. `bun run pack:nexum`
5. `bun run verify:nexum`

不要把 `npm publish` 添加到脚本、命令链或自动化参数中。

## 4. 必须核对的证据

只有以下项目全部通过，才可以报告“发包准备完成”：

- [ ] 命令以退出码 0 完成。
- [ ] `artifacts/nexum/package.json` 的 `name` 为 `nexum-ai`。
- [ ] manifest 的 `version` 等于本次 `VERSION`，`publishConfig.tag` 等于本次 `TAG`。
- [ ] manifest 的 CLI bin 为 `nexum: dist/cli.js`。
- [ ] tarball 存在：`artifacts/nexum/nexum-ai-<VERSION>.tgz`。
- [ ] consumer 安装、所有公开 subpath 导入、TypeScript 类型检查、CLI `--help`、
  Chat Surface CSS 检查均通过。
- [ ] tarball 不包含源码、测试目录、workspace 包、node_modules 或 `@nexum/*` 泄漏引用。
- [ ] README、模块文档和发布包文档检查通过。

产物目录是 ignored 的临时输出，不要把 `artifacts/nexum` 提交到 Git。

## 5. 停止条件

出现以下任一情况，AI 必须停止，不得继续到人工发布交接：

- 参数缺失或格式非法。
- 分支、工作区或用户已有改动不明确。
- `check`、文档检查、构建、打包或验证任一阶段失败。
- manifest、tarball、exports、类型、CLI、CSS 或 consumer 证据不完整。
- 需要登录 npm、读取 token/密码/OTP，或需要 AI 代替人工执行 registry 写操作。

报告失败阶段、实际命令、退出码和相关输出摘要；不要用“应该没问题”替代证据。

## 6. 人工交接

成功后，AI 必须报告：

- 包名、版本、dist-tag、registry；
- tarball 的绝对路径或仓库相对路径；
- 各验证阶段的通过结果；
- 脚本输出的人工发布命令。

人工确认内容、账号、版本和 tag 后，再执行类似命令：

```bash
npm publish ./artifacts/nexum/nexum-ai-<VERSION>.tgz --tag <TAG> --registry=https://registry.npmjs.org/
npm view nexum-ai version dist-tags --registry=https://registry.npmjs.org/ --json
```

以上两条命令属于人工操作，不是 AI 准备脚本的一部分。
若发布前发现版本或产物有误，回到第 3 节重新准备，不要直接修改 tarball。

## 7. 最终报告模板

```text
发包准备完成（未执行 npm publish）
包名：nexum-ai
版本：<VERSION>
dist-tag：<TAG>
产物：<TARBALL_PATH>
验证：check / docs / build / pack / verify 全部通过
人工发布：<SCRIPT_OUTPUT_PUBLISH_COMMAND>
```
