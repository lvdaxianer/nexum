# 表范围与字段策略

## 默认策略

非本体关系 DSL 使用已配置的 Dinghai 专用数据源。缺省配置等价于：

```yaml
ontomato:
  data-engine:
    dinghai:
      table-scope: all
      allowed-tables: []
```

`all` 只表示这个固定数据源内可由数据库元数据解析的表，不表示任意数据库、任意连接或任意业务域。`userId` 和 `domainId` 必须由当前登录会话或可信 Token 建立，Token 的路径和域绑定仍然有效。

## 收窄为表清单

需要限制范围时使用：

```yaml
table-scope: list
allowed-tables:
  - dim_admin_region
  - fact_wireless_outage_timeline
```

list 模式按 DSL 逻辑表名判断。`tables.<logical>.physical-name` 可以把逻辑名映射到物理表；不配置映射时，逻辑表名按同名物理表解析。未命中清单的表必须拒绝，不得因为字段默认开放而绕过表范围。

## 字段默认开放

字段默认是 `all`，后端从 Dinghai DataSource 的 JDBC 元数据解析字段和逻辑类型。`tables.<logical>.columns` 是可选覆盖，不是字段白名单：

- 可以为物理列提供逻辑别名；
- 可以覆盖逻辑类型；
- 未写入配置但存在于数据库的字段仍可查询；
- 显式覆盖的物理列不存在时不会凭空创建字段。

## 排错

- `TABLE_NOT_ALLOWED`：先检查 `table-scope`、`allowed-tables`、逻辑表名和单表 `user-ids/domain-ids`，不要先补字段。
- `FIELD_NOT_RESOLVED`：确认字段确实存在于目标数据源、表名/大小写正确；这不是要求把全部字段复制到配置的信号。
- 缺少 `domainId`：检查会话或可信 Token 的服务端绑定；不要把 `domainId` 写进 DSL 请求体作为授权来源。
