#!/usr/bin/env python3
"""为 Skill 合成测试提供不访问外部系统的 DSL HTTP 服务。"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    """返回固定的最小指标行，覆盖新 DSL 路径。"""

    def do_POST(self) -> None:  # noqa: N802
        """处理结构化 DSL 请求。"""
        length = int(self.headers.get("Content-Length", "0"))
        request = json.loads(self.rfile.read(length) or b"{}")
        dsl = request.get("dsl", {})
        if self.path not in {"/metricView/dsl/execute", "/dsl/execute"}:
            self.send_error(404)
            return
        answer = [{"id": 1, "source_mode": dsl.get("sourceMode", "ontology")}]
        body = json.dumps({"data": [{"answer": answer}]}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        """合成服务不输出请求体或 Token。"""
        return


def main() -> None:
    """启动合成 HTTP 服务，并输出实际监听端口。"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    server = HTTPServer(("127.0.0.1", args.port), Handler)
    print(f"PORT={server.server_port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
