#!/usr/bin/env python3
"""集中验证指标视图本体/非本体 DSL 路由策略。"""

from __future__ import annotations

from collections.abc import Iterable


ONTOLOGY_PATH = "/dsl/execute"
UNIFIED_PATH = "/metricView/dsl/execute"


def choose_execution_path(source_kinds: Iterable[str]) -> str:
    """全部对象为本体时走旧接口，否则走统一结构化 DSL 接口。"""
    kinds = {kind.strip().lower() for kind in source_kinds}
    if not kinds or kinds <= {"ontology"}:
        return ONTOLOGY_PATH
    if kinds <= {"ontology", "non_ontology"}:
        return UNIFIED_PATH
    raise ValueError("来源类型只能是 ontology 或 non_ontology")
