#!/usr/bin/env python3
"""验证指标视图回填 helper 的安全顺序和更新字段保留行为。"""

from __future__ import annotations

import json
import threading
import unittest
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backfill_metric_view import (
    BackfillError,
    DEFAULT_DATA_QUERY_BASE_URL,
    MetricViewClient,
    resolve_base_url,
    run,
    run_react_execute_and_save,
    run_react_test,
    run_react_test_and_save,
)


# 回填测试复用经过同一硬门禁的标准 fixture，避免测试样例绕过生产 Gate。
VALID_CODE = (Path(__file__).resolve().parents[1] / "evals/fixtures/valid_metric_view.py").read_text(encoding="utf-8")
VALID_RETURN_DEF = {"outKeyRefs": [{"key": "time"}, {"key": "value"}]}
VALID_TYPE_CONTEXT = {
    "fields": {"m.region": "VARCHAR"},
    "predicates": [{
        "field": "m.region",
        "operator": "eq",
        "parameter": "region",
        "logicalType": "string",
    }],
}
VALID_FUNCTION_PARAMETERS = [{"name": "region", "type": "TYPE_STRING"}]


def make_definition(
    name: str = "按区域查询",
    code: str = VALID_CODE,
    status: str = "PENDING_REVIEW",
    metric_view_id: str | None = None,
) -> dict:
    """构造满足完整 MetricView 契约的测试定义。"""
    definition = {
        "name": name,
        "description": f"{name}指标",
        "status": status,
        "type": "METRIC_VIEW",
        "origin": "CUSTOM",
        "matchQuestions": [name],
        "typeContext": deepcopy(VALID_TYPE_CONTEXT),
        "function": {
            "name": name,
            "operation": "OPERATION_READ",
            "parameters": deepcopy(VALID_FUNCTION_PARAMETERS),
            "returnDef": deepcopy(VALID_RETURN_DEF),
            "logic": "按区域过滤并返回指标值",
            "code": code,
        },
    }
    if metric_view_id is not None:
        definition["id"] = metric_view_id
        definition["function"]["id"] = "fn-1"
    return definition


class _Handler(BaseHTTPRequestHandler):
    """提供不访问外部系统的最小指标视图管理接口。"""

    calls: list[str] = []
    existing: list[dict] = []
    stored = make_definition("按光路查询", "old-code", metric_view_id="mv-1")
    stored["description"] = "原说明"
    save_without_data = False
    drop_type_context = False
    react_test_calls = 0

    def do_POST(self) -> None:  # noqa: N802
        """按回填顺序响应列表、测试、保存和详情查询。"""
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        self.__class__.calls.append(self.path)
        if self.path == "/metricView/queryList":
            payload = {"data": self.__class__.existing}
        elif self.path == "/metricView/queryById":
            stored = dict(self.__class__.stored)
            if self.__class__.drop_type_context:
                stored.pop("typeContext", None)
            payload = {"data": stored}
        elif self.path == "/metricView/test":
            function_id = body["function"].get("id")
            if function_id is not None and function_id != "fn-1":
                self.send_error(400)
                return
            if body.get("function", {}).get("code") == "bad-code":
                payload = {
                    "success": False,
                    "errorCode": "UNKNOWN_FIELD",
                    "message": "DSL 字段解析失败",
                    "details": {
                        "field": "t.stat_time",
                        "table": "fact_wireless_outage_timeline",
                        "path": "payload.where[1].field",
                    },
                    "traceId": "react-trace-1",
                }
            elif body.get("function", {}).get("code") == "output-bad":
                payload = {
                    "success": False,
                    "errorCode": "METRIC_VIEW_OUTPUT_SCHEMA_MISMATCH",
                    "message": "最终 answer 行字段不一致",
                    "details": {
                        "stage": "OUTPUT_SCHEMA_VALIDATE",
                        "expectedKeys": ["time", "value"],
                        "actualKeys": ["data"],
                        "missingKeys": ["time", "value"],
                        "unexpectedKeys": ["data"],
                        "rowIndex": 0,
                    },
                    "traceId": "output-trace-1",
                }
            else:
                payload = {"data": {"answer": []}}
        elif self.path == "/metricView/testExecute":
            code = body.get("metricView", {}).get("function", {}).get("code")
            if code == "bad-code":
                payload = {
                    "success": False,
                    "errorCode": "PARAMETER_FIELD_TYPE_MISMATCH",
                    "message": "指标视图参数类型不兼容",
                    "details": {
                        "parameter": "startTime",
                        "expectedType": "TYPE_DATETIME",
                        "actualType": "TYPE_STRING",
                        "path": "$.param.startTime",
                    },
                    "traceId": "execute-trace-1",
                }
            else:
                payload = {"data": {"answer": []}}
        elif self.path == "/metricView/save":
            body["id"] = body.get("id", "mv-new")
            self.__class__.stored = body
            payload = {"success": True}
            if not self.__class__.save_without_data:
                payload["data"] = {"id": body["id"]}
        else:
            self.send_error(404)
            return
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: object) -> None:
        """测试服务不输出请求体或 Token。"""
        return


