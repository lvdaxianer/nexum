#!/usr/bin/env python3
"""执行指标视图 Python 的运行协议和 code-review-spec 强制门禁。

Author: lvdaxianer@yeah.net
Date: 2026-11-16
"""

from __future__ import annotations

import argparse
import ast
import io
import json
import re
import sys
import tokenize
from pathlib import Path

from output_contract import extract_output_keys


PLACEHOLDER = re.compile(r"__[A-Za-z0-9_-]{1,127}")
AUTHOR_PATTERN = re.compile(r"(?m)^\s*Author:\s*\S+")
DATE_PATTERN = re.compile(r"(?m)^\s*Date:\s*\d{4}-\d{2}-\d{2}")
MAX_FUNCTION_LINES = 20
MAX_FILE_LINES = 350
MAX_COMPLEXITY = 10
MIN_COMMENT_RATIO = 0.4
DEFAULT_AUTHOR = "lvdaxianer@yeah.net"
FORBIDDEN = (
    re.compile(r"127\.0\.0\.1|localhost|0\.0\.0\.0"),
    re.compile(r"(?i)(jdbc:|password\s*=|passwd\s*=|secret\s*=)"),
    re.compile(r"(?i)\b(select|insert|update|delete)\s+.+\s+from\b"),
)
FORBIDDEN_DB_IMPORTS = frozenset({
    "sqlite3", "pymysql", "psycopg2", "psycopg", "sqlalchemy", "pyodbc",
    "cx_Oracle", "oracledb", "duckdb", "asyncpg", "mysql",
})
WRITE_SQL = re.compile(
    r"(?i)\b(insert|update|delete|merge|truncate|"
    r"create\s+(?:table|view|index|schema|database)|"
    r"alter\s+(?:table|view|index|schema)|"
    r"drop\s+(?:table|view|index|schema))\b"
)
REMOTE_METHODS = {"get", "post", "put", "patch", "delete", "urlopen"}


class _RemoteCallInLoopVisitor(ast.NodeVisitor):
    """发现循环体内直接或间接发起的远程请求。

    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """

    def __init__(self) -> None:
        """初始化循环深度和发现状态。

        Returns:
            None。
        Author: lvdaxianer@yeah.net
        Date: 2026-11-16
        """
        self.loop_depth = 0
        self.found = False

    def visit_For(self, node: ast.For) -> None:  # noqa: N802
        """检查 for 循环中的远程请求。

        Args:
            node: 当前 AST 节点。
        Returns:
            None。
        Author: lvdaxianer@yeah.net
        Date: 2026-11-16
        """
        self.loop_depth += 1
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_While(self, node: ast.While) -> None:  # noqa: N802
        """检查 while 循环中的远程请求。

        Args:
            node: 当前 AST 节点。
        Returns:
            None。
        Author: lvdaxianer@yeah.net
        Date: 2026-11-16
        """
        self.loop_depth += 1
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        """标记循环内的 HTTP 客户端或 DSL 执行调用。

        Args:
            node: 当前调用节点。
        Returns:
            None。
        Author: lvdaxianer@yeah.net
        Date: 2026-11-16
        """
        if self.loop_depth and self._is_remote_call(node):
            self.found = True
        self.generic_visit(node)

    @staticmethod
    def _is_remote_call(node: ast.Call) -> bool:
        """识别常见 HTTP 调用和指标查询封装调用。

        Args:
            node: 当前调用节点。
        Returns:
            是否为远程调用。
        Author: lvdaxianer@yeah.net
        Date: 2026-11-16
        """
        function = node.func
        if isinstance(function, ast.Name):
            return function.id in {"execute_dsl", "execute_query", "urlopen"}
        if not isinstance(function, ast.Attribute):
            return False
        if function.attr == "urlopen":
            return True
        return (
            isinstance(function.value, ast.Name)
            and function.value.id in {"requests", "http_request"}
            and function.attr in REMOTE_METHODS
        )


def _is_constant_timeout(node: ast.Call) -> bool:
    """判断 HTTP timeout 是否引用命名常量或受控 timeout 参数。

    Args:
        node: 当前 HTTP 调用节点。
    Returns:
        timeout 是否来自命名变量。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    for keyword in node.keywords:
        if keyword.arg == "timeout":
            return any(
                isinstance(child, ast.Name)
                and ("TIMEOUT" in child.id or child.id == "request_timeout")
                for child in ast.walk(keyword.value)
            )
    return False


def _has_strict_answer_validation(source: str) -> bool:
    """判断代码是否显式验证 answer 的存在性和列表类型。

    Args:
        source: 候选 Python 源码。
    Returns:
        是否包含严格响应校验。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    return (
        '"answer" not in' in source
        and "isinstance(answer, list)" in source
        and '"data" not in' in source
    )


