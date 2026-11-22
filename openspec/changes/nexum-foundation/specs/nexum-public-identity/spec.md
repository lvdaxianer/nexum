# Spec Delta

## Purpose

将新 Runtime 的公开身份从上游实现名称中独立出来，使包、协议、事件、配置和默认数据路径都以 Nexum 为稳定前缀，便于独立发布和长期演进。

## ADDED Requirements

### Requirement: Public packages SHALL use the Nexum namespace

新 Runtime 对外发布的包 SHALL 使用 `@nexum/*` 命名空间，公开文档和示例 SHALL 不得把 `@opencode/*` 作为 Nexum 的安装入口。

#### Scenario: 安装默认 Client
- **WHEN** 用户按照公开文档安装 Nexum Client
- **THEN** 文档和 package metadata SHALL 指向 `@nexum/client` 或对应的 Nexum 包

### Requirement: Public protocol SHALL use the Nexum version namespace

新 Runtime 的协议、事件类型和能力标识 SHALL 使用 `nexum.runtime.v1` 及其子命名空间，协议响应 SHALL 不得把 `headless.v1` 作为 Nexum 的主版本标识。

#### Scenario: 查询能力版本
- **WHEN** 客户端请求 Runtime 能力
- **THEN** 返回的协议版本 SHALL 为 `nexum.runtime.v1`

### Requirement: Default configuration SHALL use Nexum paths and environment names

默认数据目录、配置文件、环境变量和日志服务标识 SHALL 使用 `.nexum` 或 `NEXUM_` 前缀；兼容旧配置时 SHALL 由迁移适配层显式处理，不得污染新的默认配置。

#### Scenario: 首次启动本地服务
- **WHEN** 用户未指定数据目录或配置文件
- **THEN** 服务 SHALL 使用 Nexum 默认路径，并不得创建 `.headless` 或 `OPENCODE_HEADLESS_*` 默认配置

### Requirement: Upstream attribution SHALL remain non-runtime metadata

上游 OpenCode 的来源说明 MAY 出现在开发文档、许可证或迁移记录中，但运行时包名、协议标识、事件类型和用户可见品牌 SHALL 使用 Nexum。

#### Scenario: 查看运行事件
- **WHEN** 客户端接收 Nexum 运行事件
- **THEN** 事件类型和服务标识 SHALL 使用 Nexum 命名，不得依赖上游品牌判断事件类型
