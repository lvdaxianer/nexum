# Nexum 文档体系设计

## 1. 背景与目标

Nexum 当前已经具备 Protocol、HTTP/SSE Server、Client、Runtime、Persistence、Integrations 和多个 UI Surface，但相关说明分散在 package README、`apis/nexum.md`、OpenSpec 和历史设计记录中。前后端协作时，调用方难以判断某个行为属于 UI 本地交互、Runtime 协议还是服务端实现。

本变更建立一套以根目录 `README.md` 为总入口、以能力为协作入口、以模块为实现边界的文档体系，覆盖当前仓库已经实现的协议和模块，不新增运行时行为。

目标读者包括：

- 前端和 UI 开发者：了解交互协议、状态流转和组件接入方式；
- 后端和 Protocol 开发者：了解模块边界、HTTP/SSE 契约和事件语义；
- 集成方和联调人员：只依靠 API 文档即可构造请求、处理响应和定位错误；
- 维护者：知道修改源码后必须同步哪些文档和验证命令。

## 2. 设计原则

### 2.1 根 README 是唯一总入口

仓库根目录的 `README.md` 增加“文档导航”章节，直接链接到架构、UI、能力、API 和每个模块文档。`docs/README.md`、`apis/README.md` 和 `packages/README.md` 保留各自目录的维护说明，并回链根 README，不建立互相独立的文档入口。

根 README 只负责项目总览、架构摘要、快速开始和导航，不复制完整 Protocol 类型、Endpoint 契约或组件实现细节。

### 2.2 能力文档与模块文档分层

能力文档解释“前后端如何协作、用户能观察到什么、协议如何使用”；模块文档解释“哪个 package 实现、消费或桥接这项能力”。能力文档通过实现映射链接到模块文档，模块文档通过能力链接回协作语义。

文档分为三层：

```text
README.md
  ├── docs/architecture/       架构与运行时边界
  ├── docs/ui/                 UI 交互协议与状态
  ├── docs/capabilities/       跨前后端能力语义
  ├── docs/modules/            package 实现边界
  └── apis/                    业务模块 REST/SSE 契约
```

### 2.3 源码和 Protocol 是事实来源

Protocol 类型和事件以 `packages/nexum-protocol` 为权威，路由和响应行为以 `packages/nexum-server`、对应测试和应用层实现为依据，组件行为以 `packages/nexum-chat-surface` 和 `packages/nexum-surfaces` 为依据。文档不手工复制完整 TypeScript 类型，也不使用 REST 惯例猜测未被实现确认的状态码、认证、Cookie 或字段。

每份专题文档标记当前状态：`现状基线`、`实验性` 或 `规划中`，并记录权威源码路径和最后核对日期。

## 3. UI 交互协议

UI 交互分为 Runtime 驱动交互和 UI 本地交互两类。

### 3.1 Runtime 驱动交互

Runtime 产生事实，Protocol 通过 JSON/SSE 表达事实，Surface 负责展示和提交用户操作。第一阶段覆盖：

- `Question`：反问、单选、多选和结构化答案；
- `Permission`：动作、资源、原因和审批结果；
- 流式状态：思考、推理、文本、工具调用、工具结果；
- 运行控制：继续、取消、完成、失败和恢复。

统一生命周期如下：

```text
请求产生
  → SSE 通知或 Session state 发现
  → UI 展示 pending
  → 用户 reply / cancel
  → Client 调用协议端点
  → Runtime 继续或结束
  → SSE 广播 result / cancelled / settled
```

UI 必须支持通过状态接口恢复 pending 交互，不能只依赖 SSE。服务重启后由持久化 Store 将遗留请求标记为 `orphaned`；UI 可以展示不可继续状态，但不能伪造可恢复操作。

Question 的答案按问题顺序提交二维数组；单选最多一个值，多选可以提交多个值；选项值必须使用服务端返回的 `label`。Permission 的资源和原因仅用于展示，最终决策由 Runtime 处理。

### 3.2 UI 本地交互

删除 Session、取消注册 Skill、抽屉开关、列表选中、表单校验、焦点、键盘和确认框属于 Surface 本地交互，不进入 Runtime Protocol。危险操作统一使用：

```text
idle → open → submitting → success
                         ↘ error
```

`submitting` 期间禁止重复提交，并根据操作要求阻止 ESC、遮罩和返回关闭；成功后刷新对应资源，失败后保留上下文并展示可理解的错误。

