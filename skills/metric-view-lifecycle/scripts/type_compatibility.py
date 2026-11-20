#!/usr/bin/env python3
"""Validate the three-layer type contract used by MetricView definitions.

Author: Codex
Date: 2026-11-17
"""

from __future__ import annotations

import re
from typing import Any


_SUPPORTED_OPERATORS = frozenset({"eq", "neq", "not-eq", "gt", "gte", "lt", "lte", "like", "in"})
_ARRAY_OPERATORS = frozenset({"in"})
_DATABASE_TO_DSL = {
    "BIGINT": "long",
    "BOOLEAN": "boolean",
    "BIT": "boolean",
    "CHAR": "string",
    "DATE": "date",
    "DECIMAL": "decimal",
    "DOUBLE": "decimal",
    "FLOAT": "decimal",
    "INTEGER": "integer",
    "INT": "integer",
    "NUMERIC": "decimal",
    "REAL": "decimal",
    "SMALLINT": "integer",
    "TEXT": "string",
    "TINYINT": "integer",
    "VARCHAR": "string",
}
_DSL_TO_PARAMETER = {
    "boolean": "TYPE_STRING",
    "date": "TYPE_TIME",
    "datetime": "TYPE_TIME",
    "decimal": "TYPE_NUMBER",
    "integer": "TYPE_NUMBER",
    "long": "TYPE_NUMBER",
    "string": "TYPE_STRING",
    "local_datetime": "TYPE_TIME",
    "instant": "TYPE_TIME",
}


def _normalise_database_type(raw_type: Any) -> str | None:
    """Map JDBC or DDL type text to one canonical DSL logical type."""
    if not isinstance(raw_type, str):
        return None
    value = re.sub(r"\s+", " ", raw_type.strip().upper())
    value = re.sub(r"\([^)]*\)", "", value).strip()
    if value in {"DATETIME", "DATETIMEV2"}:
        return "local_datetime"
    if value.startswith("TIMESTAMP WITH"):
        return "instant"
    if value == "TIMESTAMP":
        return "instant"
    return _DATABASE_TO_DSL.get(value)


def _canonical_logical_type(raw_type: Any) -> str | None:
    """将 DSL 逻辑类型归一化为关系查询 v1 的类型名称。"""
    if not isinstance(raw_type, str):
        return None
    value = raw_type.strip().lower()
    if value == "datetime":
        return "local_datetime"
    return value


def _field_database_type(field_spec: Any) -> Any:
    """Read a type string from a scalar field entry or a metadata object."""
    if isinstance(field_spec, str):
        return field_spec
    if isinstance(field_spec, dict):
        for key in ("ddlType", "jdbcType", "databaseType", "type"):
            if field_spec.get(key) is not None:
                return field_spec[key]
    return None


def _parameter_type(parameter: Any) -> str | None:
    """Read the MetricView parameter type from supported definition shapes."""
    if not isinstance(parameter, dict):
        return None
    for key in ("type", "parameterType", "valueType"):
        value = parameter.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().upper()
    return None


def _expected_parameter_type(logical_type: str, is_array: bool) -> str | None:
    """Return the required scalar or array MetricView parameter type."""
    scalar_type = _DSL_TO_PARAMETER.get(logical_type)
    if scalar_type is None:
        return None
    return f"{scalar_type}_ARRAY" if is_array else scalar_type


def _type_context_errors(
    definition: dict[str, Any],
) -> tuple[dict[str, Any], list[Any], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """Read and validate the structured type evidence required by the gate."""
    errors: list[dict[str, Any]] = []
    context = definition.get("typeContext")
    if not isinstance(context, dict):
        function = definition.get("function")
        parameters = function.get("parameters") if isinstance(function, dict) else None
        code = function.get("code", "") if isinstance(function, dict) else ""
        if not parameters and "logicalType" not in code:
            return {}, [], {}, []
        return {}, [], {}, [{
            "message": "type evidence missing: typeContext.fields and typeContext.predicates are required",
        }]
    fields = context.get("fields")
    predicates = context.get("predicates")
    if not isinstance(fields, dict):
        errors.append({"message": "type evidence missing: typeContext.fields must be an object"})
        fields = {}
    if not isinstance(predicates, list):
        errors.append({"message": "type evidence missing: typeContext.predicates must be an array"})
        predicates = []
    if isinstance(fields, dict):
        has_time_field = any(
            _normalise_database_type(_field_database_type(field_spec))
            in {"date", "local_datetime", "instant"}
            for field_spec in fields.values()
        )
        has_timezone = any(
            isinstance(context.get(key), str) and context[key].strip()
            for key in ("timezone", "sessionTimezone")
        )
        if has_time_field and not has_timezone:
            errors.append({"message": "time evidence missing: typeContext.timezone or sessionTimezone is required"})
    function = definition.get("function")
    raw_parameters = function.get("parameters") if isinstance(function, dict) else None
    if not isinstance(raw_parameters, list):
        errors.append({"message": "type evidence missing: function.parameters must be an array"})
        raw_parameters = []
    parameters = {
        item.get("name"): item
        for item in raw_parameters
        if isinstance(item, dict) and isinstance(item.get("name"), str)
    }
    return fields, predicates, parameters, errors


def validate_definition(definition: dict[str, Any]) -> list[str]:
    """Return blocking diagnostics for DDL, DSL, and MetricView parameter types."""
    fields, predicates, parameters, errors = _type_context_errors(definition)
    for predicate in predicates:
        if not isinstance(predicate, dict):
            errors.append({"message": "type evidence invalid: every predicate must be an object"})
            continue
        field = predicate.get("field")
        parameter_name = predicate.get("parameter")
        if not isinstance(field, str) or not field.strip():
            errors.append({"message": "type evidence invalid: predicate field is required"})
            continue
        field_type = _normalise_database_type(_field_database_type(fields.get(field)))
        logical_type = _canonical_logical_type(predicate.get("logicalType"))
        if field_type is None:
            errors.append({"message": f"field {field}: database type evidence is missing or unsupported"})
            continue
        if logical_type != field_type:
            errors.append(
                {
                    "message": (
                        f"field {field} parameter {parameter_name}: expected {field_type}, "
                        f"actual {logical_type}"
                    )
                }
            )
        parameter = parameters.get(parameter_name)
        if parameter is None:
            errors.append({"message": f"parameter {parameter_name}: definition is missing"})
            continue
        operator = str(predicate.get("operator", "eq")).strip().lower()
        if operator not in _SUPPORTED_OPERATORS:
            errors.append({"message": f"field {field}: operator {operator} is not supported by relational-query v1"})
        expected_parameter = _expected_parameter_type(
            field_type,
            operator in _ARRAY_OPERATORS,
        )
        actual_parameter = _parameter_type(parameter)
        if expected_parameter != actual_parameter:
            errors.append(
                {
                    "message": (
                        f"field {field} parameter {parameter_name}: expected {expected_parameter}, "
                        f"actual {actual_parameter}"
                    )
                }
            )
    return [entry["message"] for entry in errors]