def _has_empty_result_mock_fallback(source: str) -> bool:
    """判断成功空结果是否有明确的 schema-compatible mock 回退。"""
    normalized = source.lower()
    return "if not answer" in source and "mock" in normalized and "return" in normalized


def _validate_mock_answer(tree: ast.AST) -> list[str]:
    """检查 Mock 是否为多条、非空且内容有变化的最终返回记录。

    Args:
        tree: 候选代码 AST。
    Returns:
        Mock 契约错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-18
    """
    errors: list[str] = []
    assignments: list[ast.Assign | ast.AnnAssign] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AnnAssign):
            targets = [node.target]
        else:
            continue
        if any(isinstance(target, ast.Name) and target.id == "MOCK_ANSWER" for target in targets):
            assignments.append(node)
    if not assignments:
        return ["必须显式声明 MOCK_ANSWER 多条最终返回 Mock 记录"]
    value = assignments[0].value
    if not isinstance(value, (ast.List, ast.Tuple)) or len(value.elts) < 2:
        return ["MOCK_ANSWER 至少需要两条 Mock 记录，不能只返回单条或类型默认值"]
    rows: list[str] = []
    for index, row in enumerate(value.elts, 1):
        if not isinstance(row, ast.Dict) or not row.keys:
            errors.append(f"MOCK_ANSWER 第 {index} 条必须是非空对象")
            continue
        rows.append(ast.dump(row, include_attributes=False))
        if any(isinstance(item, ast.Constant) and item.value in {None, ""} for item in row.values):
            errors.append(f"MOCK_ANSWER 第 {index} 条不能包含 null 或空字符串")
    if len(set(rows)) < 2:
        errors.append("MOCK_ANSWER 多条记录必须存在业务字段变化，不能复制同一条默认记录")
    return errors


def _assigned_value(tree: ast.AST, name: str) -> ast.AST | None:
    """查找模块级命名常量的赋值表达式。"""
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AnnAssign):
            targets = [node.target]
        else:
            continue
        if any(isinstance(target, ast.Name) and target.id == name for target in targets):
            return node.value
    return None


def _literal_string_sequence(value: ast.AST | None) -> list[str] | None:
    """读取由字符串常量组成的 list/tuple。"""
    if not isinstance(value, (ast.List, ast.Tuple)):
        return None
    if not all(isinstance(item, ast.Constant) and isinstance(item.value, str) for item in value.elts):
        return None
    return [item.value for item in value.elts]


def _literal_dict_keys(value: ast.AST) -> list[str] | None:
    """读取 Mock 字典的静态字段名。"""
    if not isinstance(value, ast.Dict) or not all(isinstance(key, ast.Constant) and isinstance(key.value, str) for key in value.keys):
        return None
    return [key.value for key in value.keys]


def _validate_output_schema(tree: ast.AST, expected_keys: list[str] | None) -> list[str]:
    """校验生成脚本显式声明并使用目标输出字段，而不是源表字段。"""
    if expected_keys is None:
        return []
    errors: list[str] = []
    errors.extend(_validate_declared_output_keys(tree, expected_keys))
    errors.extend(_validate_mock_output_keys(tree, expected_keys))
    return errors


def _validate_declared_output_keys(tree: ast.AST, expected_keys: list[str]) -> list[str]:
    """校验 OUTPUT_KEYS 的静态声明和使用。"""
    errors: list[str] = []
    output_keys = _literal_string_sequence(_assigned_value(tree, "OUTPUT_KEYS"))
    if output_keys is None:
        errors.append("必须声明由 returnDef.outKeyRefs 派生的 OUTPUT_KEYS 字符串序列")
    elif output_keys != expected_keys:
        errors.append(f"OUTPUT_KEYS 必须与目标返回字段一致：期望 {expected_keys}，实际 {output_keys}")
    loads = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)}
    if "OUTPUT_KEYS" not in loads:
        errors.append("最终字段映射或校验必须使用 OUTPUT_KEYS，不能直接透传 DSL data")
    return errors


def _validate_mock_output_keys(tree: ast.AST, expected_keys: list[str]) -> list[str]:
    """校验静态 Mock 每行都使用目标输出字段。"""
    errors: list[str] = []
    mock_value = _assigned_value(tree, "MOCK_ANSWER")
    if isinstance(mock_value, (ast.List, ast.Tuple)):
        for index, row in enumerate(mock_value.elts, 1):
            actual_keys = _literal_dict_keys(row)
            if actual_keys is not None and actual_keys != expected_keys:
                errors.append(
                    f"MOCK_ANSWER 第 {index} 条字段必须与目标返回字段一致：期望 {expected_keys}，实际 {actual_keys}"
                )
    return errors


