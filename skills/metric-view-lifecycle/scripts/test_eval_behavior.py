"""Verify that critical eval cases declare executable behavior expectations."""

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class EvalBehaviorTests(unittest.TestCase):
    def test_critical_cases_have_state_and_action_expectations(self):
        payload = json.loads((ROOT / "evals" / "evals.json").read_text())
        cases = {case["id"]: case for case in payload["cases"]}
        expected = {
            "default-mysql-question-gate",
            "update-existing",
            "blocked-mode-terminal-state",
            "explicit-synthetic-only",
            "api-forbidden-stop",
        }
        self.assertTrue(expected.issubset(cases))
        for case_id in expected:
            behavior = cases[case_id].get("behavior")
            self.assertIsInstance(behavior, dict, case_id)
            self.assertTrue(
                any(key in behavior for key in ("state", "errorCode", "onConflict")),
                case_id,
            )
            self.assertIsInstance(behavior.get("evidence"), list, case_id)

        self.assertEqual(
            cases["default-mysql-question-gate"]["behavior"]["remoteCalls"], 0
        )
        self.assertEqual(
            cases["api-forbidden-stop"]["behavior"]["repairCalls"], 0
        )


if __name__ == "__main__":
    unittest.main()
