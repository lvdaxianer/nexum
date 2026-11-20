#!/usr/bin/env python3
"""提供 MetricView API 错误码到 Repair/Stop 的安全决策矩阵。

Author: Codex
Date: 2026-11-19
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


_REPAIR_POLICIES: dict[str, dict[str, Any]] = {
    "UNKNOWN_FIELD": {
        "requiredDetails": ("field", "table", "path"),
        "allowedRepair": "只修复有元数据证据的字段引用或参数绑定",
    },
    "FIELD_NOT_RESOLVED": {
        "requiredDetails": ("field", "table", "path"),
        "allowedRepair": "只修复有元数据证据的字段引用或别名",
    },
    "INVALID_DSL_REQUEST": {
        "requiredDetails": ("path", "suggestion", "operator"),
        "allowedRepair": "回到 DSL Schema 修复请求结构或操作符",
    },
    "INVALID_OPERATOR": {
        "requiredDetails": ("operator", "path", "suggestion"),
        "allowedRepair": "只使用 DSL Schema 明确支持的操作符",
    },
    "PARAMETER_TYPE_MISMATCH": {
        "requiredDetails": ("parameter", "expectedType", "actualType"),
        "allowedRepair": "同时对齐 MetricView TYPE、DSL logicalType 和 typeContext",
    },
    "PARAMETER_FIELD_TYPE_MISMATCH": {
        "requiredDetails": ("parameter", "expectedType", "actualType"),
        "allowedRepair": "同时对齐 MetricView TYPE、DSL logicalType 和 typeContext",
    },
    "PARAMETER_TYPE_INVALID": {
        "requiredDetails": ("parameter", "expectedType", "actualType"),
        "allowedRepair": "只修复登记过的参数类型，不猜测新类型",
    },
    "METRIC_VIEW_OUTPUT_SCHEMA_MISMATCH": {
        "requiredDetails": ("expectedKeys", "actualKeys", "missingKeys", "unexpectedKeys"),
        "allowedRepair": "保留 returnDef，修复中间行到最终 answer 的字段映射",
    },
    "OUTPUT_SCHEMA_VALIDATE": {
        "requiredDetails": ("expectedKeys", "actualKeys"),
        "allowedRepair": "保留 returnDef，修复输出包裹层或字段映射",
    },
    "EXECUTION_TIMEOUT": {
        "requiredDetails": ("deadline", "limit", "queryRange", "scope"),
        "allowedRepair": "只检查 deadline、limit、查询范围和服务端超时证据",
    },
    "METRIC_VIEW_EXECUTION_FAILED": {
        "requiredDetails": (),
        "allowedRepair": "只有 details 或 traceId 对应的真实原因可解释时才修复",
    },
}

_STOP_CODES = frozenset({
    "TABLE_NOT_ALLOWED",
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "AUTHENTICATION_FAILED",
    "PERMISSION_DENIED",
})


def _has_required_evidence(details: Any, required_keys: tuple[str, ...]) -> bool:
    """检查诊断是否至少包含一个当前错误类型需要的安全字段。"""
    if not isinstance(details, Mapping):
        return False
    if not required_keys:
        return bool(details)
    return any(key in details and details[key] not in (None, "", [], {}) for key in required_keys)


def _stop_policy(code: str, reason: str) -> dict[str, Any]:
    """构造不可修复、不可保存的统一停止结果。"""
    return {
        "errorCode": code,
        "action": "stop",
        "evidenceRequired": True,
        "canCallSave": False,
        "allowedRepair": [],
        "reason": reason,
    }


def classify_error(error_code: str | None, details: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """根据错误码和安全诊断决定允许 Repair 或必须 Stop。"""
    code = str(error_code or "REQUEST_FAILED").strip().upper()[:80]
    if code in _STOP_CODES:
        return _stop_policy(code, "鉴权或表权限边界必须停止，不能换 Token、字段或扩大权限")
    policy = _REPAIR_POLICIES.get(code)
    if policy is None:
        return _stop_policy(code, "未登记或无可解释修复规则，保留 traceId 后停止")
    if not _has_required_evidence(details, tuple(policy["requiredDetails"])):
        return _stop_policy(code, "缺少该错误类型要求的结构化诊断，不能盲目修复")
    return {
        "errorCode": code,
        "action": "repair",
        "evidenceRequired": True,
        "canCallSave": False,
        "allowedRepair": [policy["allowedRepair"]],
        "reason": "存在可解释诊断，Repair 只能限于允许范围",
    }