def load_variables(path: Path) -> set[str]:
    """读取轻量变量目录；不解析具体运行时值。

    Args:
        path: 运行时变量目录文件路径。
    Returns:
        已登记的占位符集合。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    text = path.read_text(encoding="utf-8")
    return set(re.findall(r"^\s+placeholder:\s*['\"]?([^'\"\s]+)", text, re.MULTILINE))


def _parse_source(source: str) -> tuple[ast.AST | None, list[str]]:
    """解析候选 Python，并将语法错误转换为 Gate 错误。

    Args:
        source: 候选 Python 源码。
    Returns:
        AST 和解析错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    try:
        return ast.parse(source), []
    except SyntaxError as error:
        return None, [f"Python 语法错误：{error}"]


def _doc_has_metadata(doc: str) -> tuple[bool, bool]:
    """检查文档字符串是否包含作者和日期。

    Args:
        doc: 文档字符串内容。
    Returns:
        作者元数据和日期元数据是否存在。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    return bool(AUTHOR_PATTERN.search(doc)), bool(DATE_PATTERN.search(doc))


def _is_multiline_docstring(source: str, node: ast.AST) -> bool:
    """判断节点文档字符串是否使用多行格式。

    Args:
        source: 候选 Python 源码。
        node: 模块、类或函数节点。
    Returns:
        是否为多行文档字符串。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    body = getattr(node, "body", [])
    if not body or not isinstance(body[0], ast.Expr):
        return False
    if not isinstance(body[0].value, ast.Constant) or not isinstance(body[0].value.value, str):
        return False
    segment = ast.get_source_segment(source, body[0]) or ""
    return "\n" in segment


def _validate_documentation(source: str, tree: ast.AST) -> list[str]:
    """检查模块、类和函数的多行文档及作者日期元数据。

    Args:
        source: 候选 Python 源码。
        tree: 候选代码 AST。
    Returns:
        文档规范错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    nodes = [tree] + [node for node in ast.walk(tree) if isinstance(node, (ast.ClassDef, ast.FunctionDef))]
    for node in nodes:
        doc = ast.get_docstring(node, clean=False) or ""
        label = "模块" if node is tree else getattr(node, "name", "未知节点")
        if not doc:
            errors.append(f"{label}必须包含完整文档字符串")
            continue
        if not _is_multiline_docstring(source, node):
            errors.append(f"{label}文档字符串必须使用多行格式")
        has_author, has_date = _doc_has_metadata(doc)
        if not has_author:
            errors.append(f"{label}文档缺少作者元数据（默认作者：{DEFAULT_AUTHOR}）")
        if not has_date:
            errors.append(f"{label}文档缺少日期元数据（格式：YYYY-MM-DD）")
    return errors


def _comment_lines(source: str, tree: ast.AST) -> set[int]:
    """收集注释和文档字符串占用的源码行。

    Args:
        source: 候选 Python 源码。
        tree: 候选代码 AST。
    Returns:
        注释行号集合。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    lines: set[int] = set()
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type == tokenize.COMMENT:
            lines.add(token.start[0])
    nodes = [tree] + [node for node in ast.walk(tree) if isinstance(node, (ast.ClassDef, ast.FunctionDef))]
    for node in nodes:
        body = getattr(node, "body", [])
        if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
            if isinstance(body[0].value.value, str):
                lines.update(range(body[0].lineno, body[0].end_lineno + 1))
    return lines


def _validate_comment_ratio(source: str, tree: ast.AST) -> list[str]:
    """检查注释和文档行至少占非空源码行的百分之四十。

    Args:
        source: 候选 Python 源码。
        tree: 候选代码 AST。
    Returns:
        注释比例错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    total = sum(bool(line.strip()) for line in source.splitlines())
    if total == 0:
        return ["注释比例无法计算：源码为空"]
    ratio = len(_comment_lines(source, tree)) / total
    if ratio < MIN_COMMENT_RATIO:
        return [f"注释比例为 {ratio:.1%}，不得低于 40%"]
    return []


def _has_preceding_comment(source_lines: list[str], line_number: int) -> bool:
    """判断分支前方是否存在中文条件说明注释。

    Args:
        source_lines: 按行拆分的源码。
        line_number: 分支起始行号。
    Returns:
        是否存在注释。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    index = line_number - 2
    while index >= 0 and not source_lines[index].strip():
        index -= 1
    return index >= 0 and source_lines[index].lstrip().startswith("#")


