#!/usr/bin/env python3
"""Test the registered MetricView type compatibility gate.

Author: Codex
Date: 2026-11-17
"""

from __future__ import annotations

import unittest

from type_compatibility import validate_definition


class RegisteredTypeCompatibilityTest(unittest.TestCase):
    """验证注册的 Skill 遵守 relational-query v1 类型规则。"""

    def test_timestamp_uses_instant_and_type_time(self) -> None:
        """验证 TIMESTAMP 使用 instant 和 TYPE_TIME。"""
        definition = {
            "function": {
                "parameters": [{"name": "start_time", "type": "TYPE_TIME"}],
            },
            "typeContext": {
                "fields": {"outage.start_time": "TIMESTAMP"},
                "timezone": "Asia/Shanghai",
                "predicates": [{
                    "field": "outage.start_time",
                    "operator": "gte",
                    "parameter": "start_time",
                    "logicalType": "instant",
                }],
            },
        }
        self.assertEqual(validate_definition(definition), [])

    def test_legacy_datetime_alias_remains_read_compatible(self) -> None:
        """验证历史 datetime 别名仍可读取。"""
        definition = {
            "function": {
                "parameters": [{"name": "start_time", "type": "TYPE_TIME"}],
            },
            "typeContext": {
                "fields": {"outage.start_time": "DATETIME"},
                "sessionTimezone": "Asia/Shanghai",
                "predicates": [{
                    "field": "outage.start_time",
                    "operator": "gte",
                    "parameter": "start_time",
                    "logicalType": "datetime",
                }],
            },
        }
        self.assertEqual(validate_definition(definition), [])

    def test_mismatch_reports_expected_and_actual_types(self) -> None:
        """验证类型不匹配诊断包含期望值和实际值。"""
        definition = {
            "function": {
                "parameters": [{"name": "start_time", "type": "TYPE_STRING"}],
            },
            "typeContext": {
                "fields": {"outage.start_time": "TIMESTAMP"},
                "timezone": "Asia/Shanghai",
                "predicates": [{
                    "field": "outage.start_time",
                    "operator": "gte",
                    "parameter": "start_time",
                    "logicalType": "timestamp",
                }],
            },
        }
        errors = validate_definition(definition)
        self.assertTrue(any("expected instant" in error for error in errors))
        self.assertTrue(any("actual TYPE_STRING" in error for error in errors))

    def test_timestamp_without_timezone_evidence_is_blocked(self) -> None:
        """TIMESTAMP 缺少时区证据时不能进入远程测试。"""
        definition = {
            "function": {"parameters": [{"name": "start_time", "type": "TYPE_TIME"}]},
            "typeContext": {
                "fields": {"outage.start_time": "TIMESTAMP"},
                "predicates": [{
                    "field": "outage.start_time",
                    "operator": "gte",
                    "parameter": "start_time",
                    "logicalType": "instant",
                }],
            },
        }
        errors = validate_definition(definition)
        self.assertTrue(any("timezone" in error for error in errors))

    def test_rejects_not_in_and_between(self) -> None:
        """验证引擎不支持的数组操作被拒绝。"""
        for operator in ("not_in", "between"):
            with self.subTest(operator=operator):
                definition = {
                    "function": {
                        "parameters": [{"name": "status", "type": "TYPE_STRING_ARRAY"}],
                    },
                    "typeContext": {
                        "fields": {"outage.status": "VARCHAR"},
                        "predicates": [{
                            "field": "outage.status",
                            "operator": operator,
                            "parameter": "status",
                            "logicalType": "string",
                        }],
                    },
                }
                errors = validate_definition(definition)
                self.assertTrue(any("not supported" in error for error in errors))

    def test_rejects_database_time_type(self) -> None:
        """验证数据库 TIME 类型不会被错误放行。"""
        definition = {
            "function": {
                "parameters": [{"name": "run_time", "type": "TYPE_TIME"}],
            },
            "typeContext": {
                "fields": {"outage.run_time": "TIME"},
                "predicates": [{
                    "field": "outage.run_time",
                    "operator": "eq",
                    "parameter": "run_time",
                    "logicalType": "time",
                }],
            },
        }
        errors = validate_definition(definition)
        self.assertTrue(any("unsupported" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
