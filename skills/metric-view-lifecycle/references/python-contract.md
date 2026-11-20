# Python 运行协议

生成脚本必须兼容当前 MetricView Python 执行器：

```text
sys.argv[1] = userId
sys.argv[2] = domainId
sys.argv[3] = parameterFilePath
```

硬性约束：

- 从 `parameterFilePath` 读取 JSON 参数；禁止把业务参数写死在源码中。
- 请求地址必须由 `REQUEST_BASE_URL = "__request_path"` 注入；默认值由运行器解析为 `http://10.100.31.37:3000/api/data-query`，身份必须由 `REQUEST_TOKEN = "__request_token"` 占位符注入。页面内测试由当前登录会话填充，不要求用户在页面输入 Token；页面外调用才由受范围约束的 `X-Trusted-Token` 建立上下文。`REQUEST_DOMAIN_ID = "__request_domain_id"` 只在执行器要求兼容 argv[2] 时注入，不能作为授权来源。
- 生成代码可以保留协议要求的 `X-Trusted-Token` 占位头，但不得写入真实值；页面运行时会移除该占位头并使用当前会话 Token 访问本地 DSL，外部调用由服务端按每条 Token 的 domain/path 范围校验。请求必须设置连接/读取超时，遇到非 2xx、业务 `error` 或缺少 `data` 时抛出受控异常。
- 结构化 DSL 作为 JSON body 传递；禁止拼接 SQL、执行 SQL 字符串、从参数中接收连接账号密码。
- 运行器会扫描双下划线标识作为运行时变量；除 `__name__`、`__main__` 和 `__file__` 外，生成代码不得使用 `__class__` 等双下划线属性。异常类型日志使用 `type(exc).__name__`，避免被误判为未解析的运行时变量。
- stdout 只能打印一次合法 JSON，形状为 `{"answer": [...]}`；诊断和 traceback 只能写 stderr。
- `data` 是 DSL 查询响应的中间包裹层，不是默认的最终输出字段。最终 `answer[*]` 的字段集合必须严格等于需求目标结构或 `returnDef.outKeyRefs[*].key`；生成代码应声明 `OUTPUT_KEYS` 并在最终映射边界校验每一行，禁止直接返回 `{"answer": [{"data": ...}]}`。
- 不得输出请求 Token、数据库凭据、完整请求体或完整响应到日志；不得把 `domainId` 请求体字段当作权限来源。
- 脚本应有 `main()`、输入校验、重复行去重/边界处理、明确的 DDL/DSL 中间行到目标字段映射和输出契约校验。
- 成功响应的 `answer` 为空时，必须在生成的 Python 中显式声明至少两条 `MOCK_ANSWER`（或同等命名的常量）记录，并在最终输出边界用 `if not answer`/`if not rows` 选择它；Mock 行依据指标视图最终返回定义（`returnDef`、`outKeyRefs` 或输出 schema）生成，固定字段名和基础类型必须与最终返回契约一致，记录应覆盖时间窗口或业务维度并使用彼此有变化、业务合理的非空值，默认不得使用 `null`、全零、空字符串或 `unknown`。DDL/JDBC 与 `typeContext.fields` 只用于中间查询行和类型推导，不能直接替代最终返回字段。只有成功空结果允许 Mock，接口错误、权限错误、字段错误、类型错误和无效响应必须抛出受控异常。
- Mock 行只用于结构验证，不能被报告为真实业务数据；真实连接无匹配数据时必须同时报告真实元数据证据和合成数据边界。
