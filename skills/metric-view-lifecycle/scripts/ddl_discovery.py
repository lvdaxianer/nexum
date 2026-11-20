#!/usr/bin/env python3
"""发现并分类指标视图工作流使用的 DDL 文件。

分类只接受显式证据：目录登记、JSON catalog 或 DDL 文件头标记。
不根据表名推断本体/非本体，避免生成错误查询路由。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


class DdlDiscoveryError(RuntimeError):
    """表示 DDL 来源缺失、不可读或分类不明确。"""


_CLASSIFICATION_ALIASES = {
    "ontology": "ontology",
    "non_ontology": "non_ontology",
    "non-ontology": "non_ontology",
    "nonontology": "non_ontology",
}


def _normalize_classification(value: Any) -> str | None:
    """把用户可读的分类别名归一化为协议值。"""
    if not isinstance(value, str):
        return None
    return _CLASSIFICATION_ALIASES.get(value.strip().lower())


def _load_catalog_payload(catalog_path: Path) -> Any:
    """读取 JSON catalog，屏蔽文件系统和 JSON 解析异常。"""
    try:
        return json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DdlDiscoveryError(f"DDL catalog 不可读取或不是合法 JSON：{catalog_path}") from exc


def _catalog_entry(entry: Any) -> tuple[str, str]:
    """校验一条 catalog 记录并返回相对路径和分类。"""
    if not isinstance(entry, dict):
        raise DdlDiscoveryError("DDL catalog 的 files 项必须是对象")
    file_name = entry.get("file")
    classification = _normalize_classification(entry.get("classification"))
    if not isinstance(file_name, str) or not file_name.strip() or classification is None:
        raise DdlDiscoveryError("DDL catalog 每项必须包含合法 file 和 classification")
    return Path(file_name).as_posix(), classification


def _catalog_entries(catalog_path: Path | None) -> dict[str, str]:
    """读取可选 catalog，生成文件到分类的映射。"""
    if catalog_path is None:
        return {}
    payload = _load_catalog_payload(catalog_path)
    entries = payload.get("files") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        raise DdlDiscoveryError("DDL catalog 必须包含 files 数组")
    return dict(_catalog_entry(entry) for entry in entries)


def _directory_classification(path: Path) -> str | None:
    """从显式 ontology/non_ontology 目录名读取分类。"""
    for part in path.parts:
        classification = _normalize_classification(part)
        if classification is not None:
            return classification
    return None


def _header_classification(path: Path) -> str | None:
    """读取 SQL 文件头的 Ontomato 分类标记。"""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()[:20]
    except OSError as exc:
        raise DdlDiscoveryError(f"DDL 文件不可读取：{path}") from exc
    for line in lines:
        marker = line.strip().lower()
        if marker.startswith("-- ontomato:"):
            return _normalize_classification(marker.split(":", 1)[1].strip())
    return None


def _source_files(source: Path) -> list[Path]:
    """校验来源路径并返回递归发现的 SQL 文件。"""
    if not source.exists():
        raise DdlDiscoveryError(f"DDL 路径不存在，请提供有效路径：{source}")
    if source.is_file():
        if source.suffix.lower() != ".sql":
            raise DdlDiscoveryError(f"DDL 文件必须是 .sql：{source}")
        return [source]
    files = sorted(path for path in source.rglob("*.sql") if path.is_file())
    if not files:
        raise DdlDiscoveryError(f"DDL 路径下没有 .sql 文件，请提供 DDL 路径：{source}")
    return files


def _classify_file(path: Path, root: Path, catalog: dict[str, str]) -> str:
    """按优先级读取单个 SQL 文件的显式分类。"""
    relative = path.relative_to(root).as_posix()
    classification = catalog.get(relative) or catalog.get(path.name)
    classification = classification or _header_classification(path)
    classification = classification or _directory_classification(path.relative_to(root).parent)
    if classification is None:
        raise DdlDiscoveryError(
            f"DDL 分类不明确：{path}。请在 catalog 中登记，或在文件头加入 "
            "`-- ontomato: ontology` / `-- ontomato: non_ontology`。"
        )
    return classification


def _overall_classification(files: list[dict[str, str]]) -> str:
    """把逐文件分类汇总为 ontology、non_ontology 或 mixed。"""
    classifications = {item["classification"] for item in files}
    return next(iter(classifications)) if len(classifications) == 1 else "mixed"


def discover_ddl(source_path: Path, catalog_path: Path | None = None) -> dict[str, Any]:
    """返回 DDL 文件和分类；分类不明确时抛错，供上层反问用户。"""
    source = source_path.expanduser().resolve()
    files = _source_files(source)
    catalog = _catalog_entries(catalog_path.expanduser().resolve()) if catalog_path else {}
    root = source.parent if source.is_file() else source
    discovered = [
        {"file": str(path), "classification": _classify_file(path, root, catalog)}
        for path in files
    ]
    return {"source": str(source), "classification": _overall_classification(discovered), "files": discovered}


def _parse_args() -> argparse.Namespace:
    """解析 DDL 发现命令参数。"""
    parser = argparse.ArgumentParser(description="发现并分类混合 DDL")
    parser.add_argument("path", type=Path, help="DDL 文件或目录")
    parser.add_argument("--catalog", type=Path, help="可选的 JSON DDL catalog")
    return parser.parse_args()


def main() -> int:
    """执行 DDL 发现并输出安全的 JSON 摘要。"""
    args = _parse_args()
    try:
        print(json.dumps(discover_ddl(args.path, args.catalog), ensure_ascii=False, indent=2))
        return 0
    except DdlDiscoveryError as exc:
        print(f"DDL 发现失败：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
