#!/usr/bin/env python3
"""验证多指标、更新冲突、阻断报告和时间语义边界。"""

from __future__ import annotations

import unittest

from lifecycle_boundaries import (
    build_blocking_report,
    detect_update_conflict,
    split_metric_views,
    validate_time_window,
)


class LifecycleBoundariesTest(unittest.TestCase):
    """覆盖生命周期中容易被隐式猜测的边界。"""

    def test_different_output_schemas_are_split_into_separate_views(self) -> None:
        """不同最终结构不能塞进一个 returnDef。"""
        result = split_metric_views([
            {"name": "故障数", "outputKeys": ["date", "count"], "parameters": ["start"], "grain": "day", "permissionScope": "ops"},
            {"name": "故障率", "outputKeys": ["date", "rate"], "parameters": ["start"], "grain": "day", "permissionScope": "ops"},
        ])
        self.assertEqual(len(result["views"]), 2)
        self.assertEqual(result["sharedQueryGroups"], [])

    def test_compatible_metrics_may_share_query_but_keep_separate_views(self) -> None:
        """结构、参数、粒度和权限一致时只共享查询，不合并视图。"""
        metric = {"outputKeys": ["date", "count"], "parameters": ["start"], "grain": "day", "permissionScope": "ops"}
        result = split_metric_views([{**metric, "name": "故障数"}, {**metric, "name": "受影响站点数"}])
        self.assertEqual(len(result["views"]), 2)
        self.assertEqual(result["sharedQueryGroups"], [["故障数", "受影响站点数"]])

    def test_update_conflict_stops_save_and_lists_changed_fields(self) -> None:
        """线上版本变化时不自动三方合并。"""
        original = {"id": "mv-1", "version": 3, "description": "旧说明", "function": {"id": "fn-1"}}
        latest = {"id": "mv-1", "version": 4, "description": "他人说明", "function": {"id": "fn-1"}}
        result = detect_update_conflict(original, latest, modified_fields={"description"})
        self.assertTrue(result["conflict"])
        self.assertEqual(result["errorCode"], "UPDATE_CONFLICT")
        self.assertIn("version", result["conflictFields"])
        self.assertIn("description", result["conflictFields"])
        self.assertFalse(result["canCallSave"])

    def test_blocking_report_removes_credentials_and_business_rows(self) -> None:
        """阻断登记只保留安全证据，不能沉淀密码、Token 或业务行。"""
        report = build_blocking_report(
            "MYSQL_CREDENTIALS_REQUIRED",
            ["host", "readonlyPassword"],
            {"traceId": "trace-1", "host": "mysql.example.test", "password": "secret", "rows": [{"id": 1}]},
            ["test", "save"],
            "补齐只读连接信息",
            observed_at="2026-11-19T10:00:00+08:00",
        )
        self.assertEqual(report["state"], "blocked")
        self.assertEqual(report["observedAt"], "2026-11-19T10:00:00+08:00")
        self.assertEqual(report["evidence"], {"traceId": "trace-1", "host": "mysql.example.test"})
        self.assertNotIn("password", report["evidence"])
        self.assertNotIn("rows", report["evidence"])

    def test_timestamp_requires_timezone_evidence(self) -> None:
        """TIMESTAMP 映射 instant 时缺少时区证据必须阻断。"""
        with self.assertRaisesRegex(ValueError, "时区"):
            validate_time_window("instant", "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z", {})

    def test_time_window_is_left_closed_and_right_open(self) -> None:
        """时间窗口固定用 gte + lt 表达左闭右开。"""
        result = validate_time_window(
            "date",
            "2026-10-01",
            "2026-10-02",
            {"timezone": "Asia/Shanghai"},
        )
        self.assertEqual(result["operators"], ["gte", "lt"])
        with self.assertRaisesRegex(ValueError, "左闭右开"):
            validate_time_window("date", "2026-10-01", "2026-10-02", {"timezone": "Asia/Shanghai"}, operators=("between",))


if __name__ == "__main__":
    unittest.main()
