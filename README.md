# OpenCode Headless Core

OpenCode Headless Core 是本项目基于 OpenCode 重构出的 UI 无关 Coding Agent 核心。

我们的目标不是再做一套模型配置页面，而是把生产环境真正需要的运行时能力抽离出来：Coding Loop、Function Calling、权限控制、补充信息、上下文压缩、项目上下文、Skill 注册与调用，以及稳定的 Headless API。任何 Web、桌面端、TUI 或企业内部系统，只要接入同一套 API，就可以复用这套核心能力。

当前开发分支：`dev-v0.0.1`

## 当前能力

### 1. UI 无关的 Coding Loop

- 模型、工具、权限、Question、上下文和事件通过端口组合，不依赖具体 UI。
- 支持模型文本输出、工具请求、工具结果、模型续跑和最终完成状态。
- 支持一次模型响应中的多工具调用，并在工具结果后继续下一轮模型请求。
- 支持 Session 创建、状态流转、取消和失败收敛。

### 2. OpenAI-compatible 模型适配

- 支持配置 `baseURL`、模型名、凭据引用和凭据值。
- 支持文本能力与 Function Calling 能力探测。
- 支持 OpenAI-compatible `/chat/completions` 接口。
- 不做隐藏的供应商 fallback，模型错误保持可追踪。
- API、事件、权限请求和页面不会返回凭据原文或 credential-shaped 内容。

### 3. Function Calling 与工具执行

当前 Core 提供受 Session 工作目录约束的基础工具能力：

- 文件读取
- 文件写入与编辑
- Shell 命令
- 工具参数校验和非法参数拒绝
- 工具资源路径归一化与越界阻断
- 工具调用历史续跑

所有有副作用的工具调用都必须先经过权限机制。

### 4. 权限机制

权限是 Coding Loop 的核心边界，而不是页面层的装饰能力：

- `allow_once`：只允许当前请求执行一次
- `allow_always`：在匹配资源和动作范围内自动允许后续请求
- `deny`：拒绝请求并结束当前运行
- 取消运行时自动解决等待中的权限请求
- 权限请求按 Session 隔离
- 工具资源和敏感内容在权限事件中做脱敏处理

因此，任何接入 UI 都可以实现自己的权限队列，但不能绕过 Core 的权限门禁。

### 5. Question 补充信息

当模型无法安全继续时，Core 可以把结构化 Question 暂停请求交给用户：

- Question 挂起期间不会执行后续工具
- 页面或其他 UI 可以提交有序的二维答案数组
- 支持显式取消 Question
- 未回答、回答失败和取消都会形成明确的运行状态

### 6. 上下文压缩与项目上下文

- 在工具历史过长时执行上下文压缩。
- 保留摘要和最近消息，避免无界增长。
- 压缩失败时安全终止，不伪造模型上下文。
- 恢复项目上下文来源并去重。
- 通过事件流暴露压缩状态和项目上下文来源。

### 7. Skill Registry 与 `@skill` 调用

项目级 Skill 已经成为 Core 的一等能力。仓库不内置具体业务 Skill，宿主可以通过配置外部 Skill root 接入自己的能力包：

- 从项目 `skills/` 目录发现目录型 Skill。
- 校验 manifest、`SKILL.md`、文件大小、路径边界和内容摘要。
- 检查重复 ID、内容漂移和非法符号链接。
- Prompt 中输入 `@skill-id` 即可触发 Skill 调用。
- Skill 调用使用独立的 `skill.use` 权限，不默认绕过人工审批。
- 获得批准后，将 Skill 内容以稳定 `sourceID` 注入模型 system message。
- 发布 `skill.activated`、`skill.failed` 等运行时事件。
- 支持 Skill list/detail/register/refresh/validate/activate API。

Skill Invocation Port 与 UI 无关，其他 UI 只需要实现 Headless Client 契约即可复用。

### 8. Headless API、SSE 与控制台

Headless Server 提供独立 HTTP 服务和 SSE 事件流，页面只作为一个客户端：

- Session 创建、列表和恢复
- Prompt 提交与运行取消
- Model 配置与能力探测
- Permission 查询与回答
- Question 查询、回答与取消
- Skill 注册表管理
- 运行时事件订阅

当前 POC 页面包含 Model Runtime、Session Admission、Skill Registry、Permission Queue、Question Queue、Runtime Timeline 和 Context 状态区，用于验证核心链路，也可以被其他 UI 替换。

## 架构

```text
┌──────────────────────────────────────────────┐
│                  任意 UI                      │
│   Web / Desktop / TUI / 企业内部控制台         │
└─────────────────────┬────────────────────────┘
                      │ Headless Client / HTTP / SSE
┌─────────────────────▼────────────────────────┐
│              Headless Server                  │
│  Session · Prompt · Permission · Question     │
│  Model · Skill API · Event Stream             │
└─────────────────────┬────────────────────────┘
                      │ Core Ports
┌─────────────────────▼────────────────────────┐
│              Headless Core                    │
│  Coding Loop · Model · Tools · Permission     │
│  Question · Compaction · Project Context      │
│  Skill Registry · Skill Invocation            │
└──────────────────────────────────────────────┘
```