## 4. API 文档

`apis/` 按业务模块维护文档，不按单个 Endpoint 拆文件。当前 Nexum Runtime 的外部路由继续归入 `apis/nexum.md`，但该文件必须覆盖 Server 暴露的全部路由，并按能力分组编写独立端点章节。

每个 API 模块文档包含：

- 模块职责、调用方、基础 URL、协议版本和路由覆盖表；
- Method、完整 URL、路径参数、查询参数、请求体、Request Header、Request Cookie 和认证说明；
- 每个实际支持的成功和失败 HTTP 响应，包括响应 Header、Cookie、完整示例和字段表；
- 错误码、前置条件、幂等性、取消、重试、分页、时间和安全约束；
- 与 Protocol 类型、Server 实现、Client 方法、能力文档的链接；
- 至少一个与字段表一致的可运行 `curl` 示例。

当前 API 文档需要覆盖 capabilities、model、role prompt、session、messages、prompt、continue、cancel、events、permission、question、skills 和 health 相关路由。无法从源码和测试确认的内容必须明确写为“待确认”，不得用默认值替代。

## 5. 模块文档

为当前 `packages/nexum-*` 建立一份一一对应的模块文档：

```text
docs/modules/
├── nexum-protocol.md
├── nexum-server.md
├── nexum-client.md
├── nexum-chat-surface.md
├── nexum-surfaces.md
├── nexum-core.md
├── nexum-application.md
├── nexum-persistence.md
├── nexum-integrations.md
└── nexum-test.md
```

每份模块文档包含：职责、不负责的事情、公共入口、依赖方向、实现的能力、关键生命周期、错误和边界行为、测试命令、关联文档和修改同步清单。

模块文档必须保持现有依赖边界：Core 不依赖 UI、HTTP、文件系统或模型 SDK；Client 不依赖 Core 或 Server；Server 负责 HTTP/SSE 绑定；Surface 消费 Client；Test 才组合各层进行跨层验证。

## 6. 文件布局与交付阶段

### 阶段一：文档基线与核心契约

建立根 README 导航、架构文档、UI 交互文档、Session/Events 能力文档，并补齐 `apis/nexum.md` 的全路由覆盖。

### 阶段二：模块实现说明

为每个当前 package 建立模块文档，补充职责、依赖、公开入口、测试和变更联动。

### 阶段三：专题能力补齐

根据前两阶段核对结果补充 Skills、Integrations、Model Runtime、Context/History 等专题文档，以及必要的状态图和时序图。

每阶段都可以独立阅读和验证；后续阶段不能改变前一阶段已经确认的 Protocol 或 API 语义。

## 7. 同步规则

文档同步链路为：

```text
Protocol / Server / Surface 源码
        ↓
能力文档
        ↓
API 文档与模块文档
        ↓
README 导航和交付检查
```

发生以下变化时必须同步对应文档：

- Protocol 类型、事件或错误码变化；
- HTTP/SSE 路由、请求、响应或状态码变化；
- UI 交互状态、提交、取消、恢复或可访问性行为变化；
- 模块公开导出、依赖方向或生命周期变化；
- 持久化、重试、并发、取消或服务重启语义变化。

如果实现与文档不一致，必须先确定源码、测试或文档哪一方代表正确契约，再一并修正，不能只修改说明文字掩盖差异。

## 8. 验收标准

- 根 `README.md` 可以直接链接到所有架构、UI、能力、API 和模块文档；
- `packages/` 下每个 `nexum-*` 包都有对应模块文档；
- `nexum-server` 的每个对外路由都出现在 API 覆盖表并有完整端点章节；
- 每个 UI 交互都有触发条件、状态变化、提交、取消和异常处理说明；
- 文档之间存在双向交叉链接，且不复制完整 TypeScript 类型；
- 示例、路径、命令和字段以当前源码为准；
- 文档修改通过 `git diff --check` 和 Markdown Prettier 检查；
- 每个阶段完成前，执行对应的包级测试或类型检查，并记录验证证据。

## 9. 非目标

本变更不新增 API、不修改 Protocol 类型、不修改 UI 行为、不生成 OpenAPI 文件、不手工修改生成的 Client 文件，也不引入 Changesets。未来协议或行为变更仍需走现有 OpenSpec 和源码变更流程。
