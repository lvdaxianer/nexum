# Nexum 包发布准备设计

## 背景

当前发布流程已经具备构建、打包、文档检查和仓库外 consumer 验证脚本，但版本号、dist-tag 和执行顺序仍分散在多个脚本中。每个版本都需要 AI 或开发者重新判断命令顺序，容易漏掉检查，也容易误触 npm 发布。

## 目标

- 为任意后续版本提供一个参数化的产物准备入口。
- 让 AI 可以仅按根目录 CHECKLIST 完成构建、验证和交接。
- 保持 `npm publish` 为人工动作，准备脚本永不发布。
- 保留现有底层脚本，便于单独调试和 CI 复用。

## 设计

### 统一入口

新增 `release:nexum:prepare` 根脚本：

```bash
bun run release:nexum:prepare --version 0.1.0-beta.1 --tag beta
```

入口要求显式传入版本号和 dist-tag，可选接收 npm registry 地址；默认使用官方 npm registry 作为人工发布命令的目标，registry 不写入 tarball manifest。它按固定顺序执行：

1. 参数和版本格式校验。
2. `bun run check`。
3. `bun run verify:docs`。
4. 生成带传入版本/tag 的 `artifacts/nexum`。
5. 生成 tarball。
6. 运行 `verify:nexum`，验证所有公开入口、consumer、CLI、CSS、TypeScript 和 tarball 清单。
7. 输出产物路径、包身份、校验结果和人工 publish 命令。

入口不提供 `--publish`，也不读取或打印 npm token。失败时立即退出，不输出可被误认为已发布的成功信息。

### 版本传递

发布准备入口通过受控的进程环境把版本号和 tag 传给现有底层脚本。低层脚本保留当前 beta 默认值，以维持已有 `build:packages`、`pack:nexum` 和 `verify:nexum` 的本地兼容性；显式传参时，生成 manifest、tarball 和验证器统一使用同一组值。

生成包不修改仓库根 `package.json` 或 workspace 包版本；版本只写入被 `.gitignore` 忽略的 `artifacts/nexum/package.json`。

### 根目录 CHECKLIST

新增 `nexum-package-release-checklist.md`，作为 AI 执行发布准备的唯一操作说明。文档包括：

- 开始前的分支、工作树、registry 和版本确认。
- 标准命令顺序和每一步的通过条件。
- 明确禁止 AI 执行 `npm publish`。
- 产物、tarball、manifest 和 consumer 证据要求。
- 失败停止规则和交接模板。
- 人工发布与 registry 查询命令。

### 错误处理

- 缺少参数、版本格式错误或 tag 为空时，在构建前失败。
- 任意子命令非零退出时，准备入口返回非零退出码。
- 产物验证失败时不输出人工发布命令。
- 外部 npm 登录、OTP 和权限不属于准备入口的职责，由人工执行 publish 时处理。

## 测试与验证

- 为参数化 manifest/prepare 行为增加 focused test，并先观察 RED 再实现。
- 运行 `bun run release:nexum:prepare --version 0.1.0-beta.1 --tag beta`。
- 运行 `bun run verify:docs`、`bun run verify:nexum` 和 `bun run check`。
- 检查生成 tarball 不包含 workspace 引用、源码路径或测试目录。
- 检查准备入口不会调用 `npm publish`。

## 非目标

- 不自动发布 npm。
- 不改变 Runtime、Protocol、Server 或 workspace 依赖边界。
- 不拆分独立 npm 包。
- 不改变现有用户数据目录、CLI 配置目录或协议标识。
