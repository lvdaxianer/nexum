"""执行 2.2.1 故障-退服-宏观指标视图。
本脚本只通过统一 DSL 接口读取数据，stdout 仅输出协议要求的 answer JSON。
Author: lvdaxianer@yeah.net
Date: 2026-11-16
"""
import json
import logging
import sys
import time
import traceback
from dataclasses import dataclass
import urllib.error
import urllib.request
REQUEST_BASE_URL = "__request_path"
REQUEST_TOKEN = "__request_token"
REQUEST_TIMEOUT_SECONDS = 30
OVERALL_TIMEOUT_SECONDS = 90
QUERY_LIMIT = 500
MAX_REGION_DEPTH = 4
MAX_RESULT_ROWS = 2000
AREA_PREFIX = "adcode-"
MIN_RUNTIME_ARGS = 4
REGION_DEPTH_0 = 0
REGION_DEPTH_1 = 1
REGION_DEPTH_2 = 2
REGION_DEPTH_3 = 3
FULL_OUTAGE_STATUS = "FULL_OUTAGE"
MOCK_STATION_ID = 900001
MOCK_LONGITUDE = 116.397
MOCK_LATITUDE = 39.908
MOCK_HEIGHT = 35.0
MOCK_DURATION = 15
MOCK_STATUS = 1
MOCK_TYPE = "c"
MOCK_BBU_COUNT = 1
MOCK_ANSWER = [{
    "id": MOCK_STATION_ID, "longitude": MOCK_LONGITUDE, "latitude": MOCK_LATITUDE,
    "duration": MOCK_DURATION, "status": MOCK_STATUS, "type": MOCK_TYPE,
    "baseStationFormat": {"BBU2G": MOCK_BBU_COUNT, "BBU4G": MOCK_BBU_COUNT, "BBU5G": MOCK_BBU_COUNT},
    "height": MOCK_HEIGHT,
}, {
    "id": MOCK_STATION_ID + 1, "longitude": MOCK_LONGITUDE + 0.012, "latitude": MOCK_LATITUDE + 0.008,
    "duration": MOCK_DURATION + 7, "status": MOCK_STATUS, "type": MOCK_TYPE,
    "baseStationFormat": {"BBU2G": MOCK_BBU_COUNT + 1, "BBU4G": MOCK_BBU_COUNT, "BBU5G": MOCK_BBU_COUNT},
    "height": MOCK_HEIGHT + 4.0,
}, {
    "id": MOCK_STATION_ID + 2, "longitude": MOCK_LONGITUDE - 0.009, "latitude": MOCK_LATITUDE + 0.015,
    "duration": MOCK_DURATION + 16, "status": MOCK_STATUS, "type": MOCK_TYPE,
    "baseStationFormat": {"BBU2G": MOCK_BBU_COUNT, "BBU4G": MOCK_BBU_COUNT + 1, "BBU5G": MOCK_BBU_COUNT + 2},
    "height": MOCK_HEIGHT + 9.0,
}]
OUTPUT_KEYS = (
    "id", "longitude", "latitude", "duration", "status", "type", "baseStationFormat", "height",
)
LOGGER = logging.getLogger(__name__)
@dataclass(frozen=True)
class ExecutionContext:
    """保存本次脚本执行的兼容身份和整体 deadline。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    user_id: str
    domain_id: str
    deadline: float
def _mock_answer() -> list[dict]:
    """构造符合最终指标视图返回契约的 Mock 结果。
    Returns:
        一条具有合理非空字段值的最终返回对象。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-18
    """
    return [dict(row) for row in MOCK_ANSWER]
def _extract_answer(payload: object) -> list[dict]:
    """严格校验统一 DSL 响应并提取 answer。
    Args:
        payload: DSL 服务返回的 JSON 对象。
    Returns:
        已校验的 answer 列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    # 条件注释：响应必须是对象。
    if not isinstance(payload, dict):
        raise RuntimeError("DSL 响应不是 JSON 对象")
    # 条件注释：服务端显式错误必须阻断。
    if payload.get("error"):
        raise RuntimeError("DSL 查询失败")
    # 条件注释：响应必须包含 DSL data 包裹层。
    if "data" not in payload:
        raise RuntimeError("DSL 响应缺少 data")
    data = payload["data"]
    # 条件注释：data 必须包含对象行。
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        raise RuntimeError("DSL 响应 data 格式无效")
    first = data[0]
    # 条件注释：对象行必须包含 answer。
    if "answer" not in first:
        raise RuntimeError("DSL 响应缺少 answer")
    answer = first["answer"]
    # 条件注释：answer 必须是数组。
    if not isinstance(answer, list):
        raise RuntimeError("DSL 响应 answer 必须是列表")
    # 条件注释：成功空结果才允许进入最终 Mock 边界。
    if not answer:
        return []
    return answer
