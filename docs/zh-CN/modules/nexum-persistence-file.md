# `nexum/persistence/file`

[English](../../modules/nexum-persistence-file.md)

这是 `nexum` 包中的 JSON 文件 Persistence 变体。用户安装 `nexum` 后从 `nexum/persistence/file` 导入 `createFilePersistence`。

```ts
import { createLocalRuntime } from "nexum/application"
import { createFilePersistence } from "nexum/persistence/file"

const runtime = createLocalRuntime({ persistence: createFilePersistence({ dataDirectory: ".nexum" }) })
```

## 公开 API

### `createFilePersistence(options)`

| 参数              | 类型         | 必填 | 说明                                       |
| ----------------- | ------------ | ---- | ------------------------------------------ |
| `dataDirectory`   | `string`     | 是   | 保存 Session、消息、事件、交互和配置的目录 |
| 各 Store 路径覆盖 | 可选路径字段 | 否   | 需要将某类数据放到其他位置时使用           |

返回完整的 `NexumPersistence` 组合，可传给 `createLocalRuntime({ persistence })`。`dataDirectory` 是持久化根目录，不是 Session 的工作目录；Session 的工作目录通过 `sessionService.create({ directory })` 传入。

它按文件保存 Session、消息、事件、交互和配置，适合本地 CLI 或单机应用；生产环境需要把数据目录放在发布目录之外并单独备份。它不会自动迁移到 SQLite。

源码边界：`packages/nexum-persistence-file/src/index.ts`。
