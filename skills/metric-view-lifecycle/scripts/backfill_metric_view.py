#!/usr/bin/env python3
"""安全编排指标视图的测试、回填和保存后复核流程。"""

from __future__ import annotations

import argparse
import getpass
import json
import sys
import urllib.error
import urllib.request
from copy import deepcopy
from collections.abc import Callable
from pathlib import Path
from typing import Any

from output_contract import (
    OUTPUT_ENVELOPE_ERROR,
    OUTPUT_SCHEMA_ERROR,
    extract_output_keys,
    validate_result_payload,
)
from metric_view_contract import ContractViolation, validate_request
from error_code_matrix import classify_error
from lifecycle_boundaries import detect_update_conflict
from validate_metric_view_python import load_variables, validate
from type_compatibility import validate_definition

DEFAULT_TIMEOUT_SECONDS = 15
DEFAULT_DATA_QUERY_BASE_URL = "http://10.100.31.37:3000/api/data-query"
QUERY_LIST_PATH = "/metricView/queryList"
QUERY_BY_ID_PATH = "/metricView/queryById"
TEST_PATH = "/metricView/test"
TEST_EXECUTE_PATH = "/metricView/testExecute"
DSL_EXECUTE_PATH = "/metricView/dsl/execute"
SAVE_PATH = "/metricView/save"
OPTIONAL_BACKEND_DROPPED_FIELDS = {"typeContext"}
DEFAULT_SAVE_STATUS = "PUBLISHED"
RUNTIME_VARIABLES_PATH = Path(__file__).resolve().parents[1] / "references/runtime-variables.yaml"


class BackfillError(RuntimeError):
    """表示回填流程无法安全继续。"""


class MetricViewApiError(BackfillError):
    """表示指标视图接口返回的可观察业务失败。"""

    def __init__(
        self,
        endpoint: str,
        error_code: str,
        message: str,
        details: dict[str, Any] | None = None,
        trace_id: str | None = None,
    ) -> None:
        """保存安全诊断字段，不保留原始异常或完整响应。"""
        self.endpoint = endpoint
        self.error_code = error_code
        self.details = details or {}
        self.trace_id = trace_id
        summary = f"{endpoint} 失败：{error_code}"
        if message.strip():
            summary = f"{summary}，{message.strip()}"
        super().__init__(summary)


class ReactStopError(BackfillError):
    """表示 ReAct 因不可修复或缺证据错误而停止。"""

    def __init__(self, observation: dict[str, Any], policy: dict[str, Any]) -> None:
        """保留错误码、诊断、traceId 和停止策略，不保留完整响应。"""
        self.error_code = str(observation.get("errorCode", "REQUEST_FAILED"))[:80]
        self.details = observation.get("details") if isinstance(observation.get("details"), dict) else {}
        self.trace_id = observation.get("traceId")
        self.policy = policy
        super().__init__(f"接口测试已停止：{self.error_code}；{policy.get('reason', '无修复规则')}")


def _validate_request_or_raise(endpoint: str, body: dict[str, Any]) -> None:
    """在任何管理接口远程副作用前执行本地请求体契约门禁。"""
    try:
        validate_request(endpoint, body)
    except ContractViolation as exc:
        raise BackfillError(f"接口契约门禁失败：{exc}") from exc


def resolve_base_url(base_url: str | None) -> str:
    """使用部署环境默认地址，也允许用户显式覆盖。"""
    return (base_url or DEFAULT_DATA_QUERY_BASE_URL).strip()


