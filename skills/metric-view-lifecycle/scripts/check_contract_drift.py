#!/usr/bin/env python3
"""比较 DSL engine 规范与 MetricView Skill 快照，发现协议漂移。

Author: Codex
Date: 2026-11-19
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


DEFAULT_ENGINE_ROOT = Path("/Users/lvdaxianer/workspace/my/project/dinghai/dinghai-dsl-engine")
DEFAULT_MANIFEST = Path(__file__).resolve().parents[1] / "references/contract-manifest.yaml"


def _sha256(path: Path) -> str:
    """读取文件并计算稳定 SHA-256。"""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_manifest(path: Path) -> dict[str, Any]:
    """读取 JSON-compatible YAML manifest，避免引入运行时 YAML 依赖。"""
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"manifest 不是合法 JSON-compatible YAML：{path}") from exc
    if not isinstance(value, dict):
        raise ValueError("manifest 顶层必须是对象")
    return value


def _check_file_hash(path: Path, expected: Any, label: str, errors: list[str]) -> None:
    """检查文件存在并与 manifest 哈希一致。"""
    if not path.is_file():
        errors.append(f"{label} 文件不存在：{path}")
        return
    actual = _sha256(path)
    if actual != expected:
        errors.append(f"{label} 内容漂移：manifest={expected} actual={actual}")


def check_manifest(
    manifest_path: Path,
    *,
    skill_root: Path | None = None,
    engine_root: Path | None = None,
) -> list[str]:
    """返回 manifest、engine 文件和 Skill 快照之间的漂移诊断。"""
    try:
        manifest = _load_manifest(manifest_path)
    except ValueError as exc:
        return [str(exc)]
    errors: list[str] = []
    resolved_skill_root = skill_root or manifest_path.resolve().parents[1]
    resolved_engine_root = engine_root or Path(manifest.get("engineRoot", DEFAULT_ENGINE_ROOT))
    if manifest.get("dslType") != "relational-query":
        errors.append("dslType 必须是 relational-query")
    if manifest.get("dslVersion") != 1:
        errors.append("dslVersion 必须是 1")
    syntax_path = resolved_engine_root / str(manifest.get("engineSyntaxPath", ""))
    skill_syntax_path = resolved_skill_root / str(manifest.get("skillSyntaxPath", ""))
    schema_path = resolved_engine_root / str(manifest.get("engineSchemaPath", ""))
    skill_schema_path = resolved_skill_root / str(manifest.get("skillSchemaPath", ""))
    hashes = manifest.get("sourceSha256")
    if not isinstance(hashes, dict):
        return errors + ["sourceSha256 必须是对象"]
    _check_file_hash(syntax_path, hashes.get("engineSyntax"), "engineSyntax", errors)
    _check_file_hash(skill_syntax_path, hashes.get("skillSyntax"), "skillSyntax", errors)
    _check_file_hash(schema_path, hashes.get("engineSchema"), "engineSchema", errors)
    _check_file_hash(skill_schema_path, hashes.get("skillSchema"), "skillSchema", errors)
    if syntax_path.is_file() and skill_syntax_path.is_file() and _sha256(syntax_path) != _sha256(skill_syntax_path):
        errors.append("DSL syntax engine 与 Skill 快照不一致")
    if schema_path.is_file() and skill_schema_path.is_file() and _sha256(schema_path) != _sha256(skill_schema_path):
        errors.append("DSL schema engine 与 Skill 快照不一致")
    for path, label in ((schema_path, "engineSchema"), (skill_schema_path, "skillSchema")):
        if not path.is_file():
            continue
        try:
            schema = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            errors.append(f"{label} 不是合法 JSON")
            continue
        if schema.get("$id") != manifest.get("schemaId"):
            errors.append(f"{label} schemaId 与 manifest 不一致")
    return errors


def main() -> int:
    """执行命令行漂移检查并以稳定文本报告结果。"""
    parser = argparse.ArgumentParser(description="检查 DSL engine 与 MetricView Skill 契约漂移")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--engine-root", type=Path)
    parser.add_argument("--skill-root", type=Path)
    args = parser.parse_args()
    errors = check_manifest(args.manifest, skill_root=args.skill_root, engine_root=args.engine_root)
    if errors:
        print(json.dumps({"ok": False, "errors": errors}, ensure_ascii=False))
        return 1
    print(json.dumps({"ok": True, "manifest": str(args.manifest)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