class BackfillMetricViewTest(unittest.TestCase):
    """覆盖更新保留字段、确认后保存和保存后复核。"""

    def setUp(self) -> None:
        _Handler.calls = []
        _Handler.existing = [_Handler.stored]
        _Handler.save_without_data = False
        _Handler.drop_type_context = False
        _Handler.react_test_calls = 0
        _Handler.stored = make_definition("按光路查询", "old-code", metric_view_id="mv-1")
        _Handler.stored["description"] = "原说明"

    def test_recheck_allows_backend_omitting_type_context(self) -> None:
        """后端不持久化 typeContext 时应记录而不是误报复核失败。"""
        _Handler.drop_type_context = True
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = MetricViewClient(f"http://127.0.0.1:{server.server_port}", "test-token")
            definition = make_definition(metric_view_id="mv-1")
            definition["typeContext"] = {"fields": {"x": "DATE"}, "predicates": []}
            result = run_react_test_and_save(client, definition, lambda _candidate, _observation, _round: None)
            self.assertEqual(result["verification"]["omittedFields"], ["typeContext"])
        finally:
            server.shutdown()
            server.server_close()

    def test_default_base_url_is_the_configured_environment(self) -> None:
        self.assertEqual(
            resolve_base_url(None),
            DEFAULT_DATA_QUERY_BASE_URL,
        )

    def test_explicit_base_url_still_overrides_default(self) -> None:
        self.assertEqual(
            resolve_base_url("https://example.test/api/data-query"),
            "https://example.test/api/data-query",
        )

    def test_update_is_tested_before_save_and_preserves_stable_fields(self) -> None:
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with TemporaryDirectory() as directory:
                definition = Path(directory) / "definition.json"
                update_candidate = make_definition("按光路查询")
                update_candidate.pop("description")
                definition.write_text(
                    json.dumps(update_candidate),
                    encoding="utf-8",
                )
                with patch("backfill_metric_view.input", return_value="yes"):
                    result = run(
                        definition,
                        f"http://127.0.0.1:{server.server_port}",
                        "test-token",
                    )
            self.assertEqual(result, 0)
            self.assertLess(_Handler.calls.index("/metricView/test"), _Handler.calls.index("/metricView/save"))
            self.assertEqual(_Handler.stored["id"], "mv-1")
            self.assertEqual(_Handler.stored["function"]["id"], "fn-1")
            self.assertEqual(_Handler.stored["function"]["returnDef"], VALID_RETURN_DEF)
            self.assertEqual(_Handler.stored["function"]["code"], VALID_CODE)
            self.assertEqual(_Handler.stored["description"], "原说明")
        finally:
            server.shutdown()
            server.server_close()

    def test_create_defaults_to_published(self) -> None:
        _Handler.existing = []
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with TemporaryDirectory() as directory:
                definition = Path(directory) / "definition.json"
                definition.write_text(
                    json.dumps(make_definition("待审核指标")),
                    encoding="utf-8",
                )
                with patch("backfill_metric_view.input", return_value="yes"):
                    result = run(
                        definition,
                        f"http://127.0.0.1:{server.server_port}",
                        "test-token",
                    )
            self.assertEqual(result, 0)
            self.assertEqual(_Handler.stored["status"], "PUBLISHED")
        finally:
            server.shutdown()
            server.server_close()

    def test_pending_definition_is_published_on_save(self) -> None:
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with TemporaryDirectory() as directory:
                definition = Path(directory) / "definition.json"
                definition.write_text(
                    json.dumps(make_definition("自动发布指标", status="PENDING_REVIEW")),
                    encoding="utf-8",
                )
                with patch("backfill_metric_view.input", return_value="yes"):
                    result = run(definition, f"http://127.0.0.1:{server.server_port}", "test-token")
            self.assertEqual(result, 0)
            self.assertEqual(_Handler.stored["status"], "PUBLISHED")
        finally:
            server.shutdown()
            server.server_close()

    def test_cancel_does_not_save(self) -> None:
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with TemporaryDirectory() as directory:
                definition = Path(directory) / "definition.json"
                definition.write_text(
                    json.dumps(make_definition("按光路查询")),
                    encoding="utf-8",
                )
                with patch("backfill_metric_view.input", return_value="no"):
                    result = run(
                        definition,
                        f"http://127.0.0.1:{server.server_port}",
                        "test-token",
                    )
            self.assertEqual(result, 0)
            self.assertNotIn("/metricView/save", _Handler.calls)
        finally:
            server.shutdown()
            server.server_close()

    def test_create_when_name_is_not_found(self) -> None:
        _Handler.existing = []
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with TemporaryDirectory() as directory:
                definition = Path(directory) / "definition.json"
                definition.write_text(
                    json.dumps(make_definition("新指标视图")),
                    encoding="utf-8",
                )
                with patch("backfill_metric_view.input", return_value="yes"):
                    result = run(
                        definition,
                        f"http://127.0.0.1:{server.server_port}",
                        "test-token",
                    )
            self.assertEqual(result, 0)
            self.assertEqual(_Handler.stored["id"], "mv-new")
            self.assertEqual(_Handler.stored["name"], "新指标视图")
        finally:
            server.shutdown()
            server.server_close()

    def test_code_gate_failure_stops_before_test_and_save(self) -> None:
        """代码门禁失败时不得触发远程测试或保存。"""
        _Handler.existing = []
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with TemporaryDirectory() as directory:
                definition = Path(directory) / "definition.json"
                definition.write_text(
                    json.dumps({
                        "name": "门禁失败指标",
                        "function": {"code": "def main():\n    pass\n"},
                    }),
                    encoding="utf-8",
                )
                with self.assertRaises(BackfillError):
                    run(
                        definition,
                        f"http://127.0.0.1:{server.server_port}",
                        "test-token",
                    )
            self.assertNotIn("/metricView/test", _Handler.calls)
            self.assertNotIn("/metricView/save", _Handler.calls)
        finally:
            server.shutdown()
            server.server_close()

    def test_successful_save_without_data_is_rechecked(self) -> None:
        """保存成功但没有 data 时仍应通过详情查询完成复核。"""
        _Handler.existing = [_Handler.stored]
        _Handler.save_without_data = True
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with TemporaryDirectory() as directory:
                definition = Path(directory) / "definition.json"
                definition.write_text(
                    json.dumps(make_definition("无 data 保存响应", metric_view_id="mv-1")),
                    encoding="utf-8",
                )
                with patch("backfill_metric_view.input", return_value="yes"):
                    result = run(
                        definition,
                        f"http://127.0.0.1:{server.server_port}",
                        "test-token",
                    )
            self.assertEqual(result, 0)
            self.assertIn("/metricView/queryById", _Handler.calls)
        finally:
            server.shutdown()
            server.server_close()

    def test_api_error_preserves_structured_diagnostic_without_raw_traceback(self) -> None:
        """接口失败应保留错误码、诊断详情和 traceId，不能退化为异常文本。"""
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = MetricViewClient(f"http://127.0.0.1:{server.server_port}", "test-token")
            with self.assertRaises(BackfillError) as context:
                client.test(make_definition(code="bad-code"))
            error = context.exception
            self.assertEqual(error.error_code, "UNKNOWN_FIELD")
            self.assertEqual(error.details["field"], "t.stat_time")
            self.assertEqual(error.trace_id, "react-trace-1")
            self.assertNotIn("traceback", str(error).lower())
        finally:
            server.shutdown()
            server.server_close()

    def test_output_schema_error_preserves_field_diagnostic(self) -> None:
        """输出契约错误必须保留期望、实际、缺失、多余字段和 traceId。"""
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = MetricViewClient(f"http://127.0.0.1:{server.server_port}", "test-token")
            with self.assertRaises(BackfillError) as context:
                client.test(make_definition(code="output-bad"))
            error = context.exception
            self.assertEqual(error.error_code, "METRIC_VIEW_OUTPUT_SCHEMA_MISMATCH")
            self.assertEqual(error.details["actualKeys"], ["data"])
            self.assertEqual(error.details["missingKeys"], ["time", "value"])
            self.assertEqual(error.trace_id, "output-trace-1")
        finally:
            server.shutdown()
            server.server_close()

    def test_react_test_repairs_definition_between_api_rounds(self) -> None:
        """ReAct 必须重新调用接口，并只在修复后的候选通过后结束。"""
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = MetricViewClient(f"http://127.0.0.1:{server.server_port}", "test-token")

            def repair(candidate: dict, observation: dict, round_number: int) -> dict:
                self.assertEqual(round_number, 1)
                self.assertEqual(observation["errorCode"], "UNKNOWN_FIELD")
                self.assertEqual(observation["details"]["field"], "t.stat_time")
                candidate["function"]["code"] = "good-code"
                return candidate

            definition, rounds = run_react_test(
                client,
                make_definition(code="bad-code"),
                repair,
            )
            self.assertEqual(definition["function"]["code"], "good-code")
            self.assertEqual(len(rounds), 2)
            self.assertFalse(rounds[0]["observation"]["ok"])
            self.assertTrue(rounds[1]["observation"]["ok"])
        finally:
            server.shutdown()
            server.server_close()

    def test_react_test_then_save_and_query_by_id(self) -> None:
        """测试通过后必须调用 save，并用 queryById 完成复核。"""
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = MetricViewClient(f"http://127.0.0.1:{server.server_port}", "test-token")

            def repair(candidate: dict, observation: dict, round_number: int) -> dict:
                self.assertEqual(round_number, 1)
                candidate["function"]["code"] = "good-code"
                return candidate

            result = run_react_test_and_save(
                client,
                make_definition("接口保存验证", code="bad-code"),
                repair,
            )
            self.assertTrue(result["ok"])
            self.assertTrue(result["saved"])
            self.assertTrue(result["verification"]["ok"])
            self.assertEqual(result["metricViewId"], "mv-new")
            self.assertLess(_Handler.calls.index("/metricView/test"), _Handler.calls.index("/metricView/save"))
            self.assertLess(_Handler.calls.index("/metricView/save"), _Handler.calls.index("/metricView/queryById"))
            self.assertEqual(_Handler.stored["function"]["code"], "good-code")
        finally:
            server.shutdown()
            server.server_close()

    def test_published_test_execute_then_save_and_query_by_id(self) -> None:
        """已发布视图必须用 testExecute 携带参数，再保存并复核。"""
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = MetricViewClient(f"http://127.0.0.1:{server.server_port}", "test-token")

            def repair(candidate: dict, observation: dict, round_number: int) -> dict:
                self.assertEqual(round_number, 1)
                candidate["function"]["code"] = "good-code"
                return candidate

            result = run_react_execute_and_save(
                client,
                make_definition(status="PUBLISHED", code="bad-code", metric_view_id="mv-1"),
                {"startTime": "2026-10-01 00:00:00"},
                repair,
            )
            self.assertTrue(result["ok"])
            self.assertTrue(result["saved"])
            self.assertEqual(result["metricViewId"], "mv-1")
            self.assertIn("/metricView/testExecute", _Handler.calls)
            self.assertLess(_Handler.calls.index("/metricView/testExecute"), _Handler.calls.index("/metricView/save"))
            self.assertLess(_Handler.calls.index("/metricView/save"), _Handler.calls.index("/metricView/queryById"))
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
