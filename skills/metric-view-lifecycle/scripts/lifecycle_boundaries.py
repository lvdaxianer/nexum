#!/usr/bin/env python3
"""校验多指标拆分、更新冲突、阻断登记和统一时间语义。

Author: Codex
Date: 2026-11-19
"""

from __future__ import annotations

from datetime import datetime, timezone
import re
from collections.abc import Iterable, Mapping
from typing import Any


_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_LOCAL_DATETIME = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$")
_INSTANT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")
_SAFE_EVIDENCE_KEYS = frozenset({
    "traceId", "host", "path", "field", "table", "errorCode", "state", "mode",
    "status", "version", "updatedAt", "timezone", "sessionTimezone",
})
_SENSITIVE_KEY_PARTS = ("password", "token", "secret", "credential", "rows", "data", "value")


def _metric_group_key(metric: Mapping[str, Any]) -> tuple[Any, ...]:
    """生成可以共享查询的结构键，不包含指标名称。"""
    return (
        tuple(metric.get("outputKeys", [])),
        tuple(metric.get("parameters", [])),
        metric.get("grain"),
        metric.get("permissionScope"),
    )


def split_metric_views(metrics: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """为每个最终输出结构保留独立视图，并标记可共享的查询组。"""
    materialized = [dict(metric) for metric in metrics]
    groups: dict[tuple[Any, ...], list[str]] = {}
    for metric in materialized:
        name = str(metric.get("name", "")).strip()
        if not name:
            raise ValueError("每个指标必须有名称")
        groups.setdefault(_metric_group_key(metric), []).append(name)
    shared = [names for names in groups.values() if len(names) > 1]
    return {"views": [{"name": metric["name"], "sharedQuery": len(groups[_metric_group_key(metric)]) > 1} for metric in materialized], "sharedQueryGroups": shared}


def detect_update_conflict(
    original: Mapping[str, Any],
    latest: Mapping[str, Any],
    modified_fields: Iterable[str] = (),
) -> dict[str, Any]:
    """比较保存前快照，冲突时返回 UPDATE_CONFLICT 且禁止保存。"""
    intended = set(modified_fields)
    conflict_fields: set[str] = set()
    for field in set(original) | set(latest):
        if original.get(field) != latest.get(field):
            conflict_fields.add(field)
        elif field in intended and original.get(field) != latest.get(field):
            conflict_fields.add(field)
    original_function = original.get("function") if isinstance(original.get("function"), Mapping) else {}
    latest_function = latest.get("function") if isinstance(latest.get("function"), Mapping) else {}
    if original_function.get("id") != latest_function.get("id"):
        conflict_fields.add("function.id")
    conflicts = sorted(conflict_fields)
    if conflicts:
        return {
            "conflict": True,
            "errorCode": "UPDATE_CONFLICT",
            "conflictFields": conflicts,
            "canCallSave": False,
            "nextAction": "重新读取最新对象并由用户决定覆盖或重新生成，不自动三方合并",
        }
    return {"conflict": False, "errorCode": None, "conflictFields": [], "canCallSave": True}


def _safe_evidence(evidence: Mapping[str, Any]) -> dict[str, Any]:
    """筛选不含凭据、业务行和完整请求值的短证据。"""
    safe: dict[str, Any] = {}
    for key, value in evidence.items():
        key_text = str(key)
        if key_text not in _SAFE_EVIDENCE_KEYS or any(part in key_text.lower() for part in _SENSITIVE_KEY_PARTS):
            continue
        if isinstance(value, (str, int, float, bool)) and len(str(value)) <= 160:
            safe[key_text] = value
    return safe


def build_blocking_report(
    reason_code: str,
    required_inputs: Iterable[str],
    evidence: Mapping[str, Any],
    forbidden_actions: Iterable[str],
    resume_condition: str,
    observed_at: str | None = None,
) -> dict[str, Any]:
    """生成可沉淀的阻断登记，不写入凭据或业务数据。"""
    timestamp = observed_at or datetime.now(timezone.utc).isoformat()
    return {
        "state": "blocked",
        "reasonCode": str(reason_code)[:80],
        "observedAt": timestamp,
        "requiredInputs": [str(item)[:80] for item in required_inputs],
        "evidence": _safe_evidence(evidence),
        "forbiddenActions": [str(item)[:80] for item in forbidden_actions],
        "resumeCondition": str(resume_condition)[:200],
    }


def _timezone_from_context(context: Mapping[str, Any]) -> str | None:
    """读取时区证据，不猜测本地时区。"""
    value = context.get("timezone") or context.get("sessionTimezone")
    return value.strip() if isinstance(value, str) and value.strip() else None


def validate_time_window(
    logical_type: str,
    start: str,
    end: str,
    context: Mapping[str, Any],
    operators: tuple[str, ...] = ("gte", "lt"),
) -> dict[str, Any]:
    """校验 date/local_datetime/instant 的格式、时区和左闭右开边界。"""
    normalized = str(logical_type).strip().lower()
    timezone_name = _timezone_from_context(context)
    if operators != ("gte", "lt"):
        raise ValueError("时间窗口必须使用左闭右开 gte + lt")
    if normalized == "date":
        valid_format = bool(_DATE.fullmatch(start) and _DATE.fullmatch(end))
    elif normalized == "local_datetime":
        valid_format = bool(_LOCAL_DATETIME.fullmatch(start) and _LOCAL_DATETIME.fullmatch(end))
    elif normalized == "instant":
        valid_format = bool(_INSTANT.fullmatch(start) and _INSTANT.fullmatch(end))
    else:
        raise ValueError(f"不支持的时间 logicalType：{logical_type}")
    if not valid_format:
        raise ValueError(f"{normalized} 时间格式不合法")
    if timezone_name is None:
        raise ValueError(f"{normalized} 时间缺少时区证据")
    if start >= end:
        raise ValueError("时间窗口开始必须早于结束")
    return {"logicalType": normalized, "operators": ["gte", "lt"], "start": start, "end": end, "timezone": timezone_name}
