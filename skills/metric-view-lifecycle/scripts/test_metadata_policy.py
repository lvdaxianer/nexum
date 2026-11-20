"""验证指标视图 Skill 的 DDL 与 MySQL 元数据核验门禁。"""

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class MetadataPolicyTest(unittest.TestCase):
    """保证缺少元数据证据时不会静默进入真实生成流程。"""

    def test_skill_requires_mysql_metadata_unless_ddl_consistency_is_asserted(self):
        """检查一致性声明、MySQL 优先和显式合成授权规则。"""
        # 读取 Skill 契约文本，避免把策略只实现成不可见的运行时代码。
        skill_text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        execution_text = (ROOT / "references/execution-modes.md").read_text(
            encoding="utf-8"
        )
        metadata_text = (ROOT / "references/metadata-verification.md").read_text(
            encoding="utf-8"
        )

        self.assertIn("DDL 与 MySQL 元信息一致", skill_text)
        self.assertIn("MySQL 元数据为准", skill_text)
        self.assertIn("必须反问", skill_text)
        self.assertIn("不能自动进入合成模式", execution_text)
        self.assertIn("information_schema", metadata_text)
        self.assertIn("只读", metadata_text)

    def test_default_entry_gate_requires_explicit_mysql_bypass(self):
        """检查需求入口默认先询问 MySQL，未豁免不得继续生命周期操作。"""
        skill_text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        requirement_text = (ROOT / "references/subskills/requirement-understanding.md").read_text(
            encoding="utf-8"
        )
        execution_text = (ROOT / "references/execution-modes.md").read_text(
            encoding="utf-8"
        )

        self.assertIn("默认必须先询问用户 MySQL", skill_text)
        self.assertIn("未明确豁免", skill_text)
        self.assertIn("不能生成 DSL/Python", skill_text)
        self.assertIn("不能调用 `test`、`testExecute`、`save`", skill_text)
        self.assertIn("默认必须先询问 MySQL", requirement_text)
        self.assertIn("明确豁免", execution_text)


if __name__ == "__main__":
    unittest.main()