def _validate_branch_comments(source: str, tree: ast.AST) -> list[str]:
    """检查 if、elif 和 else 分支前的条件说明注释。

    Args:
        source: 候选 Python 源码。
        tree: 候选代码 AST。
    Returns:
        分支注释错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    source_lines = source.splitlines()
    else_lines = _else_keyword_lines(source)
    errors: list[str] = []
    for node in (item for item in ast.walk(tree) if isinstance(item, ast.If)):
        if not _has_preceding_comment(source_lines, node.lineno):
            errors.append(f"第 {node.lineno} 行分支注释缺失")
        if node.orelse:
            body_end = max(item.end_lineno for item in node.body)
            alternative_start = min(item.lineno for item in node.orelse)
            else_line = next(
                (line for line in else_lines if body_end < line <= alternative_start),
                None,
            )
            if else_line is not None and not _has_preceding_comment(source_lines, else_line):
                errors.append(f"第 {else_line} 行替代分支注释缺失")
    return errors


def _else_keyword_lines(source: str) -> set[int]:
    """使用 token 行号定位真实 else 关键字，而不是 else 体首条语句。"""
    return {
        token.start[0]
        for token in tokenize.generate_tokens(io.StringIO(source).readline)
        if token.type == tokenize.NAME and token.string == "else"
    }


def _function_code_line_count(source: str, node: ast.FunctionDef) -> int:
    """统计函数可执行代码行数，排除文档、空行和注释。

    Args:
        source: 候选 Python 源码。
        node: 函数 AST 节点。
    Returns:
        函数可执行代码行数。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    doc_lines: set[int] = set()
    body = node.body
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        if isinstance(body[0].value.value, str):
            doc_lines.update(range(body[0].lineno, body[0].end_lineno + 1))
    return sum(
        bool(line.strip()) and not line.lstrip().startswith("#") and index not in doc_lines
        for index, line in enumerate(source.splitlines(), 1)
        if node.lineno <= index <= node.end_lineno
    )


def _validate_file_and_functions(source: str, tree: ast.AST) -> list[str]:
    """检查文件、函数行数、函数参数和圈复杂度限制。

    Args:
        tree: 候选代码 AST。
    Returns:
        复杂度和规模错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    file_line_count = len(source.splitlines())
    if file_line_count > MAX_FILE_LINES:
        errors.append(f"文件超过 {MAX_FILE_LINES} 行，必须拆分")
    for node in (item for item in ast.walk(tree) if isinstance(item, ast.ClassDef)):
        if node.end_lineno - node.lineno + 1 > MAX_FILE_LINES:
            errors.append(f"类 {node.name} 超过 {MAX_FILE_LINES} 行，必须拆分")
    for node in (item for item in ast.walk(tree) if isinstance(item, ast.FunctionDef)):
        line_count = _function_code_line_count(source, node)
        if line_count > MAX_FUNCTION_LINES:
            errors.append(f"函数 {node.name} 超过 {MAX_FUNCTION_LINES} 行，必须拆分")
        args = node.args.posonlyargs + node.args.args + node.args.kwonlyargs
        count = len([arg for arg in args if arg.arg not in {"self", "cls"}])
        if count > 3:
            errors.append(f"函数 {node.name} 参数数量为 {count}，不得超过 3 个")
        complexity = _complexity(node)
        if complexity > MAX_COMPLEXITY:
            errors.append(f"函数 {node.name} 圈复杂度为 {complexity}，不得超过 10")
    return errors


def _complexity(node: ast.FunctionDef) -> int:
    """计算函数的保守圈复杂度。

    Args:
        node: 函数 AST 节点。
    Returns:
        圈复杂度估算值。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    complexity = 1
    for child in ast.walk(node):
        if isinstance(child, (ast.If, ast.For, ast.While, ast.ExceptHandler, ast.comprehension)):
            complexity += 1
        if isinstance(child, ast.BoolOp):
            complexity += len(child.values) - 1
    return complexity


def _validate_names_and_imports(tree: ast.AST) -> list[str]:
    """检查 Python 命名、未使用导入和未使用局部变量。

    Args:
        tree: 候选代码 AST。
    Returns:
        命名和未使用声明错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors = _validate_name_shapes(tree)
    loads = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)}
    errors.extend(_validate_unused_imports(tree, loads))
    errors.extend(_validate_unused_assignments(tree, loads))
    return errors


def _validate_name_shapes(tree: ast.AST) -> list[str]:
    """检查函数、变量和常量的 Python 命名形态。

    Args:
        tree: 候选代码 AST。
    Returns:
        命名错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not re.match(r"^[a-z_][a-z0-9_]*$", node.name):
            errors.append(f"函数 {node.name} 必须使用 snake_case")
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)) and re.search(r"[a-z][A-Z]", node.id):
            errors.append(f"变量 {node.id} 不得使用 camelCase")
    return errors


def _imported_names(tree: ast.AST) -> list[tuple[str, int]]:
    """提取所有导入绑定名称及其行号。

    Args:
        tree: 候选代码 AST。
    Returns:
        导入名称和行号列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    imports: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.extend((alias.asname or alias.name.split(".")[0], node.lineno) for alias in node.names)
        if isinstance(node, ast.ImportFrom) and node.module != "__future__":
            imports.extend((alias.asname or alias.name, node.lineno) for alias in node.names)
    return imports


def _validate_unused_imports(tree: ast.AST, loads: set[str]) -> list[str]:
    """拒绝未被使用的 import 绑定。

    Args:
        tree: 候选代码 AST。
        loads: 所有被读取的名称集合。
    Returns:
        未使用导入错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    return [f"第 {line} 行存在未使用导入：{name}" for name, line in _imported_names(tree) if name not in loads]