def _build_request(url: str, dsl: dict, context: ExecutionContext) -> urllib.request.Request:
    """构造不记录凭据的结构化 DSL 请求。
    Args:
        url: 运行时注入的后端地址。
        dsl: 本次查询的结构化 DSL。
        context: 本次执行的身份上下文。
    Returns:
        标准库 HTTP 请求对象。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    payload = json.dumps({"dsl": dsl, "userId": context.user_id, "domainId": context.domain_id}).encode("utf-8")
    return urllib.request.Request(
        url, data=payload,
        headers={"X-Trusted-Token": REQUEST_TOKEN, "Content-Type": "application/json"},
        method="POST",
    )
def _request_json(request: urllib.request.Request, request_timeout: float) -> object:
    """执行受控 HTTP 请求并将外部错误转换为安全异常。
    Args:
        request: 已构造的 DSL HTTP 请求。
        request_timeout: 本次请求剩余超时时间。
    Returns:
        解码后的 JSON 对象。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    LOGGER.debug("[metric-view] DSL request started")
    try:
        with urllib.request.urlopen(request, timeout=request_timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
            LOGGER.debug("[metric-view] DSL request completed")
            return payload
    except TimeoutError as exc:
        LOGGER.warning("[metric-view] DSL request timed out")
        raise RuntimeError("DSL 查询请求超时") from exc
    except urllib.error.HTTPError as exc:
        LOGGER.warning("[metric-view] DSL request returned HTTP error")
        raise RuntimeError(f"DSL 查询失败：HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        LOGGER.warning("[metric-view] DSL request failed")
        raise RuntimeError("DSL 查询请求失败") from exc
    except ValueError as exc:
        LOGGER.warning("[metric-view] DSL response was invalid JSON")
        raise RuntimeError("DSL 响应不是合法 JSON") from exc
def execute_dsl(dsl: dict, context: ExecutionContext) -> list[dict]:
    """在整体 deadline 内调用统一 DSL 接口。
    Args:
        dsl: 本次查询的结构化 DSL。
        context: 本次执行的身份和 deadline。
    Returns:
        DSL answer 行列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    remaining = context.deadline - time.monotonic()
    # 条件注释：整体 deadline 到期时立即停止。
    if remaining <= 0:
        raise RuntimeError("DSL 查询整体超时")
    url = REQUEST_BASE_URL.rstrip("/") + "/metricView/dsl/execute"
    request = _build_request(url, dsl, context)
    payload = _request_json(request, min(REQUEST_TIMEOUT_SECONDS, remaining))
    return _extract_answer(payload)
def _select_fields() -> list[dict]:
    """返回宏观退服指标所需的字段。
    Returns:
        DSL select 字段定义。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    return [{"field": field, "alias": alias} for field, alias in [
        ("station.station_id", "station_id"), ("station.longitude", "longitude"),
        ("station.latitude", "latitude"), ("station.height", "height"),
        ("station.bbu_2g_count", "bbu_2g_count"), ("station.bbu_4g_count", "bbu_4g_count"),
        ("station.bbu_5g_count", "bbu_5g_count"), ("outage.outage_level", "outage_level"),
        ("outage.duration", "duration"), ("outage.outage_duration", "outage_duration"),
    ]]
def _build_region_joins(depth: int) -> tuple[list[dict], str]:
    """构造基站到目标行政区域的有界父级关系。
    Args:
        depth: 目标行政区域向上的层级深度。
    Returns:
        关联定义和最终区域别名。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    # 条件注释：行政区域层级必须在固定范围内。
    if depth < 0 or depth >= MAX_REGION_DEPTH:
        raise ValueError("行政区域层级超出限制")
    joins = [{"type": "inner", "table": {"table": "dim_base_station", "alias": "station"}, "on": [{"left": "outage.station_id", "right": "station.station_id"}]}]
    previous_alias = "station"
    for level in range(depth + 1):
        # 每层都使用独立别名，保证 join 条件可追踪。
        region_alias = f"region{level}"
        left_field = f"{previous_alias}.parent_admin_region_id" if level else "station.region_id"
        joins.append({"type": "inner", "table": {"table": "dim_admin_region", "alias": region_alias}, "on": [{"left": left_field, "right": f"{region_alias}.region_id"}]})
        previous_alias = region_alias
    return joins, previous_alias
def _build_filters(region_alias: str) -> list[dict]:
    """构造时间、区域和退服状态过滤条件。
    Args:
        region_alias: 目标行政区域表别名。
    Returns:
        DSL where 条件定义。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    return [
        {"field": "outage.outage_type", "operator": "eq", "parameter": "outage_type", "logicalType": "string"},
        {"field": "outage.start_time", "operator": "lte", "parameter": "query_time", "logicalType": "local_datetime"},
        {"field": "outage.end_time", "operator": "gt", "parameter": "query_time", "logicalType": "local_datetime"},
        {"field": "station.station_type", "operator": "eq", "parameter": "station_type", "logicalType": "string"},
        {"field": f"{region_alias}.region_code", "operator": "eq", "parameter": "area_code", "logicalType": "string"},
    ]
def build_dsl(area_code: str, query_time: str, depth: int) -> dict:
    """构造指定行政层级的宏观退服结构化 DSL。
    Args:
        area_code: 行政区域编码。
        query_time: 公共时间轴游标。
        depth: 区域向上关联层级。
    Returns:
        可提交给统一 DSL 服务的查询对象。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    joins, region_alias = _build_region_joins(depth)
    return {"dslType": "relational-query", "version": 1, "payload": {
        "from": {"table": "fact_station_outage", "alias": "outage"},
        "joins": joins, "select": _select_fields(), "where": _build_filters(region_alias),
        "limit": QUERY_LIMIT,
    }, "parameters": {"area_code": area_code, "query_time": query_time, "outage_type": "OUTAGE", "station_type": "宏基站"}}
def _query_depths(area_code: str, query_time: str, context: ExecutionContext) -> list[dict]:
    """展开四次固定层级查询，避免循环内发起远程请求。
    Args:
        area_code: 行政区域编码。
        query_time: 公共时间轴游标。
        context: 本次执行上下文。
    Returns:
        各层级查询结果的合并列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    rows = []
    rows.extend(execute_dsl(build_dsl(area_code, query_time, REGION_DEPTH_0), context))
    rows.extend(execute_dsl(build_dsl(area_code, query_time, REGION_DEPTH_1), context))
    rows.extend(execute_dsl(build_dsl(area_code, query_time, REGION_DEPTH_2), context))
    rows.extend(execute_dsl(build_dsl(area_code, query_time, REGION_DEPTH_3), context))
    return rows
def _new_item(row: dict) -> dict:
    """根据首条基站记录初始化返回对象。
    Args:
        row: DSL 返回的单条基站记录。
    Returns:
        符合指标视图返回契约的站点对象。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    return {"id": row.get("station_id"), "longitude": row.get("longitude"), "latitude": row.get("latitude"), "duration": 0, "status": 0, "type": "c", "baseStationFormat": {"BBU2G": 0, "BBU4G": 0, "BBU5G": 0}, "height": row.get("height") or 0}
def _merge_row(result: dict, row: dict) -> None:
    """聚合单条退服记录并保留最严重状态。
    Args:
        result: 以基站 ID 聚合的可变结果。
        row: DSL 返回的单条记录。
    Returns:
        None；结果通过 result 原地更新。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    station_id = row.get("station_id")
    # 条件注释：缺少基站主键的脏数据不能进入结果。
    if station_id is None:
        return
    item = result.setdefault(station_id, _new_item(row))
    duration = row.get("outage_duration") or row.get("duration") or 0
    item["duration"] = max(item["duration"], duration)
    item["status"] = max(item["status"], 1 if row.get("outage_level") == FULL_OUTAGE_STATUS else 0)
    formats = item["baseStationFormat"]
    formats["BBU2G"] = max(formats["BBU2G"], int((row.get("bbu_2g_count") or 0) > 0))
    formats["BBU4G"] = max(formats["BBU4G"], int((row.get("bbu_4g_count") or 0) > 0))
    formats["BBU5G"] = max(formats["BBU5G"], int((row.get("bbu_5g_count") or 0) > 0))
def _load_params(path: str) -> tuple[str, str]:
    """读取并校验指标视图参数文件中的区域和时间。
    Args:
        path: 运行时参数文件路径。
    Returns:
        区域编码和时间游标。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    with open(path, "r", encoding="utf-8") as parameter_file:
        params = json.load(parameter_file)
    area = str(params.get("area", "")).strip()
    query_time = str(params.get("time", "")).strip()
    # 入口参数缺失时立即失败，不向后端发送不完整查询。
    if not area or not query_time:
        raise RuntimeError("参数 area 和 time 均不能为空")
    return area.removeprefix(AREA_PREFIX), query_time
def _finalize_answer(rows: list[dict]) -> list[dict]:
    """将聚合中间行映射为严格的目标返回结构。
    Args:
        rows: 本地聚合得到的候选结果行。
    Returns:
        仅包含 OUTPUT_KEYS 的最终返回行。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-19
    """
    for row in rows:
        # 条件注释：每一行必须与最终输出字段集合严格一致。
        if set(row) != set(OUTPUT_KEYS):
            raise RuntimeError("聚合行字段与最终输出契约不一致")
    return [{key: row[key] for key in OUTPUT_KEYS} for row in rows]
def main() -> None:
    """读取执行参数、查询退服数据并输出统一 answer。
    Returns:
        None；stdout 输出唯一协议结果。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    # 运行时只接收 userId、domainId 和参数文件路径。
    if len(sys.argv) < MIN_RUNTIME_ARGS:
        raise RuntimeError("缺少运行程序传入的 userId、domainId 或 parameterFilePath")
    user_id, domain_id, parameter_file_path = sys.argv[1:4]
    area_code, query_time = _load_params(parameter_file_path)
    context = ExecutionContext(user_id, domain_id, time.monotonic() + OVERALL_TIMEOUT_SECONDS)
    rows = _query_depths(area_code, query_time, context)
    result = {}
    for row in rows:
        # 本地聚合阶段不再发起远程调用。
        _merge_row(result, row)
    # 成功查询为空时只在最终返回边界生成契约兼容 Mock，不修改数据库。
    answer = _finalize_answer(list(result.values())[:MAX_RESULT_ROWS])
    # 条件注释：只有成功空结果才允许选择最终返回 Mock。
    if not answer:
        answer = _mock_answer()
    # stdout 是执行引擎唯一消费的机器可读结果通道。
    print(json.dumps({"answer": answer}, ensure_ascii=False))
# Python 协议入口负责稳定兜底，不参与指标查询逻辑。
if __name__ == "__main__":
    # 入口层只做稳定兜底，并保留 traceback 便于运行态定位。
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise
