# Tasks

## 1. Core model contract

- [ ] 1.1 增加 Provider/model capability、usage、pricing 和 catalog 端口类型；为可选 usage、边界和安全 DTO 编写 Core contract tests。
- [ ] 1.2 保持 ModelPort、错误分类、reasoning、finish reason 和 retry-after 兼容；运行 model-adapter/model-probe 测试。

## 2. Provider integration

- [ ] 2.1 新增 OpenAI-compatible provider catalog 与 adapter，解析流式/非流式 usage 并限制上游元数据；运行 Integrations 测试。
- [ ] 2.2 Application 组合 catalog，验证新增 Provider 不需要修改 Coding Loop。

## 3. Protocol and Client

- [ ] 3.1 增加 Server/Client Provider catalog 查询和安全 DTO；验证 credential、headers、raw error 不出现在响应。
- [ ] 3.2 保持旧 model config/probe/prompt 路由兼容，并覆盖 rate-limit/reasoning/usage 场景。

## 4. Integration

- [ ] 4.1 运行受影响测试、`bun run check`、OpenSpec strict，完成审查、提交、合并和归档。

## Workflow follow-up

- 归档完成的 OpenSpec change，并验证归档后的主规格。
