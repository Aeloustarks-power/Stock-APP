import re
import unittest

import main


class TestRulesFullSummaryFallback(unittest.TestCase):
    def test_rules_full_summary_is_15_numbered_lines(self):
        policy_report = {
            "combined_dip_level": 0,
            "qqq": {"dip_level": 0},
            "spy": {"dip_level": 0},
            "why_no_other_actions": [],
            "uncertainty_notes": [],
            "warnings": [],
            "positions": [],
            "sector_breakdown": [],
            "policy": {
                "recommended_actions": [],
                "totals": {
                    "cash_usd": 0.0,
                    "cash_pct": 0.0,
                    "cash_needed_usd": 0.0,
                    "excess_cash_usd": 0.0,
                    "total_value": 0.0,
                    "deploy_budget_usd": 0.0,
                },
                "constraints": {"cash_floor_pct": 0.15},
            },
        }
        text = main.rules_full_summary_from_policy(policy_report)
        lines = [ln for ln in text.splitlines() if ln.strip()]
        self.assertEqual(15, len(lines))
        for i, ln in enumerate(lines, start=1):
            self.assertRegex(ln, rf"^{i}\)\s+")

    def test_rules_only_summary_is_9_numbered_lines(self):
        policy_report = {"policy": {"recommended_actions": []}}
        text = main.rules_only_summary_from_policy(policy_report)
        lines = [ln for ln in text.splitlines() if ln.strip()]
        self.assertEqual(9, len(lines))
        for i, ln in enumerate(lines, start=1):
            self.assertRegex(ln, rf"^{i}\)\s+")


if __name__ == "__main__":
    unittest.main()