def merge_metric_view(original: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """只合并候选定义明确提供的字段，保留更新对象的稳定字段。"""
    merged = deepcopy(original)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge_metric_view(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


SAFE_DETAIL_KEYS = frozenset({
    "parameter", "field", "table", "path", "databaseType", "dslLogicalType",
    "metricViewType", "actualType", "expectedType", "suggestion", "stage",
    "expectedKeys", "actualKeys", "missingKeys", "unexpectedKeys", "rowIndex",
})
SAFE_DETAIL_LIST_KEYS = frozenset({"expectedKeys", "actualKeys", "missingKeys", "unexpectedKeys"})


def _safe_detail_value(key: str, item: Any) -> tuple[bool, Any]:
    """筛选单个不含敏感值的诊断字段。"""
    if key not in SAFE_DETAIL_KEYS:
        return False, None
    if isinstance(item, str) and item.strip() and len(item) <= 160 and "\n" not in item and "\r" not in item:
        return True, item
    if key in SAFE_DETAIL_LIST_KEYS and isinstance(item, list) and len(item) <= 100:
        if all(isinstance(value_item, str) and len(value_item) <= 160 for value_item in item):
            return True, list(item)
    if key == "rowIndex" and isinstance(item, int) and 0 <= item <= 100000:
        return True, item
    return False, None


def _safe_detail_map(value: Any) -> dict[str, Any]:
    """保留页面和 ReAct 修复需要的安全短文本、字段列表和行号。"""
    if not isinstance(value, dict):
        return {}
    safe: dict[str, Any] = {}
    for key, item in value.items():
        is_safe, safe_value = _safe_detail_value(key, item)
        if is_safe:
            safe[key] = safe_value
    return safe


def _extract_payload(response: Any, endpoint: str) -> Any:
    """从统一响应中取出 data，并保留结构化业务错误供 ReAct 观察。"""
    if not isinstance(response, dict):
        raise BackfillError(f"{endpoint} 返回不是 JSON 对象")
    if response.get("success") is False or response.get("error") or response.get("errorCode"):
        error_code = response.get("errorCode") or response.get("code") or "REQUEST_FAILED"
        message = response.get("message") or response.get("error") or "接口业务调用失败"
        raise MetricViewApiError(
            endpoint,
            str(error_code)[:80],
            str(message)[:160] if not isinstance(message, dict) else "接口业务调用失败",
            _safe_detail_map(response.get("details")),
            str(response.get("traceId"))[:80] if response.get("traceId") else None,
        )
    if "data" not in response:
        raise BackfillError(f"{endpoint} 缺少 data")
    return response["data"]


def _payload_summary(payload: Any) -> dict[str, Any]:
    """生成不包含完整业务数据的测试结果摘要。"""
    if isinstance(payload, list):
        return {"kind": "list", "rowCount": len(payload)}
    if isinstance(payload, dict):
        return {"kind": "object", "keys": sorted(str(key) for key in payload)[:20]}
    return {"kind": type(payload).__name__}


def _validate_candidate_output(definition: dict[str, Any], payload: Any, endpoint: str) -> Any:
    """将成功测试的最终 answer 与 returnDef 对账并保留安全诊断。"""
    function = definition.get("function")
    if not isinstance(function, dict) or function.get("returnDef") is None:
        return payload
    expected_keys = _expected_output_keys(function)
    if not isinstance(payload, dict) or "answer" not in payload:
        raise MetricViewApiError(
            endpoint,
            OUTPUT_ENVELOPE_ERROR,
            "测试成功响应缺少最终 answer",
            {"expectedKeys": expected_keys},
        )
    diagnostic = validate_result_payload(payload, function["returnDef"])
    if not diagnostic.get("ok"):
        _raise_output_diagnostic(endpoint, diagnostic)
    return payload


def _raise_output_diagnostic(endpoint: str, diagnostic: dict[str, Any]) -> None:
    """将输出契约校验结果转换为安全接口异常。"""
    raise MetricViewApiError(
        endpoint,
        str(diagnostic.get("errorCode", OUTPUT_SCHEMA_ERROR)),
        str(diagnostic.get("message", "最终输出契约校验失败")),
        _safe_detail_map(diagnostic),
    )


def _expected_output_keys(function: dict[str, Any]) -> list[str]:
    """从候选 function 取得输出字段，并将定义错误转成门禁异常。"""
    try:
        return extract_output_keys(function["returnDef"])
    except ValueError as error:
        raise BackfillError(f"输出契约门禁失败：{error}") from error


def _extract_rows(payload: Any) -> list[dict[str, Any]]:
    """兼容分页 data、列表 data 和直接列表三种查询结果。"""
    rows = payload
    if isinstance(payload, dict):
        rows = payload.get("data", payload.get("rows", []))
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise BackfillError("queryList 返回的指标视图列表格式无效")
    return rows


def _extract_metric_view(payload: Any) -> dict[str, Any]:
    """从 queryById 或 save 响应中提取单个指标视图。"""
    candidate = payload
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        candidate = payload["data"]
    if not isinstance(candidate, dict):
        raise BackfillError("指标视图详情格式无效")
    return candidate


def _extract_id(payload: Any) -> Any:
    """从保存响应中尽力提取新建对象 ID，不泄露完整响应。"""
    if isinstance(payload, dict):
        if payload.get("id") is not None:
            return payload["id"]
        nested = payload.get("data")
        if isinstance(nested, dict) and nested.get("id") is not None:
            return nested["id"]
    return None


class MetricViewClient:
    """只调用接口清单中的指标视图管理接口。"""

    def __init__(self, base_url: str, token: str, timeout: int = DEFAULT_TIMEOUT_SECONDS) -> None:
        """创建会话；Token 只存在当前进程内，不写入文件或日志。"""
        normalized = base_url.strip().rstrip("/")
        if not normalized.startswith(("http://", "https://")):
            raise BackfillError("base URL 必须以 http:// 或 https:// 开头")
        if not token.strip():
            raise BackfillError("X-Trusted-Token 不能为空")
        self.base_url = normalized
        self.headers = {"X-Trusted-Token": token, "Content-Type": "application/json"}
        self.timeout = timeout

    def _post(self, path: str, body: dict[str, Any]) -> Any:
        """执行受控 POST 请求，不记录请求体、Token 或完整响应。"""
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers=self.headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except TimeoutError as exc:
            raise BackfillError(f"{path} 请求超时") from exc
        except urllib.error.HTTPError as exc:
            raise BackfillError(f"{path} 请求失败：HTTP {exc.code}") from exc
        except urllib.error.URLError as exc:
            raise BackfillError(f"{path} 请求失败：{exc.reason.__class__.__name__}") from exc
        except OSError as exc:
            raise BackfillError(f"{path} 请求失败：{exc.__class__.__name__}") from exc
        except ValueError as exc:
            raise BackfillError(f"{path} 返回不是合法 JSON") from exc

    def query_list(self, name: str) -> list[dict[str, Any]]:
        """按名称查询候选指标视图。"""
        body = {"name": name}
        _validate_request_or_raise(QUERY_LIST_PATH, body)
        response = self._post(QUERY_LIST_PATH, body)
        return _extract_rows(_extract_payload(response, QUERY_LIST_PATH))

    def query_by_id(self, metric_view_id: Any) -> dict[str, Any]:
        """按 ID 查询保存后的完整指标视图。"""
        body = {"id": metric_view_id}
        _validate_request_or_raise(QUERY_BY_ID_PATH, body)
        response = self._post(QUERY_BY_ID_PATH, body)
        return _extract_metric_view(_extract_payload(response, QUERY_BY_ID_PATH))

    def test(self, definition: dict[str, Any]) -> Any:
        """执行非持久化指标视图测试。"""
        _validate_request_or_raise(TEST_PATH, definition)
        payload = _extract_payload(self._post(TEST_PATH, definition), TEST_PATH)
        return _validate_candidate_output(definition, payload, TEST_PATH)

    def test_execute(self, metric_view: dict[str, Any], params: dict[str, Any]) -> Any:
        """执行已发布指标视图的参数化测试。"""
        body = {"metricView": metric_view, "param": params}
        _validate_request_or_raise(TEST_EXECUTE_PATH, body)
        payload = _extract_payload(
            self._post(TEST_EXECUTE_PATH, body),
            TEST_EXECUTE_PATH,
        )
        return _validate_candidate_output(metric_view, payload, TEST_EXECUTE_PATH)

    def execute_dsl(
        self,
        dsl: dict[str, Any],
        user_id: str | None = None,
        domain_id: str | None = None,
    ) -> Any:
        """通过统一 DSL 只读接口执行候选查询，供 ReAct 定位字段诊断。"""
        body: dict[str, Any] = {"dsl": dsl}
        if user_id:
            body["userId"] = user_id
        if domain_id:
            body["domainId"] = domain_id
        return _extract_payload(self._post(DSL_EXECUTE_PATH, body), DSL_EXECUTE_PATH)

    def observe_test(self, definition: dict[str, Any]) -> dict[str, Any]:
        """调用测试接口并返回 ReAct 可消费的安全观察结果。"""
        try:
            payload = self.test(definition)
            return {"ok": True, "summary": _payload_summary(payload)}
        except MetricViewApiError as exc:
            return {
                "ok": False, "errorCode": exc.error_code, "message": str(exc),
                "details": exc.details, "traceId": exc.trace_id,
            }
        except BackfillError as exc:
            return {"ok": False, "errorCode": "REQUEST_FAILED", "message": str(exc)[:200], "details": {}}

    def observe_test_execute(
        self,
        metric_view: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """调用已发布视图的参数化测试并返回安全观察结果。"""
        try:
            payload = self.test_execute(metric_view, params)
            return {"ok": True, "summary": _payload_summary(payload)}
        except MetricViewApiError as exc:
            return {
                "ok": False, "errorCode": exc.error_code, "message": str(exc),
                "details": exc.details, "traceId": exc.trace_id,
            }
        except BackfillError as exc:
            return {"ok": False, "errorCode": "REQUEST_FAILED", "message": str(exc)[:200], "details": {}}

    def save(self, definition: dict[str, Any]) -> Any:
        """保存创建或更新后的指标视图。"""
        _validate_request_or_raise(SAVE_PATH, definition)
        response = self._post(SAVE_PATH, definition)
        if isinstance(response, dict) and response.get("success") is True and "data" not in response:
            return {}
        return _extract_payload(response, SAVE_PATH)


def run_react_test(
    client: MetricViewClient,
    definition: dict[str, Any],
    repair: Callable[[dict[str, Any], dict[str, Any], int], dict[str, Any] | None],
    max_rounds: int = 3,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """按接口结果执行 Plan-Execute-Observe-Repair 测试循环。"""
    if max_rounds < 1 or max_rounds > 3:
        raise BackfillError("ReAct 测试轮次必须在 1 到 3 之间")
    current = deepcopy(definition)
    rounds: list[dict[str, Any]] = []
    for round_number in range(1, max_rounds + 1):
        observation = client.observe_test(current)
        policy = classify_error(observation.get("errorCode"), observation.get("details")) if observation.get("ok") is not True else {}
        rounds.append({"round": round_number, "observation": observation, "policy": policy})
        if observation.get("ok") is True:
            return current, rounds
        if policy.get("action") != "repair":
            break
        repaired = repair(deepcopy(current), observation, round_number)
        if repaired is None:
            break
        current = repaired
    last = rounds[-1]["observation"] if rounds else {"errorCode": "REQUEST_FAILED"}
    last_policy = rounds[-1].get("policy") or classify_error(last.get("errorCode"), last.get("details"))
    raise ReactStopError(last, last_policy)


def _verify_saved_definition(prepared: dict[str, Any], saved: dict[str, Any]) -> list[str]:
    """保存后核对稳定字段，并记录后端不会持久化的可选证据字段。"""
    omitted_fields: list[str] = []
    for field in ("name", "status", "description", "typeContext"):
        # 部分部署版本只消费 typeContext 做测试校验，不把它写回指标视图。
        if field in OPTIONAL_BACKEND_DROPPED_FIELDS and saved.get(field) is None:
            if field in prepared:
                omitted_fields.append(field)
            continue
        if field in prepared and saved.get(field) != prepared.get(field):
            raise BackfillError(f"保存后复核失败：字段 {field} 与候选定义不一致")
    prepared_function = prepared.get("function")
    saved_function = saved.get("function")
    if isinstance(prepared_function, dict) and isinstance(saved_function, dict):
        for field in ("name", "operation", "parameters", "returnDef", "logic", "code"):
            if field in prepared_function and saved_function.get(field) != prepared_function.get(field):
                raise BackfillError(f"保存后复核失败：function.{field} 与候选定义不一致")
    return omitted_fields


def _prepare_save_definition(definition: dict[str, Any]) -> dict[str, Any]:
    """将已通过测试的候选定义设置为自动发布状态。"""
    prepared = deepcopy(definition)
    prepared["status"] = DEFAULT_SAVE_STATUS
    return prepared


def run_react_test_and_save(
    client: MetricViewClient,
    definition: dict[str, Any],
    repair: Callable[[dict[str, Any], dict[str, Any], int], dict[str, Any] | None],
    max_rounds: int = 3,
) -> dict[str, Any]:
    """完成 test → save → queryById 复核，且只在测试成功后保存。"""
    prepared, rounds = run_react_test(client, definition, repair, max_rounds)
    prepared = _prepare_save_definition(prepared)
    save_payload = client.save(prepared)
    metric_view_id = prepared.get("id") or _extract_id(save_payload)
    if metric_view_id is None:
        matches = client.query_list(str(prepared.get("name", "")).strip())
        if len(matches) == 1:
            metric_view_id = matches[0].get("id")
    if metric_view_id is None:
        raise BackfillError("保存成功但无法确定指标视图 ID，已停止自动复核")
    saved = client.query_by_id(metric_view_id)
    omitted_fields = _verify_saved_definition(prepared, saved)
    return {
        "ok": True,
        "saved": True,
        "metricViewId": metric_view_id,
        "testRounds": rounds,
        "verification": {"ok": True, "endpoint": QUERY_BY_ID_PATH, "omittedFields": omitted_fields},
    }


def run_react_execute_and_save(
    client: MetricViewClient,
    metric_view: dict[str, Any],
    params: dict[str, Any],
    repair: Callable[[dict[str, Any], dict[str, Any], int], dict[str, Any] | None],
    max_rounds: int = 3,
) -> dict[str, Any]:
    """完成已发布视图的 testExecute → save → queryById 闭环。"""
    if max_rounds < 1 or max_rounds > 3:
        raise BackfillError("ReAct 测试轮次必须在 1 到 3 之间")
    current = deepcopy(metric_view)
    rounds: list[dict[str, Any]] = []
    for round_number in range(1, max_rounds + 1):
        observation = client.observe_test_execute(current, params)
        policy = classify_error(observation.get("errorCode"), observation.get("details")) if observation.get("ok") is not True else {}
        rounds.append({"round": round_number, "observation": observation, "policy": policy})
        if observation.get("ok") is True:
            break
        if policy.get("action") != "repair":
            break
        repaired = repair(deepcopy(current), observation, round_number)
        if repaired is None:
            break
        current = repaired
    if not rounds or rounds[-1]["observation"].get("ok") is not True:
        last = rounds[-1]["observation"] if rounds else {"errorCode": "REQUEST_FAILED"}
        last_policy = rounds[-1].get("policy") or classify_error(last.get("errorCode"), last.get("details"))
        raise ReactStopError(last, last_policy)
    current = _prepare_save_definition(current)
    save_payload = client.save(current)
    metric_view_id = current.get("id") or _extract_id(save_payload)
    if metric_view_id is None:
        raise BackfillError("保存成功但无法确定指标视图 ID，已停止自动复核")
    saved = client.query_by_id(metric_view_id)
    omitted_fields = _verify_saved_definition(current, saved)
    return {
        "ok": True,
        "saved": True,
        "metricViewId": metric_view_id,
        "testRounds": rounds,
        "verification": {"ok": True, "endpoint": QUERY_BY_ID_PATH, "omittedFields": omitted_fields},
    }


def _load_definition(path: Path) -> dict[str, Any]:
    """读取候选指标视图 JSON，并拒绝顶层数组或标量。"""
    try:
        definition = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BackfillError(f"无法读取定义文件：{path}") from exc
    if not isinstance(definition, dict):
        raise BackfillError("定义文件顶层必须是 JSON 对象")
    if not str(definition.get("name", "")).strip():
        raise BackfillError("定义文件必须包含非空 name")
    return definition


def _prepare_definition(
    client: MetricViewClient,
    candidate: dict[str, Any],
) -> tuple[dict[str, Any], str, dict[str, Any] | None]:
    """按 ID 或名称解析创建/更新模式，并保留原对象字段。"""
    if candidate.get("id") is not None:
        original = client.query_by_id(candidate["id"])
        return merge_metric_view(original, candidate), "update", deepcopy(original)

    matches = client.query_list(str(candidate["name"]).strip())
    if len(matches) > 1:
        raise BackfillError("名称匹配到多个指标视图，必须提供明确 id 后再更新")
    if len(matches) == 1:
        original = client.query_by_id(matches[0].get("id"))
        patch = dict(candidate)
        patch["id"] = original.get("id")
        return merge_metric_view(original, patch), "update", deepcopy(original)
    return candidate, "create", None


def _confirm() -> bool:
    """要求用户明确确认，避免测试成功后自动产生持久化副作用。"""
    try:
        answer = input("测试已通过。输入 yes 确认回填，其他输入取消：")
    except EOFError:
        return False
    return answer.strip().lower() == "yes"


def _run_coding_gate(definition: dict[str, Any]) -> None:
    """在远程 test 前执行代码和三层类型兼容门禁。"""
    try:
        validate_request(TEST_PATH, definition)
    except ContractViolation as exc:
        raise BackfillError(f"MetricView 定义契约门禁失败：{exc}") from exc
    function = definition.get("function")
    if not isinstance(function, dict) or not isinstance(function.get("code"), str):
        raise BackfillError("代码门禁失败：定义必须包含 function.code")
    try:
        expected_keys = extract_output_keys(function.get("returnDef"))
    except ValueError as error:
        raise BackfillError(f"输出契约门禁失败：{error}") from error
    errors = validate(
        function["code"],
        load_variables(RUNTIME_VARIABLES_PATH),
        expected_keys,
    )
    if errors:
        raise BackfillError("代码门禁失败：" + "；".join(errors))
    type_errors = validate_definition(definition)
    if type_errors:
        raise BackfillError("类型兼容门禁失败：" + "；".join(type_errors))


def run(
    definition_path: Path,
    base_url: str | None = None,
    token: str | None = None,
) -> int:
    """执行测试、确认、保存和保存后复核，输出不含敏感信息的摘要。"""
    definition = _load_definition(definition_path)
    service_url = resolve_base_url(base_url)
    trusted_token = token or getpass.getpass("请输入 X-Trusted-Token（不会回显）：")
    client = MetricViewClient(service_url, trusted_token)
    prepared, mode, original = _prepare_definition(client, definition)
    prepared = _prepare_save_definition(prepared)
    _run_coding_gate(prepared)
    client.test(prepared)
    if not _confirm():
        print(json.dumps({"ok": True, "saved": False, "mode": mode}, ensure_ascii=False))
        return 0

    if mode == "update" and original is not None:
        latest = client.query_by_id(prepared["id"])
        conflict = detect_update_conflict(original, latest, prepared.keys())
        if conflict["conflict"]:
            fields = ",".join(conflict["conflictFields"])
            raise BackfillError(f"{conflict['errorCode']}：保存前检测到冲突字段 {fields}")

    save_payload = client.save(prepared)
    metric_view_id = prepared.get("id") or _extract_id(save_payload)
    if metric_view_id is None:
        matches = client.query_list(str(prepared["name"]).strip())
        if len(matches) == 1:
            metric_view_id = matches[0].get("id")
    if metric_view_id is None:
        raise BackfillError("保存成功但无法确定指标视图 ID，已停止自动复核")
    saved = client.query_by_id(metric_view_id)
    _verify_saved_definition(prepared, saved)
    print(json.dumps({"ok": True, "saved": True, "mode": mode, "id": metric_view_id}, ensure_ascii=False))
    return 0


def main() -> int:
    """解析命令行参数并把可控错误写到 stderr。"""
    parser = argparse.ArgumentParser(description="安全回填 MetricView 定义")
    parser.add_argument("definition", type=Path, help="候选指标视图 JSON 文件")
    parser.add_argument(
        "--base-url",
        help=f"API 基础地址；默认 {DEFAULT_DATA_QUERY_BASE_URL}",
    )
    parser.add_argument("--publish", action="store_true", help="兼容旧调用；保存成功后默认自动发布")
    args = parser.parse_args()
    try:
        return run(args.definition, args.base_url)
    except BackfillError as exc:
        print(f"回填失败：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
