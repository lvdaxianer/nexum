#!/usr/bin/env python3
"""统一决定 MetricView 的真实、声明一致、合成或阻断执行模式。

Author: Codex
Date: 2026-11-19
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from collections.abc import Mapping
from typing import Any


REQUIRED_MYSQL_INPUTS = (
    "host",
    "port",
    "database",
    "schema",
    "readonlyUser",
    "readonlyPassword",
    "tableScope",
    "testScope",
)


@dataclass(frozen=True)
class ExecutionDecision:
    """描述当前生命周期可以执行的动作边界。"""

    state: str
    reason_code: str | None
    required_inputs: tuple[str, ...]
    next_action: str
    can_call_remote_test: bool
    can_call_save: bool
    can_call_synthetic_test: bool
    evidence_status: str

    def as_dict(self) -> dict[str, Any]:
        """输出稳定的阻断/模式报告字段。"""
        result = asdict(self)
        result.update({
            "reasonCode": result.pop("reason_code"),
            "requiredInputs": list(result.pop("required_inputs")),
            "nextAction": result.pop("next_action"),
            "canCallRemoteTest": result.pop("can_call_remote_test"),
            "canCallSave": result.pop("can_call_save"),
            "canCallSyntheticTest": result.pop("can_call_synthetic_test"),
            "evidenceStatus": result.pop("evidence_status"),
        })
        return result


def _has_value(value: Any) -> bool:
    """判断输入是否存在且不是空白秘密或范围。"""
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, frozenset)):
        return bool(value)
    return value is not None


def _mysql_is_complete(mysql: Mapping[str, Any] | None) -> bool:
    """只检查凭据字段是否完整，不回显或复制其值。"""
    if not isinstance(mysql, Mapping):
        return False
    if not all(_has_value(mysql.get(key)) for key in REQUIRED_MYSQL_INPUTS):
        return False
    port = mysql.get("port")
    return isinstance(port, int) and not isinstance(port, bool) and 1 <= port <= 65535


def _blocked(reason_code: str = "MYSQL_CREDENTIALS_REQUIRED") -> ExecutionDecision:
    """构造不可远程测试、不可保存的稳定阻断终态。"""
    return ExecutionDecision(
        state="blocked",
        reason_code=reason_code,
        required_inputs=REQUIRED_MYSQL_INPUTS,
        next_action="补齐只读 MySQL 连接信息，或明确选择 synthetic_unverified/ddl_asserted_consistent",
        can_call_remote_test=False,
        can_call_save=False,
        can_call_synthetic_test=False,
        evidence_status="blocked",
    )


def decide_mode(
    requested: str | None = "default",
    mysql: Mapping[str, Any] | None = None,
) -> ExecutionDecision:
    """按显式豁免或完整只读输入决定唯一执行模式。"""
    mode = (requested or "default").strip()
    if mode == "synthetic_unverified":
        return ExecutionDecision(
            state="synthetic",
            reason_code=None,
            required_inputs=(),
            next_action="仅运行本地 HTTP 合成结构验证，不证明线上结构或业务数据",
            can_call_remote_test=False,
            can_call_save=False,
            can_call_synthetic_test=True,
            evidence_status="synthetic_unverified",
        )
    if mode == "ddl_asserted_consistent":
        return ExecutionDecision(
            state="asserted",
            reason_code=None,
            required_inputs=(),
            next_action="按用户一致性声明继续接口测试，并明确标记未实时核验 MySQL",
            can_call_remote_test=True,
            can_call_save=True,
            can_call_synthetic_test=False,
            evidence_status="ddl_asserted_consistent",
        )
    if mode == "default" and _mysql_is_complete(mysql):
        return ExecutionDecision(
            state="real",
            reason_code=None,
            required_inputs=(),
            next_action="使用短生命周期只读连接核验 MySQL 元数据后继续",
            can_call_remote_test=True,
            can_call_save=True,
            can_call_synthetic_test=False,
            evidence_status="mysql_verified",
        )
    return _blocked()
