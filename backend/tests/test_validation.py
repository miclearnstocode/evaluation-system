import unittest

from backend.app import ApiError, validate_questions, validate_survey_payload


class SubmissionValidationTests(unittest.TestCase):
    def setUp(self):
        self.questions = [
            {"id": 1, "type": "scale", "required": True, "scale_min": 1, "scale_max": 5, "options": []},
            {"id": 2, "type": "single_choice", "required": True, "options": [{"id": 21}, {"id": 22}]},
            {"id": 3, "type": "multi_choice", "required": False, "options": [{"id": 31}, {"id": 32}]},
            {"id": 4, "type": "yes_no", "required": True, "options": []},
            {"id": 5, "type": "text", "required": False, "options": []},
        ]

    def test_valid_answers_become_aggregate_values_and_standalone_comments(self):
        tallies, comments = validate_questions(
            self.questions,
            {"1": 4, "2": 21, "3": [31, 32], "4": True, "5": "  Nice service  "},
        )
        self.assertEqual(tallies, [(1, 4), (2, 21), (3, 31), (3, 32), (4, 1)])
        self.assertEqual(comments, [(5, "Nice service")])

    def test_rejects_unknown_question_and_invalid_options(self):
        with self.assertRaises(ApiError):
            validate_questions(self.questions, {"1": 3, "2": 999, "4": False})
        with self.assertRaises(ApiError):
            validate_questions(self.questions, {"1": 3, "2": 21, "3": [31, 31], "4": False})

    def test_rejects_missing_required_and_out_of_range_answers(self):
        with self.assertRaises(ApiError):
            validate_questions(self.questions, {"1": 3, "2": 21})
        with self.assertRaises(ApiError):
            validate_questions(self.questions, {"1": 6, "2": 21, "4": False})

    def test_survey_rejects_identifying_questions(self):
        with self.assertRaises(ApiError):
            validate_survey_payload(
                [{"title": "About you", "questions": [{"type": "text", "text": "What is your email address?"}]}]
            )

    def test_survey_validates_choice_options_and_accepts_safe_content(self):
        sections = validate_survey_payload(
            [
                {
                    "title": "Service",
                    "questions": [
                        {"type": "scale", "text": "How satisfied are you?", "required": True},
                        {"type": "single_choice", "text": "Which service did you use?", "options": ["Library", "Registrar"]},
                    ],
                }
            ]
        )
        self.assertEqual(len(sections[0]["questions"]), 2)
        with self.assertRaises(ApiError):
            validate_survey_payload(
                [{"title": "Service", "questions": [{"type": "single_choice", "text": "Choose one", "options": ["Same", "Same"]}]}]
            )


if __name__ == "__main__":
    unittest.main()
