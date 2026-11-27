# Spec Delta

## Purpose

为 Nexum 建立一个可在 npm registry 中占用产品名称、供受控用户安装验证的 beta 发布入口，同时明确其版本、发布通道和 Bun 运行时边界。

## ADDED Requirements

### Requirement: Beta package identity

发布产物 MUST 使用包名 `nexum-ai`，并允许生成明确的 beta 版本号，例如 `0.1.0-beta.0`。

#### Scenario: Generated beta manifest

- **WHEN** 发布构建生成 package manifest
- **THEN** manifest 的 `name` 为 `nexum-ai`，`version` 为约定的 beta 版本，且不包含 `private: true`

### Requirement: Beta distribution channel

beta 版本 MUST 使用 `beta` dist-tag 发布，且不得把 beta 版本移动到 npm 的 `latest` dist-tag。

#### Scenario: Publish beta release

- **WHEN** 发布 `nexum-ai` 的 beta tarball
- **THEN** npm registry 的 beta 用户可以通过 `nexum-ai@beta` 安装该版本，而默认 `latest` 入口不会被该 beta 发布覆盖

### Requirement: Runtime declaration

发布包 MUST 明确声明当前公开运行时依赖 Bun，并且其文档和 consumer 验证不得把该包描述为通用 Node.js 运行时。

#### Scenario: Bun runtime contract

- **WHEN** 用户查看 beta 包的 manifest 或安装文档
- **THEN** 可以看到支持的 Bun 运行时范围，并知道 Server、CLI 和 SQLite 能力依赖 Bun 特性
