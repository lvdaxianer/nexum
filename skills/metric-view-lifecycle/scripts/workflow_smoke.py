#!/usr/bin/env python3
"""提供不访问外部系统的 MetricView 完整组合链路 smoke runner。"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest.mock import patch

from backfill_metric_view import run


TOKEN = "synthetic-token"


class _Handler(BaseHTTPRequestHandler):
    """同时模拟变量目录、DSL、MetricView 测试和保存接口。"""

    calls: list[str] = []
    stored: dict = {}

    def _write_json(self, payload: dict) -> None:
        """返回 JSON，不记录请求体或 Token。"""
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        """返回只包含元数据的变量目录。"""
        self.__class__.calls.append(self.path)
        if self.path != "/runtime-variables/catalog":
            self.send_error(404)
            return
        self._write_json({"data": [{
            "name": "REQUEST_BASE_URL",
            "placeholder": "__request_path",
            "meaning": "数据引擎基础地址",
            "secret": 0,
        }, {
            "name": "REQUEST_TOKEN",
            "placeholder": "__request_token",
            "meaning": "可信请求 Token",
            "secret": 1,
        }]})

    def do_POST(self) -> None:  # noqa: N802
        """返回各阶段的最小统一响应。"""
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        self.__class__.calls.append(self.path)
        if self.path == "/metricView/dsl/execute":
            self._write_json({"data": [{"answer": [{"time": "2026-10-01 00:00:00", "value": 1.0}]}]})
        elif self.path == "/metricView/testExecute":
            self._write_json({"data": [{"answer": []}]})
        elif self.path == "/metricView/queryList":
            self._write_json({"data": []})
        elif self.path == "/metricView/test":
            self._write_json({"data": {"answer": []}})
        elif self.path == "/metricView/save":
            self.__class__.stored = dict(body)
            self.__class__.stored["id"] = "smoke-mv"
            self._write_json({"data": {"id": "smoke-mv"}})
        elif self.path == "/metricView/queryById":
            self._write_json({"data": self.__class__.stored})
        else:
            self.send_error(404)

    def log_message(self, format: str, *args: object) -> None:
        """模拟服务不输出请求体或认证信息。"""
        return


def _get_catalog(base_url: str) -> bool:
    """获取目录并确认响应不含敏感真实值。"""
    request = urllib.request.Request(
        f"{base_url}/runtime-variables/catalog",
        headers={"X-Trusted-Token": TOKEN},
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        payload = json.loads(response.read().decode("utf-8"))
    rows = payload.get("data", [])
    return (
        isinstance(rows, list)
        and len(rows) == 2
        and all("value" not in row for row in rows)
        and rows[1].get("secret") == 1
    )


def _run_python_fixture(base_url: str) -> bool:
    """注入运行时变量并执行生成的 Python fixture。"""
    root = Path(__file__).resolve().parents[1]
    source = (root / "evals/fixtures/valid_metric_view.py").read_text(encoding="utf-8")
    source = source.replace("__request_path", base_url).replace("__request_token", TOKEN)
    with tempfile.TemporaryDirectory(prefix="metric-view-smoke-") as directory:
        script = Path(directory) / "generated.py"
        params = Path(directory) / "params.json"
        script.write_text(source, encoding="utf-8")
        params.write_text(json.dumps({"region": "demo"}), encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(script), "smoke-user", "smoke-domain", str(params)],
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
    if result.returncode != 0:
        return False
    try:
        answer = json.loads(result.stdout)
    except json.JSONDecodeError:
        return False
    return (
        isinstance(answer.get("answer"), list)
        and answer["answer"][0] == {"time": "2026-10-01 00:00:00", "value": 1.0}
    )


def run_smoke() -> dict[str, int | bool]:
    """执行变量目录、Python、test、save、queryById 的完整本地链路。"""
    _Handler.calls = []
    _Handler.stored = {}
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    try:
        catalog_ok = _get_catalog(base_url)
        python_ok = _run_python_fixture(base_url)
        request = urllib.request.Request(
            f"{base_url}/metricView/testExecute",
            data=b"{}",
            headers={"Content-Type": "application/json", "X-Trusted-Token": TOKEN},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5):
            pass
        with tempfile.TemporaryDirectory(prefix="metric-view-smoke-definition-") as directory:
            definition = Path(directory) / "definition.json"
            fixture = Path(__file__).resolve().parents[1] / "evals/fixtures/valid_metric_view.py"
            definition.write_text(json.dumps({
                "name": "合成链路指标",
                "description": "本地合成链路指标",
                "status": "PENDING_REVIEW",
                "type": "METRIC_VIEW",
                "origin": "CUSTOM",
                "typeContext": {
                    "fields": {"m.region": "VARCHAR"},
                    "predicates": [{
                        "field": "m.region",
                        "operator": "eq",
                        "parameter": "region",
                        "logicalType": "string",
                    }],
                },
                "function": {
                    "name": "合成链路指标",
                    "operation": "OPERATION_READ",
                    "parameters": [{"name": "region", "type": "TYPE_STRING"}],
                    "logic": "按区域过滤并返回指标值",
                    "code": fixture.read_text(encoding="utf-8"),
                    "returnDef": {"outKeyRefs": [{"key": "time"}, {"key": "value"}]},
                },
            }), encoding="utf-8")
            with patch("backfill_metric_view.input", return_value="yes"):
                backfill_result = run(definition, base_url, TOKEN)
        test_index = _Handler.calls.index("/metricView/test")
        save_index = _Handler.calls.index("/metricView/save")
        query_by_id_index = _Handler.calls.index("/metricView/queryById")
        return {
            "catalog_ok": catalog_ok,
            "python_ok": python_ok,
            "metric_view_ok": backfill_result == 0,
            "test_index": test_index,
            "save_index": save_index,
            "query_by_id_index": query_by_id_index,
        }
    finally:
        server.shutdown()
        server.server_close()
