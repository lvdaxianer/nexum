#!/usr/bin/env python3
"""验证合成查询的正常、空结果、重复行和权限失败行为。"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


class _Handler(BaseHTTPRequestHandler):
    """根据测试模式返回统一 DSL 响应。"""

    mode = "normal"

    def do_POST(self) -> None:  # noqa: N802
        """响应生成脚本的统一 DSL 请求。"""
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)
        if self.__class__.mode == "forbidden":
            payload = {"error": "forbidden"}
        else:
            rows = [{"time": "2026-10-01 00:00:00", "value": 1.0}]
            if self.__class__.mode == "duplicate":
                rows.append({"time": "2026-10-01 00:00:00", "value": 1.0})
            if self.__class__.mode == "empty":
                rows = []
            payload = {"data": [{"answer": rows}]}
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: object) -> None:
        """测试服务不输出请求体或 Token。"""
        return


def _run_fixture(mode: str) -> subprocess.CompletedProcess[str]:
    """使用指定合成响应运行生成脚本。"""
    root = Path(__file__).resolve().parents[1]
    source = (root / "evals/fixtures/valid_metric_view.py").read_text(encoding="utf-8")
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    _Handler.mode = mode
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        source = source.replace("__request_path", f"http://127.0.0.1:{server.server_port}")
        source = source.replace("__request_token", "synthetic-token")
        with tempfile.TemporaryDirectory(prefix="metric-view-cases-") as directory:
            script = Path(directory) / "generated.py"
            params = Path(directory) / "params.json"
            script.write_text(source, encoding="utf-8")
            params.write_text(json.dumps({"region": "demo"}), encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(script), "user", "domain", str(params)],
                capture_output=True,
                text=True,
                check=False,
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            )
    finally:
        server.shutdown()
        server.server_close()


class SyntheticCasesTest(unittest.TestCase):
    """覆盖返回结构和错误边界。"""

    def test_fixture_declares_explicit_mock_answer(self) -> None:
        """确保生成脚本中能直接看到最终返回格式的 Mock 数据。"""
        fixture = (Path(__file__).resolve().parents[1] / "evals/fixtures/valid_metric_view.py").read_text(encoding="utf-8")
        self.assertIn("MOCK_ANSWER =", fixture)
        self.assertIn('"time": "2026-10-01 00:00:00"', fixture)
        self.assertIn('"value": 2.5', fixture)

    def test_duplicate_rows_are_deduplicated(self) -> None:
        result = _run_fixture("duplicate")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(len(json.loads(result.stdout)["answer"]), 1)

    def test_empty_rows_use_schema_compatible_mock_answer(self) -> None:
        result = _run_fixture("empty")
        self.assertEqual(result.returncode, 0)
        answer = json.loads(result.stdout)["answer"]
        self.assertEqual(answer, [
            {"time": "2026-10-01 00:00:00", "value": 2.5},
            {"time": "2026-10-02 00:00:00", "value": 2.8},
            {"time": "2026-10-03 00:00:00", "value": 2.6},
        ])

    def test_permission_error_fails_without_fake_success(self) -> None:
        result = _run_fixture("forbidden")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('"answer"', result.stdout)


if __name__ == "__main__":
    unittest.main()