## 快速启动

要求：Bun、Node.js 兼容环境。

```bash
bun install
```

从仓库根目录启动 Headless Server，默认会扫描仓库根目录下的 `skills/`：

```bash
bun packages/headless-server/src/main.ts
```

另开终端启动页面：

```bash
bun run --cwd packages/headless-ui dev -- --host 127.0.0.1 --port 5173
```

打开 <http://127.0.0.1:5173>。

默认地址：

- Headless API：<http://127.0.0.1:4097>
- 控制台：<http://127.0.0.1:5173>

> 如果从 `packages/headless-server` 目录直接启动，进程工作目录不会指向仓库根目录，项目 Skill 可能无法自动发现。开发时建议使用上面的仓库根目录启动方式，或通过 `skillRoots` 显式配置 Skill root。

## API 能力

所有 Headless API 当前位于 `/api/experimental/headless` 下：

| 能力       | 入口                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| 健康检查   | `GET /health`、`GET /ready`                                                                                    |
| 模型配置   | `GET/PUT /model`                                                                                               |
| 模型探测   | `POST /model/probe`                                                                                            |
| Session    | `GET/POST /session`                                                                                            |
| Prompt     | `POST /session/:sessionID/prompt`                                                                              |
| SSE 事件   | `GET /session/:sessionID/events`                                                                               |
| Permission | `GET/POST /session/:sessionID/permission...`                                                                   |
| Question   | `GET/POST /session/:sessionID/question...`                                                                     |
| Skill      | `GET /skills`、`GET /skills/:id`、`POST /skills/refresh`、`POST /skills/validate`、`POST /skills/:id/activate` |

协议 Schema、OpenAPI 文档和生成客户端位于 `packages/protocol` 与 `packages/client`。

## 测试与验收

运行 Core、Server、Protocol 和生成客户端测试：

```bash
bun test --cwd packages/headless-core
bun test --cwd packages/headless-server
bun test --cwd packages/protocol
bun test --cwd packages/client test/headless-generated.test.ts test/contract-identity.test.ts
```

运行页面检查：

```bash
bun run --cwd packages/headless-ui typecheck:tsc
bun run --cwd packages/headless-ui build
bun run --cwd packages/headless-ui test:smoke
```

当前验收结果：

- Headless Core：50 个测试，160 个断言
- Headless Server：19 个测试，100 个断言
- Protocol：17 个测试，32 个断言
- Client：4 个测试，32 个断言
- UI Smoke：6 个测试全部通过
- Skill Registry、`@skill` 激活、权限门禁和上下文注入由 Headless Core/Server/UI 测试覆盖

## 目录结构

```text
apis/                         外部 API 使用说明
docs/                         设计、POC、计划与审查文档
openspec/                     变更规格与归档记录
packages/                     workspace packages（见 packages/README.md）
patches/                      第三方依赖补丁
skills/                       项目级 Skill 注册目录

packages/headless-core/       UI 无关的 Core 端口与运行时
packages/headless-server/     独立 HTTP/SSE 服务
packages/headless-ui/         内部演示 Agent 工作台（可替换 UI）
packages/protocol/            API Schema 与 OpenAPI 契约
packages/client/              生成的 Promise/Effect 客户端
packages/core/                原 OpenCode 运行时服务
packages/server/              完整 OpenCode Server 装配
packages/schema/              共享领域 Schema
packages/util/                跨包基础工具
packages/cli/                 命令行与分发入口
packages/tui/                 终端控制面
packages/ui/                  共享 Solid UI 组件
packages/theme/               TUI 主题定义
packages/latex/               LaTeX 内容渲染
packages/merman/              Mermaid 内容渲染
packages/simulation/          测试模拟与录制
packages/script/              构建与打包脚本

skills/                       外部 Skill 的默认挂载目录（仓库不内置业务 Skill）
docs/headless-core-poc.md     Headless Core POC 使用与验收
openspec/changes/              设计变更与能力规格
```

各目录的职责、入口和验证方式见对应 `README.md`；包级完整清单见 [`packages/README.md`](packages/README.md)。

## 设计原则

1. Core 不依赖具体 UI，UI 只是可替换的控制面。
2. 所有副作用都经过权限门禁。
3. 用户补充信息必须显式提供，系统不伪造答案。
4. 上下文压缩必须可观测、可恢复、失败安全。
5. Skill 内容必须经过注册、校验和权限审批后才能进入模型上下文。
6. 凭据只在运行时使用，不写入仓库、事件、日志或页面。
7. API 契约优先，生成客户端与服务端保持一致。

## 项目状态

当前项目处于 Headless Core POC 阶段，核心能力和页面链路已经完成第一轮验收。后续可以在不修改 Core 的前提下接入新的 Web、桌面端、TUI 或企业业务页面。
