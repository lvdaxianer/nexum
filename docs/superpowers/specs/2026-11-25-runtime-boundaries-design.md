# 运行边界加固设计

## 目标

让 Nexum 在本地开发和非回环部署下都具备明确的执行边界，避免未认证访问、Shell 输出/文件读写无界、路径通过符号链接逃逸、模型探测无限等待，以及 MCP 连接访问本机内部网络。

## 方案

### 服务认证

- 默认回环监听保持兼容，不要求 token，方便 CLI 和本地 Web 使用。
- 当 `hostname` 不是回环地址时，`startNexumServer` 必须收到非空 `authToken`，否则启动失败。
- 非回环服务的 API 请求使用 `Authorization: Bearer <token>`。
- 健康检查和 CORS preflight 不执行 Bearer 校验；业务 API 没有有效 token 时返回稳定的 401 错误。
- CORS 允许头增加 `authorization`。

### 本地 Host

- read、write、Shell command 和 stdout/stderr 都设置可配置上限。
- 读取前使用 canonical path 校验；写入时校验已有目标或最近的真实父目录，拒绝通过符号链接离开 Session 工作目录。
- Shell 超时和外部取消都终止整个独立进程组，并在清理超时后返回已收集的有限输出。
- 超限输出继续消费管道但只保留上限内内容，返回明确的截断标记。

### 模型 Probe

- Probe 端口接受可选 `AbortSignal` 和 timeout 配置。
- 文本和 Function Calling Probe 共用同一个 deadline，超时返回稳定的 `timeout` 错误。
- HTTP 入口给 Probe 传入请求取消信号和配置的整体超时，避免页面长期停留在思考状态。

### MCP URL

- 保持 HTTP(S) 兼容，但拒绝 localhost、回环、私有地址、链路本地地址、未指定地址和云元数据地址。
- 拒绝 URL 中的 userinfo、query 和 fragment，避免凭据或重定向状态被持久化。
- 该策略只保护远程 MCP；本地 stdio 适配器不经过此 URL 校验。

## 错误与兼容性

- 新错误继续使用现有的 `errorCode/message/traceId` 响应结构。
- 默认回环服务和现有测试调用不需要改动。
- 非回环监听属于显式部署配置，缺少 token 时 fail fast，而不是静默降级。

## 验证

- 新增 server 认证和非回环启动失败测试。
- 新增 local-host 输出上限、文件上限和符号链接逃逸测试。
- 新增 model probe deadline 测试。
- 新增 MCP URL 私网、query、fragment 和 userinfo 拒绝测试。
- 运行受影响 package 的 focused tests、`bun run check` 和完整 package tests。
