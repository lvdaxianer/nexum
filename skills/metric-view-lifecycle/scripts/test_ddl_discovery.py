#!/usr/bin/env python3
"""验证混合 DDL 发现和分类规则。"""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from ddl_discovery import DdlDiscoveryError, discover_ddl


class DdlDiscoveryTest(unittest.TestCase):
    """DDL 来源允许混合文件，但分类必须有明确证据。"""

    def test_discovers_mixed_ddl_from_one_directory_using_headers(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "objects.sql").write_text(
                "-- ontomato: ontology\nCREATE TABLE dim_site (id BIGINT);\n",
                encoding="utf-8",
            )
            (root / "business.sql").write_text(
                "-- ontomato: non_ontology\nCREATE TABLE ticket (id BIGINT);\n",
                encoding="utf-8",
            )

            result = discover_ddl(root)

        self.assertEqual(result["classification"], "mixed")
        self.assertEqual(
            [item["classification"] for item in result["files"]],
            ["non_ontology", "ontology"],
        )

    def test_catalog_metadata_overrides_directory_layout(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            ddl = root / "customer.sql"
            ddl.write_text("CREATE TABLE customer (id BIGINT);\n", encoding="utf-8")
            catalog = root / "ddl-catalog.json"
            catalog.write_text(
                json.dumps({"files": [{"file": "customer.sql", "classification": "ontology"}]}),
                encoding="utf-8",
            )

            result = discover_ddl(root, catalog)

        self.assertEqual(result["classification"], "ontology")
        self.assertEqual(result["files"][0]["classification"], "ontology")

    def test_missing_classification_requires_user_clarification(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "unknown.sql").write_text("CREATE TABLE unknown (id BIGINT);\n", encoding="utf-8")

            with self.assertRaisesRegex(DdlDiscoveryError, "分类"):
                discover_ddl(root)

    def test_missing_or_empty_source_requires_user_path(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(DdlDiscoveryError, "DDL"):
                discover_ddl(root)

            with self.assertRaisesRegex(DdlDiscoveryError, "路径"):
                discover_ddl(root / "missing")


if __name__ == "__main__":
    unittest.main()
