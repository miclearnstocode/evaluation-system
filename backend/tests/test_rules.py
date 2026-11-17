import unittest

from backend.app import is_eligible, rule_matches


class EligibilityTests(unittest.TestCase):
    def setUp(self):
        self.campus_user = {
            "campus_id": 2,
            "evaluator_group": "student",
            "is_central_staff": 0,
        }
        self.central_user = {
            "campus_id": 1,
            "evaluator_group": "staff",
            "is_central_staff": 1,
        }

    def test_campus_evaluators_can_evaluate_central_targets(self):
        rules = [
            {
                "evaluator_is_central": 0,
                "evaluator_group": None,
                "target_is_central": 1,
                "same_campus": None,
                "effect": "allow",
            }
        ]
        self.assertTrue(is_eligible(self.campus_user, {"campus_id": 1, "is_central": 1}, rules))

    def test_campus_users_can_evaluate_own_campus_only_when_rule_allows(self):
        allow_own_campus = {
            "evaluator_is_central": 0,
            "evaluator_group": None,
            "target_is_central": 0,
            "same_campus": 1,
            "effect": "allow",
        }
        self.assertTrue(is_eligible(self.campus_user, {"campus_id": 2, "is_central": 0}, [allow_own_campus]))
        self.assertFalse(is_eligible(self.campus_user, {"campus_id": 3, "is_central": 0}, [allow_own_campus]))

    def test_central_staff_can_evaluate_central_targets(self):
        rule = {
            "evaluator_is_central": 1,
            "evaluator_group": None,
            "target_is_central": 1,
            "same_campus": None,
            "effect": "allow",
        }
        self.assertTrue(is_eligible(self.central_user, {"campus_id": 1, "is_central": 1}, [rule]))

    def test_deny_rule_wins_for_central_staff_and_campus_targets(self):
        rules = [
            {
                "evaluator_is_central": 1,
                "evaluator_group": None,
                "target_is_central": None,
                "same_campus": None,
                "effect": "allow",
            },
            {
                "evaluator_is_central": 1,
                "evaluator_group": None,
                "target_is_central": 0,
                "same_campus": None,
                "effect": "deny",
            },
        ]
        self.assertFalse(is_eligible(self.central_user, {"campus_id": 2, "is_central": 0}, rules))

    def test_rule_matching_treats_null_as_wildcard(self):
        rule = {
            "evaluator_is_central": None,
            "evaluator_group": "student",
            "target_is_central": None,
            "same_campus": None,
            "effect": "allow",
        }
        self.assertTrue(rule_matches(rule, self.campus_user, {"campus_id": 7, "is_central": 0}))


if __name__ == "__main__":
    unittest.main()
