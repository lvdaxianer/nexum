# Spec Delta

## Purpose

为 AI 提供一份位于仓库根目录的发包操作契约，统一描述如何准备 Nexum npm 产物、收集可复核证据并将最终发布动作安全地交给人工执行。

## ADDED Requirements

### Requirement: 根目录清单定义标准准备顺序

仓库根目录 MUST 提供 `nexum-package-release-checklist.md`，并按参数确认、环境检查、准备命令、产物核验和人工交接的顺序指导 AI。

#### Scenario: AI 按清单准备新版本

- **WHEN** AI 需要准备一个新的 Nexum npm 版本
- **THEN** AI 可从清单获得命令模板、参数约束、预期产物和验证证据要求，无需重新推断底层脚本顺序

### Requirement: 清单规定安全停止条件

清单 MUST 要求 AI 在参数、分支、工作区、检查、构建、打包或验证异常时停止，并 MUST 明确 AI 不得执行 `npm publish` 或处理用户凭据。

#### Scenario: 准备阶段出现异常

- **WHEN** 任一前置条件或验证阶段不满足
- **THEN** AI 停止后续发布准备，报告失败命令和证据，不生成成功交接结论

#### Scenario: 准备全部通过

- **WHEN** 所有阶段均通过且 tarball 已存在
- **THEN** AI 报告产物路径、版本、tag、验证结果和人工发布命令，并等待人工执行发布

### Requirement: 清单支持版本化复用

清单 MUST 使用带占位符的命令和示例，要求每次由操作者显式传入目标版本与 dist-tag，不得把某一个具体版本写成后续版本的默认发布目标。

#### Scenario: 准备 beta、rc 或 stable 版本

- **WHEN** 操作者更换版本号和 dist-tag
- **THEN** AI 使用同一套流程准备对应版本，并在交接信息中准确反映新的参数
