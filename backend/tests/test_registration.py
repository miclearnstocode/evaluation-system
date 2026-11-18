import unittest
from unittest.mock import patch

from backend.eligibility import _registration_policy_allows
from backend.registration import derive_evaluator_group


class RegistrationProfileTests(unittest.TestCase):
    def test_role_and_target_types_determine_evaluator_group(self):
        self.assertEqual(derive_evaluator_group("teaching_faculty", []), "faculty")
        self.assertEqual(derive_evaluator_group("student_leader", []), "student_leader")
        self.assertEqual(
            derive_evaluator_group("non_teaching_staff", ["campus_administrator"]),
            "campus_staff",
        )
        self.assertEqual(
            derive_evaluator_group(
                "non_teaching_staff",
                ["campus_administrator", "satellite_college_director"],
            ),
            "campus_staff",
        )
        self.assertEqual(derive_evaluator_group("non_teaching_staff", ["director"]), "office_staff")
        self.assertEqual(
            derive_evaluator_group("non_teaching_staff", ["campus_administrator", "director"]),
            "office_staff",
        )

    def test_non_teaching_role_requires_an_assignment(self):
        with self.assertRaises(ValueError):
            derive_evaluator_group("non_teaching_staff", [])
        with self.assertRaises(ValueError):
            derive_evaluator_group("other_role", ["director"])

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