def _target_names(target: ast.AST, line: int) -> list[tuple[str, int]]:
    """递归提取赋值目标名称。

    Args:
        target: 赋值目标节点。
        line: 赋值所在行号。
    Returns:
        目标名称和行号列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    if isinstance(target, ast.Name):
        return [(target.id, line)]
    if isinstance(target, (ast.Tuple, ast.List)):
        return [item for child in target.elts for item in _target_names(child, line)]
    return []


def _assigned_names(tree: ast.AST) -> list[tuple[str, int]]:
    """提取普通变量赋值、循环变量和 with 绑定。

    Args:
        tree: 候选代码 AST。
    Returns:
        变量名称和行号列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    parents = {id(child): parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}

    def is_local(node: ast.AST) -> bool:
        parent = parents.get(id(node))
        while parent is not None:
            if isinstance(parent, ast.ClassDef):
                return False
            if isinstance(parent, ast.FunctionDef):
                return True
            parent = parents.get(id(parent))
        return False

    assigned: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and is_local(node):
            for target in node.targets:
                assigned.extend(_target_names(target, node.lineno))
        if isinstance(node, ast.AnnAssign) and is_local(node):
            assigned.extend(_target_names(node.target, node.lineno))
        if isinstance(node, ast.For) and is_local(node):
            assigned.extend(_target_names(node.target, node.lineno))
        if isinstance(node, ast.comprehension) and is_local(node):
            assigned.extend(_target_names(node.target, getattr(node.target, "lineno", 0)))
        if isinstance(node, ast.withitem) and node.optional_vars and is_local(node):
            assigned.extend(_target_names(node.optional_vars, node.context_expr.lineno))
    return assigned


def _validate_unused_assignments(tree: ast.AST, loads: set[str]) -> list[str]:
    """拒绝未使用的局部变量，忽略下划线和模块常量。

    Args:
        tree: 候选代码 AST。
        loads: 所有被读取的名称集合。
    Returns:
        未使用变量错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    for name, line in _assigned_names(tree):
        if name.startswith("_") or name.isupper() or name in loads:
            continue
        errors.append(f"第 {line} 行存在未使用变量：{name}")
    return errors


def _is_constant_assignment(node: ast.AST, parents: dict[int, ast.AST]) -> bool:
    """判断数字是否位于模块常量赋值中。

    Args:
        node: 常量 AST 节点。
        parents: AST 父节点映射。
    Returns:
        是否属于常量定义。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    parent = parents.get(id(node))
    while parent is not None:
        if isinstance(parent, (ast.Assign, ast.AnnAssign)):
            targets = parent.targets if isinstance(parent, ast.Assign) else [parent.target]
            return any(isinstance(target, ast.Name) and target.id.isupper() for target in targets)
        parent = parents.get(id(parent))
    return False


def _is_protocol_subscript(node: ast.AST, parents: dict[int, ast.AST]) -> bool:
    """允许 argv 协议下标中的结构性数字。

    Args:
        node: 数字常量节点。
        parents: AST 父节点映射。
    Returns:
        是否属于 sys.argv 下标。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    parent = parents.get(id(node))
    while parent is not None:
        if isinstance(parent, ast.Subscript):
            return isinstance(parent.value, ast.Attribute) and parent.value.attr == "argv"
        parent = parents.get(id(parent))
    return False


def _validate_magic_numbers(tree: ast.AST) -> list[str]:
    """拒绝未命名的业务数字和超时阈值。

    Args:
        tree: 候选代码 AST。
    Returns:
        魔法数字错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    parents = {id(child): parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
    errors: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Constant) or not isinstance(node.value, (int, float)) or isinstance(node.value, bool):
            continue
        if node.value in {0, 1, -1} or _is_constant_assignment(node, parents) or _is_protocol_subscript(node, parents):
            continue
        errors.append(f"第 {node.lineno} 行存在魔法数字：{node.value}")
    return errors


def _validate_magic_strings(tree: ast.AST) -> list[str]:
    """拒绝条件分支中的未命名业务字符串。

    Args:
        tree: 候选代码 AST。
    Returns:
        魔法字符串错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    parents = {id(child): parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
    protocol_values = {"data", "answer", "error", "__main__", "utf-8"}
    errors: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
            continue
        if not node.value or node.value in protocol_values or _is_constant_assignment(node, parents):
            continue
        parent = parents.get(id(node))
        if isinstance(parent, ast.Compare):
            errors.append(f"第 {node.lineno} 行存在魔法字符串：{node.value}")
    return errors


def _validate_boolean_names(tree: ast.AST) -> list[str]:
    """检查显式布尔赋值是否使用 is/has/can/should 前缀。

    Args:
        tree: 候选代码 AST。
    Returns:
        布尔命名错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    prefix = re.compile(r"^(is|has|can|should)_[a-z0-9_]+$")
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, bool):
            targets = [target for target in node.targets if isinstance(target, ast.Name)]
            for target in targets:
                if not prefix.match(target.id) and not target.id.isupper():
                    errors.append(f"第 {node.lineno} 行布尔变量 {target.id} 必须使用 is/has/can/should 前缀")
    return errors


