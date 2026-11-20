#!/usr/bin/env python3
"""校验一次 MetricView 最终结果并输出安全、可修复的诊断。

该工具不访问网络；它用于把接口或本地脚本保存的 JSON 结果与
returnDef.outKeyRefs 对账，特别识别 DSL data 包裹层误透传。
Author: lvdaxianer@yeah.net
Date: 2026-11-19
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from output_contract import validate_result_payload


def main() -> int:
    """读取 returnDef 和最终结果，输出机器可读诊断。"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--return-def", type=Path, required=True)
    parser.add_argument("--result", type=Path, required=True)
    args = parser.parse_args()
    try:
        return_def = json.loads(args.return_def.read_text(encoding="utf-8"))
        result = json.loads(args.result.read_text(encoding="utf-8"))
        diagnostic = validate_result_payload(result, return_def)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        diagnostic = {
            "ok": False,
            "errorCode": "METRIC_VIEW_OUTPUT_CONTRACT_INPUT_INVALID",
            "stage": "OUTPUT_SCHEMA_VALIDATE",
            "message": str(error),
        }
    print(json.dumps(diagnostic, ensure_ascii=False, sort_keys=True))
    return 0 if diagnostic.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
