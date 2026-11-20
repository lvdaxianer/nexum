#!/usr/bin/env python3
"""验证错误码的 Repair/Stop 决策和 ReAct 副作用边界。"""

from __future__ import annotations

import unittest

from error_code_matrix import classify_error
from backfill_metric_view import ReactStopError, run_react_test


class ErrorCodeMatrixTest(unittest.TestCase):
    """覆盖已知错误、诊断缺失和鉴权停止规则。"""

    def test_known_repairable_codes_have_actionable_policy(self) -> None:
        """可解释 DSL、类型和输出错误允许基于证据修复。"""
        for code, details in (
            ("UNKNOWN_FIELD", {"field": "t.created_at", "table": "fact_t", "path": "where[0]"}),
            ("INVALID_DSL_REQUEST", {"path": "payload.where[0]", "suggestion": "按 Schema 修复"}),
            ("INVALID_OPERATOR", {"operator": "contains", "path": "payload.where[0]"}),
            ("PARAMETER_TYPE_MISMATCH", {"parameter": "start", "expectedType": "TYPE_TIME", "actualType": "TYPE_STRING"}),
            ("METRIC_VIEW_OUTPUT_SCHEMA_MISMATCH", {"expectedKeys": ["time"], "actualKeys": ["data"]}),
        ):
            with self.subTest(code=code):
                policy = classify_error(code, details)
                self.assertEqual(policy["action"], "repair")
                self.assertTrue(policy["evidenceRequired"])

    def test_auth_and_permission_errors_stop_without_repair(self) -> None:
        """鉴权和表权限错误不能通过换字段或 Token 修复。"""
        for code in ("UNAUTHENTICATED", "FORBIDDEN", "TABLE_NOT_ALLOWED"):
            with self.subTest(code=code):
                policy = classify_error(code, {"table": "fact_t"})
                self.assertEqual(policy["action"], "stop")
                self.assertFalse(policy["canCallSave"])

    def test_timeout_requires_scope_evidence_and_unknown_errors_stop(self) -> None:
        """超时只有具备范围证据才允许受限修复，未知错误直接停止。"""
        repairable = classify_error("EXECUTION_TIMEOUT", {"limit": "500", "queryRange": "1d"})
        self.assertEqual(repairable["action"], "repair")
        stopped = classify_error("EXECUTION_TIMEOUT", {})
        self.assertEqual(stopped["action"], "stop")
        unknown = classify_error("SOMETHING_NEW", {"message": "内部错误"})
        self.assertEqual(unknown["action"], "stop")
        self.assertFalse(unknown["canCallSave"])

    def test_execution_failure_needs_diagnostic_before_repair(self) -> None:
        """通用执行失败没有 details 时必须保留 trace 并停止。"""
        stopped = classify_error("METRIC_VIEW_EXECUTION_FAILED", {})
        self.assertEqual(stopped["action"], "stop")
        repairable = classify_error("METRIC_VIEW_EXECUTION_FAILED", {"stage": "OUTPUT_SCHEMA_VALIDATE"})
        self.assertEqual(repairable["action"], "repair")

    def test_react_stops_before_repair_on_forbidden(self) -> None:
        """FORBIDDEN 不得调用 Repair 回调，也不得继续到 save。"""
        class ForbiddenClient:
            """返回固定权限失败的本地客户端桩。"""

            def observe_test(self, _definition: dict) -> dict:
                """返回结构化权限错误。"""
                return {
                    "ok": False,
                    "errorCode": "FORBIDDEN",
                    "details": {"table": "fact_t"},
                    "traceId": "forbidden-trace",
                }

        def repair(_candidate: dict, _observation: dict, _round: int) -> dict:
            """权限失败时如果被调用则测试失败。"""
            self.fail("FORBIDDEN 不得进入 Repair")

        with self.assertRaises(ReactStopError) as context:
            run_react_test(ForbiddenClient(), {}, repair)
        self.assertEqual(context.exception.error_code, "FORBIDDEN")
        self.assertEqual(context.exception.trace_id, "forbidden-trace")


if __name__ == "__main__":
    unittest.main()
