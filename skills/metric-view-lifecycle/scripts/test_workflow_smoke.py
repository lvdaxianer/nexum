#!/usr/bin/env python3
"""验证 Skill 的变量目录、Python 执行和 MetricView 回填组合链路。"""

from __future__ import annotations

import unittest

from workflow_smoke import run_smoke


class WorkflowSmokeTest(unittest.TestCase):
    """组合服务必须返回不含敏感值的目录并完成保存后复核。"""

    def test_complete_local_chain(self) -> None:
        result = run_smoke()

        self.assertTrue(result["catalog_ok"])
        self.assertTrue(result["python_ok"])
        self.assertTrue(result["metric_view_ok"])
        self.assertLess(result["test_index"], result["save_index"])
        self.assertLess(result["save_index"], result["query_by_id_index"])


if __name__ == "__main__":
    unittest.main()
