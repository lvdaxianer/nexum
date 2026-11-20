#!/usr/bin/env python3
"""校验 MetricView 定义和管理接口请求体，不访问网络。

Author: Codex
Date: 2026-11-19
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any


KNOWN_STATUS_VALUES = frozenset({"PENDING_REVIEW", "PUBLISHED"})
KNOWN_OPERATION_VALUES = frozenset({"OPERATION_READ"})
PARAMETER_TYPE_PATTERN = re.compile(r"^TYPE_(STRING|NUMBER|TIME)(?:_ARRAY)?$")
ENDPOINTS = frozenset({"queryList", "queryById", "test", "testExecute", "save"})


class ContractViolation(ValueError):
    """表示定义或请求体违反本地 MetricView 契约。"""

    def __init__(self, errors: list[str] | str) -> None:
        """保留安全、可定位且不含业务值的字段诊断。"""
        self.errors = [errors] if isinstance(errors, str) else errors
        super().__init__("；".join(self.errors))


def _require_object(value: Any, path: str, errors: list[str]) -> dict[str, Any] | None:
    """要求值为 JSON 对象并返回可供后续校验的字典。"""
    if not isinstance(value, Mapping):
        errors.append(f"{path} 必须是对象")
        return None
    return dict(value)


def _require_text(value: Any, path: str, errors: list[str]) -> None:
    """要求字段为非空字符串。"""
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path} 必须是非空字符串")


def _validate_parameters(function: dict[str, Any], errors: list[str]) -> None:
    """校验参数数组、唯一名称和登记过的参数类型。"""
    parameters = function.get("parameters")
    if not isinstance(parameters, list):
        errors.append("function.parameters 必须是数组")
        return
    names: set[str] = set()
    for index, parameter in enumerate(parameters):
        item = _require_object(parameter, f"function.parameters[{index}]", errors)
        if item is None:
            continue
        name = item.get("name")
        _require_text(name, f"function.parameters[{index}].name", errors)
        if isinstance(name, str) and name.strip() in names:
            errors.append(f"function.parameters[{index}].name 参数名重复")
        if isinstance(name, str) and name.strip():
            names.add(name.strip())
        parameter_type = item.get("type")
        if not isinstance(parameter_type, str) or not PARAMETER_TYPE_PATTERN.fullmatch(parameter_type.strip().upper()):
            errors.append(f"function.parameters[{index}].type 未登记：{parameter_type}")


def _validate_return_definition(function: dict[str, Any], errors: list[str]) -> None:
    """校验最终输出字段列表，防止把 DDL 或 DSL 中间字段当成结果。"""
    return_def = _require_object(function.get("returnDef"), "function.returnDef", errors)
    if return_def is None:
        return
    refs = return_def.get("outKeyRefs")
    if not isinstance(refs, list) or not refs:
        errors.append("function.returnDef.outKeyRefs 必须是非空数组")
        return
    keys: set[str] = set()
    for index, reference in enumerate(refs):
        if isinstance(reference, str):
            key = reference.strip()
        elif isinstance(reference, Mapping):
            key = reference.get("key", "")
            key = key.strip() if isinstance(key, str) else ""
        else:
            key = ""
        if not key:
            errors.append(f"function.returnDef.outKeyRefs[{index}].key 必须是非空字符串")
        elif key in keys:
            errors.append(f"function.returnDef.outKeyRefs[{index}].key 字段重复：{key}")
        else:
            keys.add(key)


def _validate_type_context(definition: dict[str, Any], errors: list[str]) -> None:
    """校验类型证据容器，但不把数据库类型猜测成后端枚举。"""
    context = _require_object(definition.get("typeContext"), "typeContext", errors)
    if context is None:
        return
    if not isinstance(context.get("fields"), Mapping):
        errors.append("typeContext.fields 必须是对象")
    if not isinstance(context.get("predicates"), list):
        errors.append("typeContext.predicates 必须是数组")


def validate_definition(
    definition: dict[str, Any],
    mode: str = "create",
    *,
    authoritative_values: Mapping[str, set[str] | frozenset[str]] | None = None,
) -> None:
    """校验创建、更新或测试使用的完整 MetricView 定义。"""
    if mode not in {"create", "update", "test", "testExecute", "save"}:
        raise ContractViolation(f"mode 不支持：{mode}")
    errors: list[str] = []
    candidate = _require_object(definition, "metricView", errors)
    if candidate is None:
        raise ContractViolation(errors)
    for field in ("name", "description", "status", "type", "origin", "function"):
        if field not in candidate:
            errors.append(f"缺少 {field}")
    if mode == "update" and (candidate.get("id") is None or not str(candidate.get("id")).strip()):
        errors.append("更新定义必须包含稳定 id")
    _require_text(candidate.get("name"), "name", errors)
    _require_text(candidate.get("description"), "description", errors)
    _require_text(candidate.get("status"), "status", errors)
    _require_text(candidate.get("type"), "type", errors)
    _require_text(candidate.get("origin"), "origin", errors)
    status = candidate.get("status")
    status_values = (authoritative_values or {}).get("status", KNOWN_STATUS_VALUES)
    if isinstance(status, str) and status not in status_values:
        errors.append(f"status 未有权威来源证据：{status}")
    function = _require_object(candidate.get("function"), "function", errors)
    if function is not None:
        for field in ("name", "operation", "parameters", "returnDef", "logic", "code"):
            if field not in function:
                errors.append(f"缺少 function.{field}")
        for field in ("name", "operation", "logic", "code"):
            _require_text(function.get(field), f"function.{field}", errors)
        operation = function.get("operation")
        operation_values = (authoritative_values or {}).get("operation", KNOWN_OPERATION_VALUES)
        if isinstance(operation, str) and operation not in operation_values:
            errors.append(f"function.operation 未有权威来源证据：{operation}")
        _validate_parameters(function, errors)
        _validate_return_definition(function, errors)
    _validate_type_context(candidate, errors)
    if errors:
        raise ContractViolation(errors)


def _endpoint_name(endpoint: str) -> str:
    """兼容完整路径和文档中的端点短名。"""
    name = endpoint.rsplit("/", 1)[-1]
    if name not in ENDPOINTS:
        raise ContractViolation(f"不支持的 MetricView 端点：{endpoint}")
    return name


def _require_exact_keys(body: Mapping[str, Any], expected: set[str], endpoint: str, errors: list[str]) -> None:
    """拒绝端点包装层中未登记的字段，避免请求体颗粒度漂移。"""
    actual = set(body)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing:
        errors.append(f"{endpoint} 缺少字段：{','.join(missing)}")
    if extra:
        errors.append(f"{endpoint} 存在未登记字段：{','.join(extra)}")


def validate_request(endpoint: str, body: dict[str, Any]) -> None:
    """校验管理接口请求体，并在失败时抛出字段级契约诊断。"""
    name = _endpoint_name(endpoint)
    errors: list[str] = []
    request = _require_object(body, name, errors)
    if request is None:
        raise ContractViolation(errors)
    if name == "queryList":
        _require_exact_keys(request, {"name"}, name, errors)
        _require_text(request.get("name"), "queryList.name", errors)
    elif name == "queryById":
        _require_exact_keys(request, {"id"}, name, errors)
        if request.get("id") is None or not str(request.get("id")).strip():
            errors.append("queryById.id 必须存在")
    elif name == "test":
        try:
            validate_definition(request, mode="update" if request.get("id") is not None else "test")
        except ContractViolation as violation:
            errors.extend(f"test：{issue}" for issue in violation.errors)
    elif name == "testExecute":
        _require_exact_keys(request, {"metricView", "param"}, name, errors)
        metric_view = _require_object(request.get("metricView"), "testExecute.metricView", errors)
        if metric_view is not None:
            try:
                validate_definition(metric_view, mode="testExecute")
            except ContractViolation as violation:
                errors.extend(f"testExecute.metricView：{issue}" for issue in violation.errors)
        if not isinstance(request.get("param"), Mapping):
            errors.append("testExecute.param 必须是对象")
    elif name == "save":
        try:
            validate_definition(request, mode="update" if request.get("id") is not None else "save")
        except ContractViolation as violation:
            errors.extend(f"save：{issue}" for issue in violation.errors)
    if errors:
        raise ContractViolation(errors)
