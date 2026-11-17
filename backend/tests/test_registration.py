import unittest
from unittest.mock import patch

from backend.eligibility import _registration_policy_allows
from backend.registration import derive_evaluator_group, unit_category


class RegistrationProfileTests(unittest.TestCase):
    def test_role_and_database_categories_determine_evaluator_group(self):
        self.assertEqual(derive_evaluator_group("teaching_faculty", []), "faculty")
        self.assertEqual(derive_evaluator_group("student_leader", []), "student_leader")
        self.assertEqual(
            derive_evaluator_group("non_teaching_staff", ["campus_head"]),
            "campus_staff",
        )
        self.assertEqual(derive_evaluator_group("non_teaching_staff", ["vp"]), "office_staff")
        self.assertEqual(
            derive_evaluator_group("non_teaching_staff", ["campus_head", "vp"]),
            "office_staff",
        )

    def test_non_teaching_role_requires_a_database_membership_category(self):
        with self.assertRaises(ValueError):
            derive_evaluator_group("non_teaching_staff", [])
        with self.assertRaises(ValueError):
            derive_evaluator_group("other_role", ["director"])

    def test_unit_category_is_loaded_from_database(self):
        with patch(
            "backend.registration.fetch_one",
            return_value={"category": "director"},
        ) as fetch:
            self.assertEqual(unit_category(None, "BAC"), "director")

        self.assertIn("FROM registration_units", fetch.call_args.args[1])
        self.assertEqual(fetch.call_args.args[2], ("BAC",))
        with self.assertRaises(ValueError):
            derive_evaluator_group("unknown_role", [])

    def test_registered_office_staff_can_evaluate_vp_target(self):
        user = {"id": 8, "campus_id": 1, "evaluator_group": "office_staff", "office_unit_code": "BAC"}
        target = {
            "target_type": "administrator",
            "target_office_id": 21,
            "target_administrator_id": 90,
            "office_unit_code": "VP_ACADEMIC",
            "campus_id": 1,
        }
        with patch(
            "backend.eligibility.fetch_one",
            side_effect=[None, None, None],
        ), patch("registration.fetch_one", return_value={"category": "vp"}), patch(
            "backend.eligibility.fetch_all", return_value=[]
        ):
            self.assertTrue(_registration_policy_allows(None, user, target))

    def test_registered_office_staff_can_evaluate_a_selected_office_target(self):
        user = {"id": 8, "campus_id": 1, "evaluator_group": "office_staff", "office_unit_code": "BAC"}
        target = {
            "target_type": "office",
            "target_office_id": 5,
            "target_administrator_id": None,
            "office_unit_code": "BAC",
            "campus_id": 1,
        }
        with patch("backend.eligibility.fetch_one", side_effect=[{"id": 5}, None]), patch(
            "backend.eligibility.fetch_all", return_value=[]
        ):
            self.assertTrue(_registration_policy_allows(None, user, target))

    def test_membership_based_staff_can_evaluate_a_selected_office(self):
        user = {"id": 8, "campus_id": 1, "evaluator_group": "office_staff", "office_unit_code": None}
        target = {
            "target_type": "office",
            "target_office_id": 5,
            "target_administrator_id": None,
            "office_unit_code": "BAC",
            "campus_id": 1,
        }
        with patch("backend.eligibility.fetch_one", return_value=None), patch(
            "backend.eligibility.fetch_all",
            return_value=[{"office_id": 5}],
        ):
            self.assertTrue(_registration_policy_allows(None, user, target))

    def test_office_head_cannot_evaluate_the_office_they_manage(self):
        user = {"id": 8, "campus_id": 1, "evaluator_group": "office_staff", "office_unit_code": None}
        target = {
            "target_type": "office",
            "target_office_id": 5,
            "target_administrator_id": None,
            "office_unit_code": "BAC",
            "campus_id": 1,
        }
        with patch(
            "backend.eligibility.fetch_one",
            return_value={
                "office_id": 5,
                "administrator_id": 90,
                "reports_to_vp_office_id": None,
                "unit_code": "BAC",
            },
        ), patch("backend.eligibility.fetch_all", return_value=[]):
            self.assertFalse(_registration_policy_allows(None, user, target))


if __name__ == "__main__":
    unittest.main()
