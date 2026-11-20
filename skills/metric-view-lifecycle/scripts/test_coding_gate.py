#!/usr/bin/env python3
"""验证指标视图 Python Coding Gate 的硬性规则。"""

from __future__ import annotations

import ast
import unittest
from pathlib import Path

from validate_metric_view_python import _validate_branch_comments, _validate_file_and_functions, validate


VARIABLES = {"__request_path", "__request_token"}
LONG_FUNCTION_BODY = "\n".join(
    ["    value = 1"] + ["    value += 1"] * 19 + ["    return value"]
)
BASE_SOURCE = '''import json
import sys
import requests

REQUEST_TIMEOUT_SECONDS = 10


def execute_dsl(dsl: dict) -> list:
    """调用统一 DSL 接口。"""
    response = requests.post("__request_path", timeout=REQUEST_TIMEOUT_SECONDS, json=dsl)
    payload = response.json()
    return payload["data"][0]["answer"]


def main() -> None:
    """读取参数并输出 answer。"""
    if len(sys.argv) <= 3:
        raise RuntimeError("参数不足")
    print(json.dumps({"answer": []}))
'''


def _source(body: str) -> str:
    """拼接满足基础执行协议的最小候选脚本。"""
    return f"{BASE_SOURCE}\n{body}\n\nif __name__ == \"__main__\":\n    main()\n"


