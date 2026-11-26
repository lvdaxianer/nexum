# Nexum 模块文档索引

返回[文档中心](../README.md)。如果你还不确定应该选择哪个模块，先阅读文档中心的[模块选择](../README.md#模块选择)。

如果你想先看完整组合，再回到模块细节，先阅读[组合案例目录](../examples/README.md)。

这里同时记录源码模块边界和发布后的使用入口。用户安装的是唯一公共包 `nexum`；`@nexum/*` 只表示仓库内部源码包，不是用户的独立安装包。

## 公共模块

| 源码模块                   | 发布入口                                              | 使用文档                                                       |
| -------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `nexum-core`               | `nexum/core`                                          | [`nexum-core.md`](./nexum-core.md)                             |
| `nexum-protocol`           | `nexum/protocol`                                      | [`nexum-protocol.md`](./nexum-protocol.md)                     |
| `nexum-application`        | `nexum/application`                                   | [`nexum-application.md`](./nexum-application.md)               |
| `nexum-persistence`        | `nexum/persistence`                                   | [`nexum-persistence.md`](./nexum-persistence.md)               |
| `nexum-persistence-memory` | `nexum/persistence/memory`                            | [`nexum-persistence-memory.md`](./nexum-persistence-memory.md) |
| `nexum-persistence-file`   | `nexum/persistence/file`                              | [`nexum-persistence-file.md`](./nexum-persistence-file.md)     |
| `nexum-persistence-sqlite` | `nexum/persistence/sqlite`                            | [`nexum-persistence-sqlite.md`](./nexum-persistence-sqlite.md) |
| `nexum-integrations`       | `nexum/integrations`                                  | [`nexum-integrations.md`](./nexum-integrations.md)             |
| `nexum-client`             | `nexum/client`                                        | [`nexum-client.md`](./nexum-client.md)                         |
| `nexum-server`             | `nexum/server`                                        | [`nexum-server.md`](./nexum-server.md)                         |
| `nexum-surface-adapter`    | `nexum/surface-adapter`                               | [`nexum-surface-adapter.md`](./nexum-surface-adapter.md)       |
| `nexum-chat-surface`       | `nexum/chat-surface`、`nexum/chat-surface/styles.css` | [`nexum-chat-surface.md`](./nexum-chat-surface.md)             |
| `nexum-cli`                | `nexum` binary、`nexum/cli`                           | [`nexum-cli.md`](./nexum-cli.md)                               |

## 仓库内部模块

| 源码模块         | 边界                     | 使用文档                                   |
| ---------------- | ------------------------ | ------------------------------------------ |
| `nexum-surfaces` | 参考 Web Surface，不发布 | [`nexum-surfaces.md`](./nexum-surfaces.md) |
| `nexum-test`     | Test Workbench，不发布   | [`nexum-test.md`](./nexum-test.md)         |

每个模块文档都应同步职责、使用入口、依赖边界和修改同步清单；HTTP API 以 `apis/nexum.md` 为准，协议类型以 `nexum/protocol` 为准，发布入口与文档的对应关系由仓库发布检查维护。
