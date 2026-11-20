# Coding Gate

这是指标视图 Python 的强制门禁，不是建议清单。规则以
`/Users/lvdaxianer/.claude/skills/code-review-spec/spec.md` 为来源，适用于生成的
`function.code`。代码在 Gate 失败时不得进入远程 `test`、`save` 或发布流程。

## 1. 自动阻断项

`validate_metric_view_python.py` 必须检查以下项目；命令返回 `ok: true` 且错误数组为空才算通过。

| 规范 | Python 指标视图的强制结果 |
| --- | --- |
| 语法与执行协议 | AST 可解析；存在 `main()`；读取 `sys.argv[1:4]`；stdout 只输出 `{"answer": [...]}`；HTTP 调用有 timeout |
| 作者与文档 | 模块、类、函数使用多行文档字符串；新增对象包含 `Author` 和 `Date: YYYY-MM-DD`；函数文档包含参数/返回说明 |
| 分支注释 | 每个 `if`/`elif`/`else` 关键字前有说明该条件或替代路径的中文注释；注释必须位于关键字上一行或其上方连续空行之后，不接受只写在 `else` 体首条语句前的注释 |
| 注释比例 | 注释和文档行占非空源码行至少 40%，目标约 60% |
| 规模与复杂度 | 单文件和类按物理源码总行数不超过 350 行；函数可执行代码不超过 20 行；圈复杂度不超过 10 |
| 命名 | 函数/变量使用 snake_case；常量使用 UPPER_SNAKE_CASE；布尔变量使用 `is_`/`has_`/`can_`/`should_` 前缀 |
| 参数 | 直接参数不超过 3 个；4–5 个必须封装配置对象；6 个及以上必须拆分/重构 |
| 常量 | 禁止未命名魔法数字和魔法字符串；协议结构性下标、`0/1/-1` 和 Python 动态集合例外必须有规则说明 |
| 清理 | 禁止未使用 import、局部变量和成员字段；禁止无理由重复代码 |
| 安全 | 禁止固定 loopback/端口/Token/密码/JDBC/SQL；敏感值只能来自登记变量或受控运行时上下文；输入必须校验 |
| DSL/数据库 | 只提交结构化只读 DSL；不得拼接或执行 SQL/DDL，不得导入数据库驱动或直连数据库；查询必须有 `limit`；参数必须绑定，不得把用户输入拼进查询字符串 |
| 远程调用 | 禁止循环内 HTTP/DSL/数据库调用；第三方调用使用业务标识日志，DEBUG 记录开始/结束，WARN 记录失败；不得记录 Token、密码、请求体原文 |
| 超时与资源 | 使用 `time.monotonic()` 整体 deadline；HTTP timeout 使用命名常量；响应和返回结果有上限 |
| 异常 | 捕获具体异常；禁止静默吞错；新异常保留 `from exc` 异常链；`Exception` 只允许入口最外层稳定兜底 |
| 输出 | 禁止普通 `print` 日志；唯一允许的直接输出是协议 `print(json.dumps(...))`，日志必须走 logging |
| 字符串拼接 | 循环内禁止使用 `+` 拼接字符串；使用 `join`、格式化或结构化构造 |

## 2. 生成脚本的明确例外

分支注释示例：

```python
# 条件注释：命中目标状态
if status == STATUS_READY:
    return value
# 条件注释：未命中目标状态
else:
    return fallback
```

文件长度包含注释、文档字符串、空行和代码在内的物理源码行数；源码超过 350 行即阻断，不能依赖 AST 模块节点的结束行号。

- `print(json.dumps({"answer": ...}))` 是执行引擎协议输出，不是日志；除此之外的 `print` 一律阻断。
- Python 列表是动态集合，`collection-capacity.md` 的 Java 初始容量要求对本脚本标记为“不适用”；但仍禁止无界读取，必须使用 DSL `limit`、结果截断和整体 deadline。
- `sys.argv[1:4]` 的数字是运行协议下标，`0/1/-1` 是 Python/状态标志常量；业务数字和字符串仍必须命名。
- 本脚本是 DSL 客户端，不是后端 REST 端点；REST 资源命名、Controller 入口审计和服务端分页规则标记为“不适用”，客户端调用的路径、timeout、日志和错误边界仍是强制项。

## 3. 仅适用其他语言/组件的规范

以下项目必须在结果中明确标记为“不适用”，不能被误报为 Python 已通过：

- Java 线程池、自定义线程池、线程池隔离、`ExecutorService` 和 `@Async`。
- Java `equals/hashCode` 配对。
- Vue/TypeScript 页面交互、组件状态和前端防重复提交；页面改动另行执行 `frontend-interaction-guidelines`。
- OAuth2/JWT 登录入口、Controller/Handler 统一审计日志；本脚本只执行已认证的可信 Token 调用。

## 4. 回填顺序

1. 读取定义并合并更新对象。
2. 对合并后的 `function.code` 执行本文件全部规则。
3. Gate 失败：返回逐项错误，零个远程 `test`/`save` 请求。
4. Gate 通过：才允许执行 `test → 用户确认 → save → queryById`。
5. 每一轮测试记录模式、路由、响应摘要、修复依据和残余风险；不记录凭据。

## 5. 类型兼容门禁

回填 helper 在 Python 静态门禁通过后，必须继续调用类型兼容校验器。校验器依据
[类型映射](type-mapping.md) 检查 `typeContext.fields` 的 DDL/JDBC 类型、DSL
条件的 `logicalType` 和 `function.parameters` 的 `TYPE_*`。当定义声明了参数却缺少
类型证据，或三层类型不一致时，必须在远程 `test` 前失败；错误必须包含字段、参数、
期望类型和实际类型。没有参数且代码不声明 DSL `logicalType` 的静态定义可以不声明
类型上下文，但一旦生成参数或字段条件就不得省略。

校验命令：

```bash
python3 scripts/validate_metric_view_python.py \
  generated.py \
  --variables references/runtime-variables.yaml
```

回填 helper 必须复用同一校验器，禁止只在人工审查或页面点击时检查。真实数据库测试只有在用户明确提供只读凭据和范围时启用；不得通过写库或种子 SQL 造数；否则使用合成服务，并明确标注“未验证真实数据”。成功空结果只允许在最终 `answer` 边界使用契约兼容 Mock。
