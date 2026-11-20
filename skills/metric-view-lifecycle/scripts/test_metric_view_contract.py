#!/usr/bin/env python3
"""验证 MetricView 定义和管理接口请求体契约。"""

from __future__ import annotations

import copy
import unittest

from metric_view_contract import ContractViolation, validate_definition, validate_request


VALID_DEFINITION = {
    "name": "按区域查询",
    "description": "按区域查询指标",
    "status": "PENDING_REVIEW",
    "type": "METRIC_VIEW",
    "origin": "CUSTOM",
    "matchQuestions": ["按区域查询"],
    "typeContext": {
        "fields": {"fact.region": "VARCHAR"},
        "predicates": [{
            "field": "fact.region",
            "operator": "eq",
            "parameter": "region",
            "logicalType": "string",
        }],
    },
    "function": {
        "name": "按区域查询",
        "operation": "OPERATION_READ",
        "parameters": [{"name": "region", "type": "TYPE_STRING"}],
        "returnDef": {"outKeyRefs": [{"key": "region"}, {"key": "value"}]},
        "logic": "按区域过滤并返回指标值",
        "code": "def main():\n    return []\n",
    },
}


class MetricViewContractTest(unittest.TestCase):
    """覆盖定义结构、开放值证据和每个管理端点的请求体。"""

    def test_complete_create_definition_passes(self) -> None:
        """完整创建定义通过契约门禁。"""
        validate_definition(copy.deepcopy(VALID_DEFINITION), mode="create")

    def test_missing_top_level_name_is_rejected(self) -> None:
        """缺少名称时返回字段路径。"""
        candidate = copy.deepcopy(VALID_DEFINITION)
        candidate.pop("name")
        with self.assertRaisesRegex(ContractViolation, "name"):
            validate_definition(candidate, mode="create")

    def test_missing_nested_function_fields_are_rejected(self) -> None:
        """函数关键字段缺失时必须逐层阻断。"""
        for field in ("code", "parameters", "returnDef", "logic"):
            candidate = copy.deepcopy(VALID_DEFINITION)
            candidate["function"].pop(field)
            with self.subTest(field=field), self.assertRaisesRegex(ContractViolation, f"function\\.{field}"):
                validate_definition(candidate, mode="create")

    def test_missing_type_context_is_rejected(self) -> None:
        """类型证据缺失时不能进入远程测试。"""
        candidate = copy.deepcopy(VALID_DEFINITION)
        candidate.pop("typeContext")
        with self.assertRaisesRegex(ContractViolation, "typeContext"):
            validate_definition(candidate, mode="create")

    def test_empty_output_keys_are_rejected(self) -> None:
        """最终输出字段不能为空。"""
        candidate = copy.deepcopy(VALID_DEFINITION)
        candidate["function"]["returnDef"]["outKeyRefs"] = []
        with self.assertRaisesRegex(ContractViolation, "outKeyRefs"):
            validate_definition(candidate, mode="create")

    def test_duplicate_parameter_names_are_rejected(self) -> None:
        """参数名重复会造成运行时绑定歧义。"""
        candidate = copy.deepcopy(VALID_DEFINITION)
        candidate["function"]["parameters"].append({"name": "region", "type": "TYPE_STRING"})
        with self.assertRaisesRegex(ContractViolation, "parameters\\[1\\]\\.name"):
            validate_definition(candidate, mode="create")

    def test_unregistered_parameter_type_is_rejected(self) -> None:
        """未登记的 MetricView 参数类型不能被猜测接受。"""
        candidate = copy.deepcopy(VALID_DEFINITION)
        candidate["function"]["parameters"][0]["type"] = "TYPE_DATETIME"
        with self.assertRaisesRegex(ContractViolation, "TYPE_DATETIME"):
            validate_definition(candidate, mode="create")

    def test_update_requires_stable_id(self) -> None:
        """更新必须携带稳定对象 ID。"""
        with self.assertRaisesRegex(ContractViolation, "id"):
            validate_definition(copy.deepcopy(VALID_DEFINITION), mode="update")

    def test_unknown_status_requires_authoritative_evidence(self) -> None:
        """未知状态不能仅凭 fixture 或模型猜测通过。"""
        candidate = copy.deepcopy(VALID_DEFINITION)
        candidate["status"] = "ARCHIVED"
        with self.assertRaisesRegex(ContractViolation, "status"):
            validate_definition(candidate, mode="create")

    def test_endpoint_request_shapes_are_distinct(self) -> None:
        """五个接口分别接受最小查询体、裸定义和执行包装体。"""
        definition = copy.deepcopy(VALID_DEFINITION)
        validate_request("queryList", {"name": "按区域查询"})
        validate_request("queryById", {"id": "mv-1"})
        validate_request("test", definition)
        validate_request("testExecute", {"metricView": definition, "param": {"region": "华东"}})
        validate_request("save", definition)

    def test_invalid_endpoint_wrapper_is_rejected_before_remote_call(self) -> None:
        """错误请求包装体必须返回端点和字段路径。"""
        with self.assertRaisesRegex(ContractViolation, "testExecute\\.metricView"):
            validate_request("testExecute", {"metricView": {"name": "不完整"}, "param": {}})


if __name__ == "__main__":
    unittest.main()