class _LoopStringConcatVisitor(ast.NodeVisitor):
    """发现循环中的字符串加法拼接。

    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """

    def __init__(self) -> None:
        """初始化循环深度和违规行号。

        Returns:
            None。
        Author: lvdaxianer@yeah.net
        Date: 2026-11-16
        """
        self.loop_depth = 0
        self.lines: list[int] = []
        self.string_names: set[str] = set()

    def visit_Assign(self, node: ast.Assign) -> None:  # noqa: N802
        """记录显式初始化为字符串的变量。

        Args:
            node: 当前赋值节点。
        Returns:
            None。
        Author: lvdaxianer@yeah.net
        Date: 2026-11-16
        """
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            self.string_names.update(target.id for target in node.targets if isinstance(target, ast.Name))
        self.generic_visit(node)

    def visit_For(self, node: ast.For) -> None:  # noqa: N802
        """检查 for 循环中的字符串拼接。

        Args:
            node: 当前 for 节点。
        Returns:
            None。
        Author: lvdaxianer@yeah.net
        Date: 2026-11-16
        """
        self.loop_depth += 1
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_While(self, node: ast.While) -> None:  # noqa: N802
        """检查 while 循环中的字符串拼接。

        Args:
            node: 当前 while 节点。
        Returns:
            None。
        Author: lvdaxianer@yeah.net
        Date: 2026-11-16
        """
        self.loop_depth += 1
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_BinOp(self, node: ast.BinOp) -> None:  # noqa: N802
        """标记循环内的字符串加法。

        Args:
            node: 当前二元运算节点。
        Returns:
            None。
        Author: lvdaxianer@yeah.net
        Date: 2026-11-16
        """
        if self.loop_depth and isinstance(node.op, ast.Add) and any(
            (isinstance(child, ast.Constant) and isinstance(child.value, str))
            or (isinstance(child, ast.Name) and child.id in self.string_names)
            for child in ast.walk(node)
        ):
            self.lines.append(node.lineno)
        self.generic_visit(node)


def _validate_loop_string_concat(tree: ast.AST) -> list[str]:
    """拒绝循环内使用加号拼接字符串。

    Args:
        tree: 候选代码 AST。
    Returns:
        字符串拼接错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    visitor = _LoopStringConcatVisitor()
    visitor.visit(tree)
    return [f"第 {line} 行禁止在循环内使用 + 拼接字符串" for line in visitor.lines]


def _validate_strategy_branches(tree: ast.AST) -> list[str]:
    """拒绝函数内四个及以上相等判断分支。

    Args:
        tree: 候选代码 AST。
    Returns:
        策略分支错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    for node in (item for item in ast.walk(tree) if isinstance(item, ast.FunctionDef)):
        equality_count = sum(
            isinstance(compare.ops[0], ast.Eq)
            for compare in ast.walk(node)
            if isinstance(compare, ast.Compare) and len(compare.ops) == 1
        )
        if equality_count >= 4:
            errors.append(f"函数 {node.name} 存在 {equality_count} 个相等判断，必须使用策略映射")
    return errors


