#!/usr/bin/env python3
"""在本地合成 DSL 服务上执行一个候选指标视图，不访问客户数据库。"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from output_contract import validate_result_payload


def main() -> int:
    """注入合成地址和测试 Token，执行 fixture 并验证统一 answer。"""
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "script",
        nargs="?",
        type=Path,
        default=root / "evals/fixtures/valid_metric_view.py",
        help="待执行的候选 Python；默认使用内置 fixture",
    )
    parser.add_argument(
        "--return-def",
        type=Path,
        help="可选的 returnDef/完整定义 JSON；提供后校验最终 answer 字段契约",
    )
    args = parser.parse_args()
    server = subprocess.Popen(
        [sys.executable, str(root / "scripts/synthetic_metric_view_server.py"), "--port", "0"],
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        port_line = server.stdout.readline().strip() if server.stdout else ""
        port = port_line.removeprefix("PORT=")
        source = args.script.read_text(encoding="utf-8")
        source = source.replace("__request_path", f"http://127.0.0.1:{port}").replace("__request_token", "synthetic-token")
        with tempfile.TemporaryDirectory(prefix="metric-view-synthetic-") as directory:
            script = Path(directory) / "generated.py"
            params = Path(directory) / "params.json"
            script.write_text(source, encoding="utf-8")
            params.write_text(json.dumps({"region": "demo"}), encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(script), "synthetic-user", "synthetic-domain", str(params)],
                capture_output=True,
                text=True,
                check=False,
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            )
        if result.returncode != 0:
            print(result.stderr, file=sys.stderr, end="")
            return result.returncode
        answer = json.loads(result.stdout)
        if not isinstance(answer.get("answer"), list):
            raise RuntimeError("合成测试返回不是 answer 数组")
        if args.return_def:
            return_def = json.loads(args.return_def.read_text(encoding="utf-8"))
            diagnostic = validate_result_payload(answer, return_def)
            diagnostic["mode"] = "synthetic"
            print(json.dumps(diagnostic, ensure_ascii=False, sort_keys=True))
            return 0 if diagnostic.get("ok") else 1
        print(json.dumps({"mode": "synthetic", "ok": True, "answer": answer["answer"]}, ensure_ascii=False))
        return 0
    finally:
        server.terminate()
        server.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
