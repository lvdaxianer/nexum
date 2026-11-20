"""执行非本体合成指标视图的最小可靠查询。

该 fixture 用于验证运行时变量注入、统一 DSL 路由和 answer 输出协议。
Author: lvdaxianer@yeah.net
Date: 2026-11-16
"""

import json
import logging
import sys
import time
import urllib.error
from urllib import request as http_request


REQUEST_BASE_URL = "__request_path"
REQUEST_TOKEN = "__request_token"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RESULT_ROWS = 100
MIN_RUNTIME_ARGS = 4
MOCK_ANSWER = [
    {"time": "2026-10-01 00:00:00", "value": 2.5},
    {"time": "2026-10-02 00:00:00", "value": 2.8},
    {"time": "2026-10-03 00:00:00", "value": 2.6},
]
OUTPUT_KEYS = ("time", "value")
SYNTHETIC_DSL_TEMPLATE = {
    "dslType": "relational-query",
    "version": 1,
    "payload": {
        "from": {"table": "synthetic_metric", "alias": "m"},
        "select": [
            {"field": "m.metric_time", "alias": "time"},
            {"field": "m.metric_value", "alias": "value"},
        ],
        "where": {
            "and": [{
                "field": "m.region",
                "operator": "eq",
                "parameter": "region",
                "logicalType": "string",
            }]
        },
        "limit": MAX_RESULT_ROWS,
    },
    "parameters": {"region": ""},
}
LOGGER = logging.getLogger(__name__)


def _extract_answer(body: object) -> list[dict]:
    """严格校验统一 DSL 响应并提取 answer。

    Args:
        body: DSL 服务返回的 JSON 对象。
    Returns:
        已校验的 answer 列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    # 外层结构错误必须显式失败，不能静默返回空列表。
    if not isinstance(body, dict):
        raise RuntimeError("响应不是对象")
    # data 是统一 DSL 响应的固定包裹层。
    if "data" not in body:
        raise RuntimeError("响应缺少 data")
    data = body["data"]
    # 首条结果承载执行引擎的 answer。
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        raise RuntimeError("响应 data 格式无效")
    first = data[0]
    # answer 缺失表示上游契约不兼容。
    if "answer" not in first:
        raise RuntimeError("响应缺少 answer")
    answer = first["answer"]
    # 返回列表才允许进入去重和结果截断。
    if not isinstance(answer, list):
        raise RuntimeError("响应 answer 必须是列表")
    # 只有成功响应中的空 answer 才允许使用 schema-compatible mock。
    if not answer:
        return [dict(row) for row in MOCK_ANSWER]
    return answer


def _validate_output_row(row: object) -> dict:
    """校验中间查询行已经映射到最终返回字段。

    Args:
        row: 查询适配器返回的候选行。
    Returns:
        与 OUTPUT_KEYS 一致的最终返回行。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-19
    """
    # 字段集合不一致时暴露错误，禁止把 data 或源表字段透传出去。
    if not isinstance(row, dict) or set(row) != set(OUTPUT_KEYS):
        raise RuntimeError("查询行字段与最终输出契约不一致")
    return {key: row[key] for key in OUTPUT_KEYS}


def _request_json(request_obj: http_request.Request, request_timeout: float) -> object:
    """执行带超时的 HTTP 请求并返回 JSON。

    Args:
        request_obj: 已构造的 DSL 请求。
        request_timeout: 本次请求的剩余超时时间。
    Returns:
        解码后的 JSON 对象。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    # 日志只记录业务标识和阶段，不记录 token、请求体或响应体。
    LOGGER.debug("[metric-view] DSL request started")
    try:
        with http_request.urlopen(request_obj, timeout=request_timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
        LOGGER.debug("[metric-view] DSL request completed")
        return body
    except (TimeoutError, urllib.error.HTTPError, urllib.error.URLError, ValueError) as exc:
        LOGGER.warning("[metric-view] DSL request failed: %s", type(exc).__name__)
        raise RuntimeError("DSL 请求失败") from exc


def execute_dsl(dsl: dict, deadline: float, identity: dict[str, str]) -> list[dict]:
    """在整体 deadline 内调用统一 DSL 接口。

    Args:
        dsl: 本次查询的结构化 DSL。
        deadline: 单调时钟计算出的整体截止时间。
        identity: 兼容运行协议的用户和域身份。
    Returns:
        DSL answer 行列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    remaining = deadline - time.monotonic()
    # 剩余时间耗尽时不再创建远程请求。
    if remaining <= 0:
        raise RuntimeError("DSL 请求整体超时")
    payload = json.dumps({"dsl": dsl, **identity}).encode("utf-8")
    request_obj = http_request.Request(
        f"{REQUEST_BASE_URL.rstrip('/')}/metricView/dsl/execute",
        data=payload,
        headers={"Content-Type": "application/json", "X-Trusted-Token": REQUEST_TOKEN},
        method="POST",
    )
    rows = _extract_answer(_request_json(request_obj, min(REQUEST_TIMEOUT_SECONDS, remaining)))
    # DSL answer 仍是中间行，最终字段必须通过目标输出契约校验。
    return [_validate_output_row(row) for row in rows]


def build_dsl(region: str) -> dict:
    """构造符合 relational-query v1 的合成查询。

    Author: lvdaxianer@yeah.net
    Date: 2026-11-19
    """
    # 深拷贝模板，避免一次执行修改后影响后续请求。
    dsl = json.loads(json.dumps(SYNTHETIC_DSL_TEMPLATE))
    dsl["parameters"]["region"] = region
    return dsl


def _deduplicate(rows: list[dict]) -> list[dict]:
    """按 id 或完整行去重，保留首次出现的结果。

    Args:
        rows: DSL 返回的原始行列表。
    Returns:
        去重后的行列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    result: list[dict] = []
    seen: set[object] = set()
    for row in rows:
        # 时间轴返回没有 id 时使用稳定 JSON 作为降级键。
        key = row.get("id")
        # 缺失主键时使用稳定 JSON 作为合成数据的降级键。
        if key is None:
            key = json.dumps(row, ensure_ascii=False, sort_keys=True)
        # 重复行只保留第一次出现的记录。
        if key in seen:
            continue
        seen.add(key)
        result.append(row)
    return result


def main() -> None:
    """读取参数文件、执行查询并输出统一 answer。

    Returns:
        None；stdout 输出唯一协议结果。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    # 运行时固定接收 userId、domainId 和参数文件路径。
    if len(sys.argv) < MIN_RUNTIME_ARGS:
        raise RuntimeError("缺少运行参数")
    user_id, domain_id, parameter_file_path = sys.argv[1:4]
    # 参数文件由运行器创建，读取后只用于构造 DSL。
    with open(parameter_file_path, "r", encoding="utf-8") as parameter_file:
        params = json.load(parameter_file)
    deadline = time.monotonic() + REQUEST_TIMEOUT_SECONDS
    identity = {"userId": user_id, "domainId": domain_id}
    region = str(params.get("region", "")).strip()
    rows = execute_dsl(build_dsl(region), deadline, identity)
    # stdout 只输出执行引擎消费的 answer JSON。
    print(json.dumps({"answer": _deduplicate(rows)[:MAX_RESULT_ROWS]}, ensure_ascii=False))


# Python 协议入口负责稳定兜底，不参与指标查询逻辑。
if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback

        traceback.print_exc()
        raise
