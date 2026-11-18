import unittest
from unittest.mock import patch

from backend.eligibility import _registration_policy_allows


class RegistrationProfileTests(unittest.TestCase):
    def test_evaluator_cannot_evaluate_a_target_they_are_assigned_to(self):
        user = {"id": 8}
        target = {"id": 14}
        with patch(
            "backend.eligibility.fetch_one",
            return_value={"id": 5},
        ) as fetch:
            self.assertFalse(_registration_policy_allows(None, user, target))
        self.assertIn("user_office_assignments", fetch.call_args.args[1])
        self.assertEqual(fetch.call_args.args[2], (8, 14))

    def test_evaluator_can_evaluate_unassigned_target(self):
        with patch("backend.eligibility.fetch_one", return_value=None):
            self.assertTrue(_registration_policy_allows(None, {"id": 8}, {"id": 14}))

    def test_missing_user_or_target_id_does_not_query_assignment_table(self):
        with patch("backend.eligibility.fetch_one") as fetch:
            self.assertTrue(_registration_policy_allows(None, {}, {"id": 14}))
            fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
