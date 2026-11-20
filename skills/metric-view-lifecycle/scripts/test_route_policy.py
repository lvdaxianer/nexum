#!/usr/bin/env python3
"""验证三种来源组合的指标视图 DSL 路由。"""

from __future__ import annotations

import unittest

from route_policy import ONTOLOGY_PATH, UNIFIED_PATH, choose_execution_path


class RoutePolicyTest(unittest.TestCase):
    """覆盖本体、非本体和混合来源。"""

    def test_ontology_only_uses_legacy_path(self) -> None:
        self.assertEqual(choose_execution_path(["ontology"]), ONTOLOGY_PATH)

    def test_non_ontology_uses_unified_path(self) -> None:
        self.assertEqual(choose_execution_path(["non_ontology"]), UNIFIED_PATH)

    def test_mixed_sources_use_unified_path(self) -> None:
        self.assertEqual(choose_execution_path(["ontology", "non_ontology"]), UNIFIED_PATH)

    def test_unknown_source_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            choose_execution_path(["sql"])


if __name__ == "__main__":
    unittest.main()
