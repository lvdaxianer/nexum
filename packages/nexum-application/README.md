# @nexum/application

Nexum 的应用编排层。这里放 Skill Registry、Tool Registry、Question Broker、Configured Coding Loop 和 Runtime Composer，负责把 Core、Persistence 与 Integrations 组合成可运行服务。

Application 不是通用持久化包；替换存储场景时，优先通过 `NexumRuntimeOptions.persistence` 注入 `NexumPersistence` 组合。CLI 默认使用 `createFilePersistence()`，嵌入式和测试默认使用 `createMemoryPersistence()`；单项 Port 仍可显式注入以兼容现有调用方和测试替身。
