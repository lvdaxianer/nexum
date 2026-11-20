#!/usr/bin/env python3
"""校验 MetricView 的最终 answer 契约并生成可供 AI 修复的安全诊断。

本模块只处理最终输出结构，不推断 DDL 字段，也不访问网络或数据库。
Author: lvdaxianer@yeah.net
Date: 2026-11-19
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any


OUTPUT_SCHEMA_ERROR = "METRIC_VIEW_OUTPUT_SCHEMA_MISMATCH"
OUTPUT_ENVELOPE_ERROR = "METRIC_VIEW_OUTPUT_ENVELOPE_INVALID"
OUTPUT_SCHEMA_STAGE = "OUTPUT_SCHEMA_VALIDATE"


def _as_mapping(value: Any, label: str) -> Mapping[str, Any]:
    """将对象或 JSON 文本转换为映射。"""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as error:
            raise ValueError(f"{label} 必须是合法 JSON") from error
    if not isinstance(value, Mapping):
        raise ValueError(f"{label} 必须是 JSON 对象")
    return value


def _unwrap_output_definition(return_def: Any) -> Mapping[str, Any]:
    """从完整定义、function 或 returnDef 中定位输出定义。"""
    definition = _as_mapping(return_def, "returnDef")
    for key, label in (("returnDef", "returnDef.returnDef"), ("function", "function")):
        nested = definition.get(key)
        if nested is not None and "outKeyRefs" not in definition:
            definition = _as_mapping(nested, label)
    nested = definition.get("returnDef")
    if nested is not None and "outKeyRefs" not in definition:
        definition = _as_mapping(nested, "function.returnDef")
    return definition


def _extract_ref_key(ref: Any, index: int) -> str:
    """读取一个 outKeyRef 的兼容 key 表达。"""
    if isinstance(ref, str):
        key = ref.strip()
    elif isinstance(ref, Mapping) and isinstance(ref.get("key"), str):
        key = ref["key"].strip()
    else:
        key = ""
    if not key:
        raise ValueError(f"returnDef.outKeyRefs[{index}].key 必须是非空字符串")
    return key


def extract_output_keys(return_def: Any) -> list[str]:
    """从 returnDef/outKeyRefs 提取最终字段，不从 DDL 或 DSL 推断。"""
    definition = _unwrap_output_definition(return_def)
    refs = definition.get("outKeyRefs")
    if not isinstance(refs, Sequence) or isinstance(refs, (str, bytes)):
        raise ValueError("returnDef.outKeyRefs 必须是数组")
    keys: list[str] = []
    for index, ref in enumerate(refs):
        key = _extract_ref_key(ref, index)
        if key in keys:
            raise ValueError(f"returnDef.outKeyRefs 存在重复字段：{key}")
        keys.append(key)
    return keys


def _envelope_error(message: str, expected_keys: list[str]) -> dict[str, Any]:
    """创建不含业务数据的输出包裹层诊断。"""
    return {
        "ok": False,
        "errorCode": OUTPUT_ENVELOPE_ERROR,
        "stage": OUTPUT_SCHEMA_STAGE,
        "message": message,
        "expectedKeys": expected_keys,
    }


def _row_schema_diagnostic(row: Any, index: int, expected: list[str]) -> dict[str, Any] | None:
    """返回单行字段错误；合法行返回 None。"""
    actual = set(row.keys()) if isinstance(row, Mapping) else set()
    if isinstance(row, Mapping) and actual == set(expected):
        return None
    return {
        "ok": False,
        "errorCode": OUTPUT_SCHEMA_ERROR,
        "stage": OUTPUT_SCHEMA_STAGE,
        "message": "最终 answer 行字段必须严格等于 returnDef.outKeyRefs",
        "rowIndex": index,
        "expectedKeys": expected,
        "actualKeys": sorted(str(key) for key in actual),
        "missingKeys": sorted(str(key) for key in set(expected) - actual),
        "unexpectedKeys": sorted(str(key) for key in actual - set(expected)),
    }


def validate_answer_rows(answer: Any, expected_keys: Sequence[str]) -> dict[str, Any]:
    """严格比较 answer 行字段和目标 outKeyRefs 字段集合。"""
    expected = list(expected_keys)
    if not isinstance(answer, list):
        return _envelope_error("最终 answer 必须是数组", expected)
    if not answer:
        return {"ok": True, "stage": OUTPUT_SCHEMA_STAGE, "rowCount": 0, "emptyResult": True}
    for index, row in enumerate(answer):
        diagnostic = _row_schema_diagnostic(row, index, expected)
        if diagnostic is not None:
            return diagnostic
    return {"ok": True, "stage": OUTPUT_SCHEMA_STAGE, "rowCount": len(answer), "emptyResult": False}


def validate_result_payload(payload: Any, return_def: Any) -> dict[str, Any]:
    """校验最终 stdout 包裹层和 answer 行，不接受 DSL data 包裹层直通。"""
    expected = extract_output_keys(return_def)
    if not isinstance(payload, Mapping) or "answer" not in payload:
        return _envelope_error("最终结果必须是包含 answer 的对象，不能直接返回 DSL data 包裹层", expected)
    result = validate_answer_rows(payload["answer"], expected)
    result.setdefault("expectedKeys", expected)
    return result
