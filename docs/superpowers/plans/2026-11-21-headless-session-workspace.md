# Headless Session 工作台重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 将 Headless 工作台改造成以 Session 为主对象、模型配置全局共享且 Session 工作目录可跨服务重启保存的 POC。

**Architecture:** Core 负责 Session 元数据、状态与文件型 Store；Server 负责注入持久化 Store并暴露实验性 HTTP API；Protocol/Client 通过生成流程同步契约；Solid UI 以 Session 列表和当前 Session 详情为主视图，模型配置保留为全局抽屉。生产入口使用文件 Store，测试和显式注入仍可使用内存 Store。

**Tech Stack:** Bun、TypeScript、Effect Schema、SolidJS、Playwright smoke tests、生成式 Protocol Client。

---

## 文件结构与职责

- Create: packages/headless-core/src/session-store.ts — 文件型 SessionStore、JSON 版本迁移、原子写入。
- Modify: packages/headless-core/src/index.ts — SessionRecord 元数据、命名、更新时间、名称更新和 Store 导出。
- Modify: packages/headless-core/test/session.test.ts — Session 默认命名、时间戳、更新和排序测试。
- Create: packages/headless-core/test/session-store.test.ts — 文件 Store 重启恢复、旧版本迁移和损坏文件测试。
- Modify: packages/headless-server/src/index.ts — Store 注入、创建响应扩展、Session 名称更新路由。
- Modify: packages/headless-server/src/main.ts — 生产入口连接稳定数据目录下的文件 Store。
- Modify: packages/headless-server/test/server.test.ts — HTTP 创建/列表/更新和重启恢复测试。
- Modify: packages/headless-server/test/protocol-v1.test.ts — 新 Session 字段仍符合 Headless Protocol v1。
- Modify: packages/protocol/src/groups/headless.ts — Session 输入、输出和更新 endpoint Schema。
- Modify: packages/protocol/test/headless.test.ts — 新路由和字段标识验证。
- Regenerate: packages/client/src/promise/generated/*、packages/client/src/effect/generated/*、packages/client/src/effect/api/api.ts。
- Modify: packages/headless-ui/src/main.tsx — Session-first 状态、创建表单、名称编辑、全局模型入口和恢复逻辑。
- Modify: packages/headless-ui/src/styles.css — Session 列表、创建面板、当前 Session 元信息和响应式布局。
- Modify: packages/headless-ui/test/permission.smoke.spec.ts — 两个 Session 独立名称/目录、切换和刷新恢复 smoke 测试。
- Modify: packages/headless-server/README.md — 说明生产入口的 Session 文件位置和环境变量。

## 约束与基线

- 测试从对应 package 目录运行，禁止从仓库根目录运行 bun test。
- 公共 Protocol/Server HttpApi 改动后必须从 packages/client 执行 bun run generate，禁止手工编辑生成文件。
- bun run check 的基线因 oxlint 引用不存在的 script/oxlint/anti-slop/effect/index.ts 失败；实现完成后重跑并记录结果，同时执行受影响包的 typecheck、test 和 UI build/smoke。
- Session 文件只保存元数据，不保存 Credential 明文、Prompt、模型响应或完整事件流。

## Task 1: Core Session 元数据与文件持久化

Files:
- Create packages/headless-core/src/session-store.ts
- Modify packages/headless-core/src/index.ts
- Modify packages/headless-core/test/session.test.ts
- Create packages/headless-core/test/session-store.test.ts

- [ ] Step 1: 写失败测试，锁定 Session 元数据与默认名称。

在 packages/headless-core/test/session.test.ts 增加：

    test("creates a named session with durable timestamps", async () => {
      const directory = await makeDirectory()
      const service = createHeadlessSessionService()
      const session = await service.create({ directory })
      expect(session.name).toBe(directory.split("/").at(-1))
      expect(session.createdAt).toBeString()
      expect(session.updatedAt).toBe(session.createdAt)
    })

    test("updates a session name without changing its directory or id", async () => {
      const directory = await makeDirectory()
      const service = createHeadlessSessionService()
      const session = await service.create({ directory, name: "旧名称" })
      const updated = await service.update(session.sessionID, { name: "新名称" })
      expect(updated).toMatchObject({ sessionID: session.sessionID, directory, name: "新名称" })
      expect(updated.updatedAt).not.toBe(session.updatedAt)
    })

- [ ] Step 2: 运行 Core Session 测试确认失败。

    bun test test/session.test.ts

预期失败，提示 name、createdAt 或 update 不存在。

- [ ] Step 3: 在 Core 中加入元数据和名称更新能力。

SessionRecord 改为包含 sessionID、name、directory、status、createdAt、updatedAt。新增 HeadlessSessionUpdateInput { name: string }。HeadlessSessionService 新增 update(sessionID, input)。create 对目录执行现有规范化和校验；名称去除首尾空格，空名称从 basename(directory) 生成；名称仍为空时抛出 invalid_name。创建时用同一个 ISO 时间填充 createdAt 和 updatedAt。update 只允许非空名称，保留 ID、目录和状态并更新 updatedAt。setStatus 也更新 updatedAt。

- [ ] Step 4: 写文件 Store 失败测试。

在 packages/headless-core/test/session-store.test.ts 增加以下覆盖：

    test("restores sessions after a new file store is created", async () => {
      const root = await mkdtemp(join(tmpdir(), "headless-session-store-"))
      temporaryDirectories.push(root)
      const filePath = join(root, "sessions.json")
      const first = createFileSessionStore({ filePath })
      const record = {
        sessionID: "session_001",
        name: "project",
        directory: "/workspace/project",
        status: "idle" as const,
        createdAt: "2026-11-21T00:00:00.000Z",
        updatedAt: "2026-11-21T00:00:00.000Z",
      }
      await first.save(record)
      const second = createFileSessionStore({ filePath })
      await expect(second.get(record.sessionID)).resolves.toEqual(record)
    })

    test("migrates legacy records without names or timestamps", async () => {
      const root = await mkdtemp(join(tmpdir(), "headless-session-store-"))
      temporaryDirectories.push(root)
      const filePath = join(root, "sessions.json")
      await Bun.write(filePath, JSON.stringify({
        version: 0,
        sessions: [{ sessionID: "legacy", directory: "/tmp/demo", status: "running" }],
      }))
      const session = await createFileSessionStore({ filePath }).get("legacy")
      expect(session).toMatchObject({
        sessionID: "legacy",
        name: "demo",
        directory: "/tmp/demo",
        status: "idle",
      })
      expect(session?.createdAt).toBeString()
      expect(session?.updatedAt).toBeString()
    })

    test("rejects corrupt session files without replacing them", async () => {
      const root = await mkdtemp(join(tmpdir(), "headless-session-store-"))
      temporaryDirectories.push(root)
      const filePath = join(root, "sessions.json")
      await Bun.write(filePath, "not-json")
      await expect(createFileSessionStore({ filePath }).list()).rejects.toThrow()
      expect(await Bun.file(filePath).text()).toBe("not-json")
    })

- [ ] Step 5: 运行文件 Store 测试确认失败。

    bun test test/session-store.test.ts

预期失败，提示 createFileSessionStore 尚未导出。

- [ ] Step 6: 实现文件 Store 并导出。

在 packages/headless-core/src/session-store.ts 实现 createFileSessionStore({ filePath }): SessionStore。第一次 list/get/save 读取 JSON；文件不存在时使用空列表；读取边界统一迁移旧记录，缺少 name 时从目录名推导、缺少时间字段时填充当前 ISO 时间、running 转为 idle；列表按 updatedAt 倒序并以 sessionID 作为同时间稳定键；保存时创建父目录，写入同目录随机临时文件，再用 rename 原子替换正式文件。JSON 解析或记录校验失败直接抛错，不覆盖原文件。导出 FileSessionStoreOptions。

在 index.ts 导出 createFileSessionStore 和 FileSessionStoreOptions，并让内存 Store 使用相同排序规则。

- [ ] Step 7: 运行 Core 测试和类型检查。

    bun test test/session.test.ts test/session-store.test.ts
    bun run typecheck:tsc

预期新增测试通过；其他 Core fixture 统一补齐元数据，不删除已有状态行为测试。

- [ ] Step 8: 提交 Core 任务。

    git add packages/headless-core/src/index.ts packages/headless-core/src/session-store.ts packages/headless-core/test/session.test.ts packages/headless-core/test/session-store.test.ts
    git commit -m "✨ feat(headless-core): 持久化 Session 元数据"

## Task 2: Protocol、Server 和生成 Client 契约

Files:
- Modify packages/protocol/src/groups/headless.ts
- Modify packages/protocol/test/headless.test.ts
- Modify packages/headless-server/src/index.ts
- Modify packages/headless-server/src/main.ts
- Modify packages/headless-server/test/server.test.ts
- Modify packages/headless-server/test/protocol-v1.test.ts
- Modify packages/headless-server/README.md
- Regenerate packages/client/src/promise/generated/*、packages/client/src/effect/generated/*、packages/client/src/effect/api/api.ts

- [ ] Step 1: 写 Server 失败测试，覆盖名称、更新和重启恢复。

增加创建请求 name 的断言；创建两个不同目录的 Session，确认返回名称和目录互不覆盖；对第一个 ID 发 PUT /api/experimental/headless/session/:sessionID 更新名称，确认 ID 和目录不变。用临时 filePath 创建第一个 server、停止后创建第二个 server，确认列表仍包含原记录。默认 startHeadlessServer 测试继续显式注入 createInMemorySessionStore，避免测试互相污染。

- [ ] Step 2: 运行 Server/Protocol 测试确认失败。

    bun test test/server.test.ts test/protocol-v1.test.ts
    bun test --cwd ../protocol test/headless.test.ts

预期新字段、PUT 路由和文件 Store 注入测试失败。

- [ ] Step 3: 扩展 Headless Protocol Schema。

在 packages/protocol/src/groups/headless.ts 将 HeadlessSession 增加 name、createdAt、updatedAt；将 HeadlessSessionCreatePayload 增加 optional name；新增 HeadlessSessionUpdatePayload { name: string }。在 Session group 添加 PUT /api/experimental/headless/session/:sessionID，identifier 为 experimental.headless.session.update，成功响应复用 HeadlessSession，错误使用 SessionNotFoundError 和 InvalidRequestError。OpenAPI 描述说明 name 只修改展示名称，directory 在创建时绑定。

- [ ] Step 4: 连接 Server Store 和 API。

HeadlessServerOptions 增加 sessionStore?: SessionStore。当没有 sessionService 时使用 createHeadlessSessionService({ store: options.sessionStore })，显式传入 sessionService 时不替换它。创建处理函数把 optional name 传给 Core，并返回完整 id/name/directory/status/createdAt/updatedAt。增加 update 路由，invalid_name 返回 400，session_not_found 返回 404。

main.ts 使用环境变量 OPENCODE_HEADLESS_SESSION_FILE；未设置时使用 OPENCODE_HEADLESS_DATA_DIR 或 process.cwd()/.headless 下的 sessions.json。启动前 await createFileSessionStore({ filePath })，再调用 startHeadlessServer({ sessionStore })。这样测试 API 可用内存 Store，实际服务跨重启保留 Session。

- [ ] Step 5: 重新生成 Client。

    bun run --cwd packages/client generate

确认生成客户端出现 name、createdAt、updatedAt 和 session.update；禁止手工编辑 generated 文件。

- [ ] Step 6: 执行契约和 Server 验证。

    bun test --cwd ../protocol test/headless.test.ts
    bun run typecheck:tsc
    bun test test/server.test.ts test/protocol-v1.test.ts
    bun run --cwd ../../client check:generated

预期 Server 返回新 Session 元数据，重启恢复通过，生成文件检查无额外差异。

- [ ] Step 7: 更新部署说明并提交契约任务。

在 packages/headless-server/README.md 说明生产服务需设置 OPENCODE_HEADLESS_DATA_DIR 或 OPENCODE_HEADLESS_SESSION_FILE，且该目录在 release 切换时位于共享持久化目录。

    git add packages/protocol packages/headless-server packages/client
    git commit -m "✨ feat(headless): 暴露可恢复的 Session 元数据"

## Task 3: Solid UI 改成 Session-first 工作台

Files:
- Modify packages/headless-ui/src/main.tsx
- Modify packages/headless-ui/src/styles.css
- Modify packages/headless-ui/test/permission.smoke.spec.ts

- [ ] Step 1: 写 UI smoke 失败测试。

增加一个流程：打开“新建 Session”，填写“Session 名称”和“工作目录”，点击“保存并创建 Session”；再创建第二个不同目录的 Session，确认列表显示两个名称，点击第一个后当前目录恢复为第一个目录。保留既有模型、权限、Question、Skill 和取消运行测试。

- [ ] Step 2: 运行 UI 测试确认新选择器失败。

    bun test --cwd packages/headless-ui test/permission.smoke.spec.ts --timeout 30000

预期因 UI 尚无“新建 Session”表单和名称字段失败。

- [ ] Step 3: 调整 UI 状态模型和恢复逻辑。

在 main.tsx 新增 sessionName、sessionDrawerOpen、sessionNameError。selectSession、applyCreatedSession 和 restoreSession 都以服务端 Session 摘要为唯一来源，同时设置 name、directory、status；sessionStorage 只保存当前选中的 ID，不保存目录。列表加载失败时保留已有列表并提示错误；没有旧 ID 时选择列表第一条或保持空状态。

createSession 提交 { name: sessionName().trim() || undefined, directory: directory().trim() }，成功后关闭创建面板、插入列表并选择返回项。服务端生成默认名称时，UI 不覆盖它。增加 renameSession，调用 client.experimental.headless.session.update，更新列表项和当前摘要；空名称只显示字段错误，不发请求。

- [ ] Step 4: 重排 UI 信息架构。

将当前“项目上下文”卡片拆成 Session 列表和“新建 Session”表单。列表每项显示 name、目录末段或压缩路径、status，当前项使用 aria-pressed。模型配置保持独立 Drawer，不嵌入 Session 创建表单。主区域显示当前 Session 名称、完整目录、ID 短摘要、状态和编辑名称入口。空状态按“创建/选择 Session → 配置全局模型 → 输入 Prompt”提示。顶部模型 chip 明确显示“全局模型”。

- [ ] Step 5: 更新样式并覆盖窄屏。

在 styles.css 增加 Session 列表项名称、目录、创建表单和当前 Session 目录的样式。路径超长使用省略号并保留 title 完整值；窄屏按列表、当前详情、Prompt 顺序堆叠，Prompt 输入不可被遮挡。

- [ ] Step 6: 运行 UI 验证。

    bun run --cwd packages/headless-ui typecheck:tsc
    bun run --cwd packages/headless-ui build
    bun test --cwd packages/headless-ui test/permission.smoke.spec.ts --timeout 30000

预期名称、目录隔离、切换、模型全局入口和既有运行流程均通过。

- [ ] Step 7: 提交 UI 任务。

    git add packages/headless-ui/src/main.tsx packages/headless-ui/src/styles.css packages/headless-ui/test/permission.smoke.spec.ts
    git commit -m "✨ feat(headless-ui): 以 Session 为主对象重排工作台"

## Task 4: 集成审查、完整验证和交付

- [ ] Step 1: 对照规格逐项取证。

    rg -n "sessionName|session.update|createFileSessionStore|OPENCODE_HEADLESS" packages/headless-core packages/headless-server packages/headless-ui packages/protocol packages/client

确认 UI 不再把 sessionStorage 当作目录持久化来源，生产入口确实注入文件 Store，Protocol 和 Client 都包含名称与时间字段。

- [ ] Step 2: 执行受影响包验证。

    bun test --cwd packages/headless-core
    bun run --cwd packages/headless-core typecheck:tsc
    bun test --cwd packages/headless-server
    bun run --cwd packages/headless-server typecheck:tsc
    bun test --cwd packages/protocol
    bun run --cwd packages/protocol typecheck:tsc
    bun run --cwd packages/client check:generated
    bun run --cwd packages/headless-ui typecheck:tsc
    bun run --cwd packages/headless-ui build
    bun test --cwd packages/headless-ui test/permission.smoke.spec.ts --timeout 30000

- [ ] Step 3: 重跑根检查并记录基线问题。

    bun run check

若仍因同一个 oxlint 配置路径失败，记录该失败以及所有受影响包的通过证据；若出现本任务新增的 lint/type 错误，修复后再继续。

- [ ] Step 4: 完成代码审查和集成。

    git diff dev-v0.0.1...HEAD --stat
    git status --short --branch
    git log --oneline --decorate -8

确认任务工作树干净、.source_branch 为 SOURCE_BRANCH=dev-v0.0.1，再按 finishing workflow 合并到 dev-v0.0.1 并删除任务分支/worktree。