def _validate_exception_and_output(source: str, tree: ast.AST) -> list[str]:
    """检查异常类型、异常链、日志边界和 stdout 输出边界。

    Args:
        source: 候选 Python 源码。
        tree: 候选代码 AST。
    Returns:
        异常和输出边界错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors = _validate_exception_handlers(tree)
    errors.extend(_validate_print_calls(tree))
    errors.extend(_validate_logging_calls(tree))
    if _has_remote_call(tree) and ("logging" not in source or ".debug(" not in source or ".warning(" not in source):
        errors.append("远程调用必须使用 DEBUG 记录开始/结束，并使用 WARN 记录失败")
    return errors


def _validate_exception_handlers(tree: ast.AST) -> list[str]:
    """拒绝普通逻辑捕获 Exception，并要求捕获后继续处理。

    Args:
        tree: 候选代码 AST。
    Returns:
        异常处理错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    parents = {id(child): parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
    for node in (item for item in ast.walk(tree) if isinstance(item, ast.ExceptHandler)):
        if isinstance(node.type, ast.Name) and node.type.id == "Exception":
            if not _is_stable_outer_wrapper(node, parents):
                errors.append(f"第 {node.lineno} 行禁止捕获 Exception，除非是最外层稳定兜底")
        if node.type is not None and not any(isinstance(child, (ast.Raise, ast.Call)) for child in ast.walk(node)):
            errors.append(f"第 {node.lineno} 行捕获异常后未处理")
    return errors


def _is_stable_outer_wrapper(node: ast.ExceptHandler, parents: dict[int, ast.AST]) -> bool:
    """允许入口层捕获异常后打印 traceback 并重新抛出。

    Args:
        node: 当前异常处理节点。
        parents: AST 父节点映射。
    Returns:
        是否为稳定协议入口的最外层兜底。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    parent = parents.get(id(node))
    while parent is not None:
        if isinstance(parent, ast.If):
            test = ast.unparse(parent.test)
            if "__name__" in test and "__main__" in test:
                return True
        if isinstance(parent, (ast.FunctionDef, ast.ClassDef, ast.Module)):
            return False
        parent = parents.get(id(parent))
    return False


def _validate_print_calls(tree: ast.AST) -> list[str]:
    """只允许输出统一 answer JSON，禁止普通 print 日志。

    Args:
        tree: 候选代码 AST。
    Returns:
        stdout 输出错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    for node in (item for item in ast.walk(tree) if isinstance(item, ast.Call)):
        if not isinstance(node.func, ast.Name) or node.func.id != "print":
            continue
        valid = bool(node.args) and isinstance(node.args[0], ast.Call)
        valid = valid and isinstance(node.args[0].func, ast.Attribute) and node.args[0].func.attr == "dumps"
        if not valid:
            errors.append(f"第 {node.lineno} 行禁止直接 print 非协议内容")
    return errors


def _validate_logging_calls(tree: ast.AST) -> list[str]:
    """检查 logging 消息的业务标识和占位符边界。

    Args:
        tree: 候选代码 AST。
    Returns:
        日志规范错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    for node in (item for item in ast.walk(tree) if isinstance(item, ast.Call) and isinstance(item.func, ast.Attribute)):
        if node.func.attr not in {"debug", "info", "warning", "error", "exception"} or not node.args:
            continue
        message = node.args[0]
        if isinstance(message, ast.Constant) and isinstance(message.value, str) and not message.value.startswith("["):
            errors.append(f"第 {node.lineno} 行日志缺少业务标识")
        if len(node.args) > 1 and isinstance(message, ast.Constant) and isinstance(message.value, str):
            if "%" not in message.value and "{}" not in message.value:
                errors.append(f"第 {node.lineno} 行日志必须使用占位符")
    return errors


def _has_remote_call(tree: ast.AST) -> bool:
    """判断脚本是否包含外部 HTTP 或 DSL 调用。

    Args:
        tree: 候选代码 AST。
    Returns:
        是否存在远程调用。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    return any(isinstance(node, ast.Call) and _RemoteCallInLoopVisitor._is_remote_call(node) for node in ast.walk(tree))


def _validate_contract(source: str, tree: ast.AST, allowed: set[str]) -> list[str]:
    """检查占位符、执行参数和基础 HTTP 协议。

    Args:
        source: 候选 Python 源码。
        tree: 候选代码 AST。
        allowed: 已登记运行时占位符。
    Returns:
        协议错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors = _validate_placeholders(source, allowed)
    errors.extend(_validate_read_only_access(source, tree))
    errors.extend(_validate_execution_protocol(source, tree))
    return errors


def _validate_read_only_access(source: str, tree: ast.AST) -> list[str]:
    """阻断直接数据库驱动、写 SQL 和 DDL。

    Args:
        source: 候选 Python 源码。
        tree: 候选代码 AST。
    Returns:
        只读边界错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-18
    """
    errors: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in FORBIDDEN_DB_IMPORTS:
                    errors.append(f"第 {node.lineno} 行禁止直接连接数据库驱动：{alias.name}")
        if isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root in FORBIDDEN_DB_IMPORTS:
                errors.append(f"第 {node.lineno} 行禁止直接连接数据库驱动：{node.module}")
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type == tokenize.STRING and WRITE_SQL.search(token.string):
            errors.append(f"第 {token.start[0]} 行禁止包含数据库写 SQL/DDL；业务写操作必须调用登记的业务接口")
    return errors


def _validate_placeholders(source: str, allowed: set[str]) -> list[str]:
    """检查占位符和禁止写死的地址、凭据内容。

    Args:
        source: 候选 Python 源码。
        allowed: 已登记运行时占位符。
    Returns:
        占位符和敏感信息错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    placeholders = set(PLACEHOLDER.findall(source))
    # 运行器会把双下划线标识解析为运行时变量；只有 Python 入口保留字可安全保留。
    unknown = sorted(placeholders - allowed - {"__main__", "__name__", "__file__"})
    if unknown:
        errors.append(f"未登记占位符：{', '.join(unknown)}")
    for pattern in FORBIDDEN:
        if pattern.search(source):
            errors.append(f"命中禁止内容：{pattern.pattern}")
    return errors


def _validate_execution_protocol(source: str, tree: ast.AST) -> list[str]:
    """检查 main、argv 参数、stdout JSON 和 timeout 执行协议。

    Args:
        source: 候选 Python 源码。
        tree: 候选代码 AST。
    Returns:
        执行协议错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    if not any(isinstance(node, ast.FunctionDef) and node.name == "main" for node in ast.walk(tree)):
        errors.append("必须提供 main()")
    has_argv_slice = "sys.argv[1:4]" in source
    has_argv_items = all(f"sys.argv[{index}]" in source for index in range(1, 4))
    if not has_argv_slice and not has_argv_items:
        errors.append("必须读取 sys.argv[1:4] 的执行协议")
    if '"answer"' not in source or "json.dumps" not in source:
        errors.append("stdout 必须输出 JSON answer")
    if "timeout" not in source:
        errors.append("HTTP 请求必须配置 timeout")
    return errors


def _validate_structure(source: str, tree: ast.AST) -> list[str]:
    """检查循环调用、响应结构、deadline 和资源上限。

    Args:
        source: 候选 Python 源码。
        tree: 候选代码 AST。
    Returns:
        可靠性结构错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    remote_visitor = _RemoteCallInLoopVisitor()
    remote_visitor.visit(tree)
    if remote_visitor.found:
        errors.append("禁止在循环内调用远程服务或指标查询函数")
    if not _has_strict_answer_validation(source):
        errors.append("必须严格校验 data、answer 存在性及 answer 列表类型")
    if not _has_empty_result_mock_fallback(source):
        errors.append("成功空结果必须生成 schema-compatible mock 数据，不能直接返回空列表")
    if "monotonic" not in source:
        errors.append("必须设置整体执行 deadline，使用 monotonic 计算剩余时间")
    if "MAX_RESULT_ROWS" not in source and '"limit"' not in source and "'limit'" not in source:
        errors.append("必须设置查询或结果资源上限")
    return errors


def _validate_http_timeouts(tree: ast.AST) -> list[str]:
    """检查 HTTP 调用是否使用命名 timeout。

    Args:
        tree: 候选代码 AST。
    Returns:
        timeout 错误列表。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    errors: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr in REMOTE_METHODS and any(keyword.arg == "timeout" for keyword in node.keywords):
            if not _is_constant_timeout(node):
                errors.append("HTTP timeout 必须使用命名常量")
    return errors


def validate(source: str, allowed: set[str], expected_keys: list[str] | None = None) -> list[str]:
    """返回可修复的静态 Coding Gate 错误。

    Args:
        source: 候选 Python 源码。
        allowed: 已登记运行时占位符。
        expected_keys: 从 returnDef.outKeyRefs 提取的最终字段；未提供时只执行基础协议门禁。
    Returns:
        所有门禁错误列表；为空表示通过。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    tree, errors = _parse_source(source)
    if tree is None:
        return errors
    errors.extend(_validate_contract(source, tree, allowed))
    errors.extend(_validate_documentation(source, tree))
    errors.extend(_validate_comment_ratio(source, tree))
    errors.extend(_validate_branch_comments(source, tree))
    errors.extend(_validate_file_and_functions(source, tree))
    errors.extend(_validate_names_and_imports(tree))
    errors.extend(_validate_magic_numbers(tree))
    errors.extend(_validate_magic_strings(tree))
    errors.extend(_validate_boolean_names(tree))
    errors.extend(_validate_loop_string_concat(tree))
    errors.extend(_validate_strategy_branches(tree))
    errors.extend(_validate_exception_and_output(source, tree))
    errors.extend(_validate_structure(source, tree))
    errors.extend(_validate_mock_answer(tree))
    errors.extend(_validate_output_schema(tree, expected_keys))
    errors.extend(_validate_http_timeouts(tree))
    return errors


def main() -> int:
    """执行命令行校验并输出机器可读结果。

    Returns:
        通过返回 0，失败返回 1。
    Author: lvdaxianer@yeah.net
    Date: 2026-11-16
    """
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--variables", type=Path, required=True)
    parser.add_argument(
        "--return-def",
        type=Path,
        help="可选的 MetricView returnDef 或完整定义 JSON，用于校验 OUTPUT_KEYS 和 MOCK_ANSWER",
    )
    args = parser.parse_args()
    expected_keys = None
    if args.return_def:
        try:
            expected_keys = extract_output_keys(json.loads(args.return_def.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError, ValueError) as error:
            errors = [f"输出契约读取失败：{error}"]
        else:
            errors = validate(
                args.source.read_text(encoding="utf-8"),
                load_variables(args.variables),
                expected_keys,
            )
    else:
        errors = validate(args.source.read_text(encoding="utf-8"), load_variables(args.variables))
    print(json.dumps({"ok": not errors, "errors": errors}, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
