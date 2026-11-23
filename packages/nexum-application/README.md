# @nexum/application

Nexum 的应用编排层。这里放 Skill Registry、Tool Registry、Question Broker、Configured Coding Loop 和 Runtime Composer，负责把 Core、Persistence 与 Integrations 组合成可运行服务。

Application 不是通用持久化包；替换文件存储或外部模型时，应直接替换对应 Port 实现。
