#!/usr/bin/env python3
"""验证 MetricView 真实、声明一致、合成和阻断执行模式。"""

from __future__ import annotations

import unittest

from execution_mode import decide_mode


VALID_READ_ONLY = {
    "host": "mysql.example.test",
    "port": 3306,
    "database": "dinghai",
    "schema": "metrics",
    "readonlyUser": "reader",
    "readonlyPassword": "provided-at-runtime",
    "tableScope": ["fact_outage"],
    "testScope": "2026-10-01/2026-10-31",
}


class ExecutionModeTest(unittest.TestCase):
    """覆盖无凭据终态和显式模式豁免。"""

    def test_default_without_mysql_is_blocked_and_forbids_side_effects(self) -> None:
        """没有凭据也没有豁免时必须阻断。"""
        decision = decide_mode(requested="default", mysql=None)
        self.assertEqual(decision.state, "blocked")
        self.assertEqual(decision.reason_code, "MYSQL_CREDENTIALS_REQUIRED")
        self.assertFalse(decision.can_call_remote_test)
        self.assertFalse(decision.can_call_save)
        self.assertIn("readonlyPassword", decision.required_inputs)
        self.assertIn("补齐", decision.next_action)

    def test_explicit_synthetic_mode_is_not_real_mode(self) -> None:
        """明确选择合成模式时只允许本地合成验证。"""
        decision = decide_mode(requested="synthetic_unverified", mysql=None)
        self.assertEqual(decision.state, "synthetic")
        self.assertTrue(decision.can_call_synthetic_test)
        self.assertFalse(decision.can_call_remote_test)
        self.assertFalse(decision.can_call_save)

    def test_asserted_consistency_skips_mysql_without_claiming_verification(self) -> None:
        """一致性声明模式不声称完成实时 MySQL 核验。"""
        decision = decide_mode(requested="ddl_asserted_consistent", mysql=None)
        self.assertEqual(decision.state, "asserted")
        self.assertTrue(decision.can_call_remote_test)
        self.assertTrue(decision.can_call_save)
        self.assertEqual(decision.evidence_status, "ddl_asserted_consistent")

    def test_complete_read_only_credentials_enable_real_mode(self) -> None:
        """完整只读输入进入真实模式。"""
        decision = decide_mode(requested="default", mysql=VALID_READ_ONLY)
        self.assertEqual(decision.state, "real")
        self.assertTrue(decision.can_call_remote_test)
        self.assertTrue(decision.can_call_save)
        self.assertEqual(decision.evidence_status, "mysql_verified")

    def test_incomplete_credentials_do_not_downgrade_to_synthetic(self) -> None:
        """连接信息不完整时仍然阻断而不是静默合成。"""
        decision = decide_mode(requested="default", mysql={"host": "mysql.example.test"})
        self.assertEqual(decision.state, "blocked")
        self.assertEqual(decision.reason_code, "MYSQL_CREDENTIALS_REQUIRED")
        self.assertFalse(decision.can_call_synthetic_test)

    def test_blocked_report_uses_stable_json_field_names(self) -> None:
        """阻断报告使用接口契约中的 camelCase 字段。"""
        report = decide_mode(requested="default", mysql=None).as_dict()
        self.assertEqual(report["reasonCode"], "MYSQL_CREDENTIALS_REQUIRED")
        self.assertEqual(report["requiredInputs"][0], "host")
        self.assertFalse(report["canCallRemoteTest"])
        self.assertFalse(report["canCallSave"])


if __name__ == "__main__":
    unittest.main()
