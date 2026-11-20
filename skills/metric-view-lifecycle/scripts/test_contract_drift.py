#!/usr/bin/env python3
"""验证 DSL engine 与 Skill 快照的版本和内容漂移检查。"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from check_contract_drift import check_manifest


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "references/contract-manifest.yaml"


class ContractDriftTest(unittest.TestCase):
    """覆盖快照一致、哈希漂移和 Schema ID 漂移。"""

    def test_current_engine_and_skill_snapshots_match_manifest(self) -> None:
        """当前 engine 文档、Schema 和 Skill 快照应完全一致。"""
        self.assertEqual(check_manifest(MANIFEST), [])

    def test_content_hash_drift_is_reported(self) -> None:
        """快照修改后必须返回非空错误。"""
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        manifest["sourceSha256"]["skillSyntax"] = "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory) / "manifest.yaml"
            candidate.write_text(json.dumps(manifest), encoding="utf-8")
            errors = check_manifest(candidate, skill_root=ROOT)
        self.assertTrue(any("skillSyntax" in error for error in errors))

    def test_schema_id_and_version_drift_are_reported(self) -> None:
        """Schema ID 或 DSL 版本声明不一致时必须阻断。"""
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        manifest["schemaId"] = "https://example.invalid/other.json"
        manifest["dslVersion"] = 2
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory) / "manifest.yaml"
            candidate.write_text(json.dumps(manifest), encoding="utf-8")
            errors = check_manifest(candidate, skill_root=ROOT)
        self.assertTrue(any("schemaId" in error or "dslVersion" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
