# Design

## Context

See `proposal.md` for the motivation and change scope.

当前仓库已经存在根 `README.md`、`docs/README.md`、`apis/README.md`、`apis/nexum.md`、package README、OpenSpec specs 和历史设计文档。源码边界已经分成 Core、Persistence、Integrations、Application、Protocol、Client、Server、Surface 和 Test，但文档没有用一致的入口和模板把这些边界连接起来。

本变更是纯 Markdown 文档变更，不修改运行时、Protocol、HTTP 路由、生成文件或依赖。文档内容必须以当前源码、测试和已有规范为证据；无法确认的 API 行为不能按惯例猜测。

## Goals / Non-Goals

**Goals:**

- 让根 `README.md` 成为全部文档的可导航入口。
- 用能力文档描述前后端共同遵守的交互和生命周期，用模块文档描述 package 实现边界。
- 用统一模板补齐 UI 交互、Runtime API、SSE 事件和模块接入说明。
- 让每个当前 `packages/nexum-*` 包都有对应模块文档，并能回链到能力和 API 文档。
- 建立文档变更后的 Markdown 格式、链接、路由覆盖和源码核对检查。

**Non-Goals:**

- 不创建或修改新的 Protocol capability requirement，因此 OpenSpec 使用 `skip_specs: true`。
- 不通过文档引入新的 HTTP/SSE 路由、错误码、状态或 UI 行为。
- 不生成 OpenAPI，不手工修改生成 Client 文件，不引入新依赖或 Changesets。
- 不把历史设计文档改写成当前契约；历史文档继续保留历史上下文，并通过新文档链接到当前说明。

## Decisions

### 1. 使用根 README 作为总入口

根 README 增加“文档导航”，链接到 `docs/architecture/`、`docs/ui/`、`docs/capabilities/`、`docs/modules/` 和 `apis/`。`docs/README.md` 只维护文档目录职责、权威来源和验证命令；`apis/README.md` 只维护 API 文档规则；`packages/README.md` 只维护包地图和包级验证，并且三个入口都回链根 README。

选择根 README 而不是新建独立 docs portal，是因为项目已有使用者入口和包地图，新增入口会造成导航分叉。替代方案是只更新 `docs/README.md`，但无法满足用户从项目首页发现文档的要求。

### 2. 以能力为协作入口、以 package 为实现边界

能力文档按 `ui/` 和 `capabilities/` 分组，说明触发条件、状态、事件、请求、响应和 UI 行为；模块文档按 `packages/nexum-*` 一一建立，说明职责、公开导出、依赖、测试和同步清单。每份文档通过相对链接连接能力、API、源码和测试。

选择双层结构而不是只按 package 或只按能力，是为了同时服务前端协作和实现维护。只按 package 会把 Question、Permission 等跨层行为拆散；只按能力又无法说明哪个模块真正拥有实现边界。

### 3. 将 Runtime 交互和 UI 本地交互分开

`docs/ui/interaction-protocol.md` 定义共同术语，并把 Question、Permission、流式事件、取消和恢复归为 Runtime 驱动交互；删除确认框、抽屉、列表选中、表单校验、焦点和键盘归为 Surface 本地交互。前者必须引用 Protocol、Server、Client 和 Application 证据，后者必须引用 Surface 实现和 UI 测试证据。

选择分开记录，是为了避免把本地确认框误认为 Runtime 协议，也避免 UI 通过文本猜测权限或 Question 状态。替代方案是建立一个统一的 UI 组件协议，但会把不同生命周期和持久化语义混在一起。

### 4. API 仍按业务模块维护单文件

当前 Nexum Runtime 的对外路由继续维护在 `apis/nexum.md` 一个业务模块文件中，文件内按 capabilities、model/config、session、interaction、skills 和 events 分组，每个端点有独立章节和完整请求/响应/错误/示例说明。不会为单个接口创建独立 Markdown 文件，也不会把完整 TypeScript 类型复制到 API 文档。

选择单一业务模块文档符合 `rest-api-documentation` 规则，也能让调用方在一个文件内看到完整的 Runtime API。替代方案是按路由拆成多个文件，但会让通用 Envelope、事件和错误语义重复且容易漂移。

### 5. 以源码证据驱动 API 完整性

实现 API 文档时先建立 `Server route → 业务模块 → 文档章节` 覆盖表，再依据 Server 路由、协议类型、应用服务、测试和 README 逐端点核对。每个端点固定记录 Method/URL、params、requestBody、headers、cookies、响应 headers/cookies、状态码、错误码、调用方处理和可运行 curl 示例；不适用项明确写“不适用”。

选择证据矩阵而不是从现有 API 文档复制，是因为现有文档的资源总表比端点章节更完整，复制会遗漏未被记录的路由。该方法也能发现当前实现中尚未确认的认证或 Cookie 行为，并按要求明确标注。

### 6. 按阶段提交但保持一个文档变更

第一阶段先完成入口、架构、UI 核心交互、Session/Events 能力和完整 API；第二阶段完成所有 package 模块文档；第三阶段补齐 Skills、Integrations、Model Runtime、Context/History 和必要图示。每个阶段在同一 OpenSpec change 下使用独立任务和独立提交，任务完成后合并回 `dev-v0.0.1`。

选择阶段化交付，是因为 API 全覆盖和十个模块文档需要不同的源码核对范围。替代方案是一次提交所有 Markdown，但难以逐任务审核和定位文档漂移。

## Risks / Trade-offs

- [文档与实现漂移] → 每个能力和模块文档记录权威源码/测试路径；API 交付前执行路由覆盖检查和逐端点核对。
- [根 README 链接失效] → 统一使用仓库相对路径，交付前用链接扫描或逐项 `test -e` 验证目标文件。
- [API 文档重复 Protocol 类型] → 文档只写调用语义和字段表，完整类型链接回 `packages/nexum-protocol`。
- [历史文档与当前文档冲突] → 历史设计保留原样，新文档标注现状基线并链接当前源码；不把历史说明当作当前契约。
- [阶段性提交导致导航暂时缺少目标] → 每个阶段先创建并完成其声明的目标文件，再更新根 README；根 README 的链接检查作为阶段验收项。
- [现有实现存在待确认行为] → 在 API 文档中明确写“待确认”并记录证据缺口，不以 REST 惯例补全事实。

## Migration Plan

1. 在任务工作树中创建 OpenSpec 变更资产和文档设计/实施计划。
2. 先创建文档目录与根 README 导航，再按阶段填写能力、API 和模块文档。
3. 每个阶段运行 `git diff --check`、Markdown Prettier、链接/覆盖检查和相关包级验证。
4. 每个独立任务通过审查和验证后提交，并合并到 `dev-v0.0.1`；下一任务从更新后的集成分支创建。
5. 全部任务完成后执行根 README 链接覆盖、`apis/nexum.md` 路由覆盖、模块清单覆盖和最终文档格式检查。
6. 文档变更不涉及运行时迁移或回滚；若某篇文档核对失败，回滚该文档提交即可，不影响 Protocol、Server 或 Client。