class CodingGateTest(unittest.TestCase):
    """覆盖生成脚本必须遵守的结构与可靠性门禁。"""

    def test_rejects_function_without_multiline_docstring(self) -> None:
        """拒绝缺少函数文档字符串的候选代码。"""
        source = _source(
            '''def build_dsl():
    return {"limit": 10}
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("文档" in error for error in errors))

    def test_rejects_function_longer_than_twenty_lines(self) -> None:
        """拒绝超过 20 行的函数。"""
        source = _source(f'def build_dsl():\n    """构造查询。"""\n{LONG_FUNCTION_BODY}\n')
        errors = validate(source, VARIABLES)
        self.assertTrue(any("20 行" in error for error in errors))

    def test_rejects_remote_call_inside_loop(self) -> None:
        """拒绝循环体内发起远程查询的候选代码。"""
        source = _source(
            '''def query_all():
    """执行有限查询。"""
    rows = []
    for depth in range(4):
        rows.extend(execute_dsl({{"depth": depth}}))
    return rows
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("循环" in error for error in errors))

    def test_rejects_non_strict_answer_response(self) -> None:
        """拒绝未严格验证 answer 列表的响应解析代码。"""
        source = _source(
            '''def parse_response(payload):
    """解析响应。"""
    return payload.get("data", [{{}}])[0].get("answer") or []
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("answer" in error for error in errors))

    def test_rejects_missing_empty_result_mock_fallback(self) -> None:
        """拒绝没有空结果结构回退的候选脚本。"""
        source = _source(
            '''def parse_response(payload):
    """解析响应并保留真实空结果。"""
    if "data" not in payload:
        raise RuntimeError("缺少 data")
    answer = payload["data"][0]["answer"]
    if not isinstance(answer, list):
        raise RuntimeError("answer 必须是列表")
    return answer
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("空结果" in error for error in errors))

    def test_rejects_runtime_dunder_attribute(self) -> None:
        """拒绝会被运行器误判为占位符的双下划线属性。"""
        source = _source(
            '''# 条件注释：执行查询
def log_error(error):
    """记录异常类型。"""
    # 条件注释：避免运行时变量扫描误判
    return error.__class__.__name__
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("未登记占位符" in error and "__class__" in error for error in errors))

    def test_rejects_direct_database_driver(self) -> None:
        """拒绝候选脚本直接导入数据库驱动。"""
        source = _source(
            '''# 条件注释：禁止直连数据库
import sqlite3
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("禁止直接连接数据库驱动" in error for error in errors))

    def test_rejects_write_sql_literal(self) -> None:
        """拒绝候选脚本内包含写 SQL 或 DDL。"""
        source = _source(
            '''# 条件注释：禁止写数据库
def write_data():
    """不允许直接写入数据库。"""
    return "INSERT INTO test_table (id) VALUES (1)"
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("写 SQL/DDL" in error for error in errors))

    def test_rejects_single_mock_answer(self) -> None:
        """拒绝只有一条 Mock 记录的候选脚本。"""
        source = _source(
            '''# 条件注释：成功空结果使用最终 Mock
MOCK_ANSWER = [{"time": "2026-10-01", "value": 2.5}]
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("至少需要两条 Mock 记录" in error for error in errors))

    def test_rejects_identical_mock_answers(self) -> None:
        """拒绝多条完全重复的 Mock 记录。"""
        source = _source(
            '''# 条件注释：成功空结果使用最终 Mock
MOCK_ANSWER = [{"time": "2026-10-01", "value": 2.5}, {"time": "2026-10-01", "value": 2.5}]
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("必须存在业务字段变化" in error for error in errors))

    def test_accepts_fault_outage_macro_fixture(self) -> None:
        """完整的宏观退服 fixture 应通过全部静态门禁。"""
        fixture = Path(__file__).resolve().parents[1] / "evals/fixtures/fault_outage_macro.py"
        errors = validate(fixture.read_text(encoding="utf-8"), VARIABLES)
        self.assertEqual(errors, [])

    def test_rejects_fixture_when_target_output_schema_differs(self) -> None:
        """目标返回字段变化时必须阻断，而不是依据源表字段继续测试。"""
        fixture = Path(__file__).resolve().parents[1] / "evals/fixtures/valid_metric_view.py"
        errors = validate(fixture.read_text(encoding="utf-8"), VARIABLES, ["date", "complaints"])
        self.assertTrue(any("OUTPUT_KEYS" in error for error in errors))

    def test_accepts_fixture_when_target_output_schema_matches(self) -> None:
        """候选代码显式声明并使用目标字段时通过输出契约门禁。"""
        fixture = Path(__file__).resolve().parents[1] / "evals/fixtures/valid_metric_view.py"
        errors = validate(fixture.read_text(encoding="utf-8"), VARIABLES, ["time", "value"])
        self.assertEqual(errors, [])

    def test_rejects_missing_author_and_date_metadata(self) -> None:
        """拒绝缺少作者和日期元数据的模块。"""
        errors = validate(_source(""), VARIABLES)
        self.assertTrue(any("作者" in error for error in errors))
        self.assertTrue(any("日期" in error for error in errors))

    def test_rejects_uncommented_branch(self) -> None:
        """拒绝没有条件说明注释的分支。"""
        source = _source(
            '''# 条件注释：校验状态
def build_dsl():
    """构造查询。"""
    if True:
        return {"limit": 10}
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("分支注释" in error for error in errors))

    def test_rejects_low_comment_ratio(self) -> None:
        """拒绝注释占比低于 40% 的脚本。"""
        source = _source(
            '''# 条件注释：执行查询
def build_dsl():
    """构造查询。"""
    return {"limit": 10}
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("注释比例" in error for error in errors))

    def test_rejects_unused_import(self) -> None:
        """拒绝未使用的导入。"""
        source = _source(
            '''# 条件注释：执行查询
import pathlib
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("未使用导入" in error for error in errors))

    def test_rejects_magic_number(self) -> None:
        """拒绝未命名的业务数字。"""
        source = _source(
            '''# 条件注释：执行查询
def build_dsl():
    """构造查询。"""
    return {"limit": 500}
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("魔法数字" in error for error in errors))

    def test_rejects_magic_string_in_branch(self) -> None:
        """拒绝分支中的未命名业务字符串。"""
        source = _source(
            '''# 条件注释：执行查询
def build_dsl(value):
    """构造查询。"""
    # 条件注释：识别业务状态
    if value == "ACTIVE":
        return {"limit": 10}
    return {"limit": 10}
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("魔法字符串" in error for error in errors))

    def test_rejects_string_concat_inside_loop(self) -> None:
        """拒绝循环内使用加号拼接字符串。"""
        source = _source(
            '''# 条件注释：执行查询
def build_dsl(values):
    """构造查询。"""
    result = ""
    for value in values:
        # 循环注释：禁止重复创建字符串
        result = result + value
    return {"limit": 10}
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("拼接字符串" in error for error in errors))

    def test_rejects_too_many_parameters(self) -> None:
        """拒绝超过三个参数且未封装配置对象的函数。"""
        source = _source(
            '''# 条件注释：执行查询
def build_dsl(one, two, three, four):
    """构造查询。"""
    return {"limit": 10}
'''
        )
        errors = validate(source, VARIABLES)
        self.assertTrue(any("参数数量" in error for error in errors))

    def test_rejects_high_complexity(self) -> None:
        """拒绝圈复杂度超过十的函数。"""
        branches = "\n".join(f"    if value == {index}:\n        return value" for index in range(11))
        source = _source(f'# 条件注释：执行查询\ndef build_dsl(value):\n    """构造查询。"""\n{branches}\n    return 0\n')
        errors = validate(source, VARIABLES)
        self.assertTrue(any("圈复杂度" in error for error in errors))

    def test_rejects_physical_file_over_three_hundred_fifty_lines(self) -> None:
        """文件长度按物理源码行数计算，超过 350 行必须阻断。"""
        source = "\n".join("# 条件注释：物理行" for _ in range(351))
        errors = _validate_file_and_functions(source, ast.parse(source))
        self.assertTrue(any("文件超过 350 行" in error for error in errors))

    def test_accepts_comment_before_else_keyword(self) -> None:
        """else 关键字上一行有中文注释时应通过。"""
        source = """
# 条件注释：模块分支
def choose(value):
    \"\"\"选择路径。\"\"\"
    # 条件注释：命中值
    if value:
        return 1
    # 条件注释：未命中值
    else:
        return 2
"""
        errors = _validate_branch_comments(source, ast.parse(source))
        self.assertEqual(errors, [])

    def test_rejects_comment_only_inside_else_body(self) -> None:
        """只在 else 体首条语句前注释不能冒充 else 分支注释。"""
        source = """
# 条件注释：模块分支
def choose(value):
    \"\"\"选择路径。\"\"\"
    # 条件注释：命中值
    if value:
        return 1
    else:
        # 条件注释：这不是 else 关键字说明
        return 2
"""
        errors = _validate_branch_comments(source, ast.parse(source))
        self.assertTrue(any("替代分支注释缺失" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
