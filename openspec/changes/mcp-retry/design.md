# Design

本变更采用 Server-owned 的 MCP 重试状态机。Core Registry 复用现有 generation、AbortController、operation single-flight 和 retry timer，统一首次连接失败与断线恢复；Runtime 负责启动时恢复配置，Application 继续负责工具目录 ready，Server/Client 只暴露和观察安全状态。

自动重试为最多三次，退避 250ms、1s、3s。配置无效、OAuth needs_auth、主动断开、移除和 Runtime close 不重试；连接成功会清零重试计数。Client 页面在挂载时拉取 MCP 列表并通过状态刷新展示 pending/retrying/connected/needs_auth/failed。
