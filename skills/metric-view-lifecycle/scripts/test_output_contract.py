#!/usr/bin/env python3
"""验证 MetricView 最终输出契约和安全诊断。"""

from __future__ import annotations

import unittest

from output_contract import (
    extract_output_keys,
    validate_answer_rows,
    validate_result_payload,
)


class OutputContractTest(unittest.TestCase):
    """覆盖目标输出结构优先于源表和 DSL 包裹层的共通规则。"""

    def test_extracts_keys_from_return_definition(self) -> None:
        """从 returnDef 的 outKeyRefs 提取最终字段顺序。"""
        return_def = {
            "outKeyRefs": [
                {"key": "date"},
                {"key": "complaints"},
                {"key": "daily_average"},
            ]
        }
        self.assertEqual(extract_output_keys(return_def), ["date", "complaints", "daily_average"])

    def test_accepts_rows_matching_target_schema(self) -> None:
        """目标字段全部存在且没有多余字段时通过。"""
        result = validate_answer_rows(
            [{"date": "2026-10-01", "complaints": 8, "daily_average": 8.53}],
            ["date", "complaints", "daily_average"],
        )
        self.assertTrue(result["ok"])

    def test_reports_nested_dsl_data_as_schema_mismatch(self) -> None:
        """不能把 DSL data 包裹层当成最终 answer 行。"""
        result = validate_answer_rows(
            [{"data": [{"time": "2026-10-01", "value": 2.7}]}],
            ["date", "complaints", "daily_average"],
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["errorCode"], "METRIC_VIEW_OUTPUT_SCHEMA_MISMATCH")
        self.assertEqual(result["actualKeys"], ["data"])
        self.assertEqual(result["missingKeys"], ["complaints", "daily_average", "date"])
        self.assertEqual(result["unexpectedKeys"], ["data"])
        self.assertEqual(result["stage"], "OUTPUT_SCHEMA_VALIDATE")

    def test_reports_missing_and_extra_fields(self) -> None:
        """缺失或多余的最终字段必须同时暴露。"""
        result = validate_answer_rows(
            [{"date": "2026-10-01", "value": 2.7}],
            ["date", "complaints"],
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["missingKeys"], ["complaints"])
        self.assertEqual(result["unexpectedKeys"], ["value"])

    def test_allows_empty_success_result_without_mocking_error(self) -> None:
        """合法空 answer 只报告空结果，不伪造结构错误。"""
        result = validate_answer_rows([], ["date", "complaints"])
        self.assertTrue(result["ok"])
        self.assertEqual(result["rowCount"], 0)
        self.assertTrue(result["emptyResult"])

    def test_validates_final_answer_envelope_not_dsl_envelope(self) -> None:
        """最终结果必须是 answer 数组，不能直接传 DSL data 包裹层。"""
        result = validate_result_payload(
            {"answer": [{"date": "2026-10-01", "complaints": 8}]},
            {"outKeyRefs": [{"key": "date"}, {"key": "complaints"}]},
        )
        self.assertTrue(result["ok"])

        invalid = validate_result_payload(
            {"data": [{"answer": [{"date": "2026-10-01", "complaints": 8}]}]},
            {"outKeyRefs": [{"key": "date"}, {"key": "complaints"}]},
        )
        self.assertFalse(invalid["ok"])
        self.assertEqual(invalid["errorCode"], "METRIC_VIEW_OUTPUT_ENVELOPE_INVALID")

    def test_rejects_duplicate_or_missing_output_keys(self) -> None:
        """returnDef 缺少或重复 key 时必须先阻断生成。"""
        with self.assertRaises(ValueError):
            extract_output_keys({"outKeyRefs": [{"key": "date"}, {"key": "date"}]})
        with self.assertRaises(ValueError):
            extract_output_keys({"outKeyRefs": [{"key": ""}]})


if __name__ == "__main__":
    unittest.main()
