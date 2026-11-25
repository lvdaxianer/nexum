# mcp-network-boundary Specification

## Purpose

限制远程 MCP 的连接目标，防止配置 URL 或 DNS 解析结果指向本机、私有网络、链路本地和云元数据地址。

## ADDED Requirements

### Requirement: MCP URL SHALL reject unsafe targets

MCP 配置 SHALL 只接受 HTTP(S) URL，并拒绝 userinfo、query、fragment、localhost、回环、私有、链路本地、未指定、组播和云元数据目标。

#### Scenario: Unsafe literal address

- **WHEN** MCP URL 指向 `127.0.0.1`、私有网段、IPv6 回环或元数据主机
- **THEN** 配置 SHALL 返回 `invalid_config`，不得注册或连接该 Server

#### Scenario: Hidden URL state

- **WHEN** MCP URL 包含 userinfo、query 或 fragment
- **THEN** 配置 SHALL 返回 `invalid_config`，不得持久化该 URL

### Requirement: MCP connection SHALL validate DNS results

建立远程连接前，SDK SHALL 解析目标 hostname；任一解析地址落入禁止范围时 SHALL 拒绝连接并返回稳定配置错误。

#### Scenario: DNS resolves to a local address

- **WHEN** 公共域名解析出回环、私有或链路本地地址
- **THEN** SDK SHALL 在发出 MCP 请求前拒绝连接
