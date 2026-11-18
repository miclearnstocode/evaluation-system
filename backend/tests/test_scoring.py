import unittest
from decimal import Decimal

from backend.scoring import calculate_response_scores


class ResponseScoringTests(unittest.TestCase):
    def test_scores_answers_and_averages_dynamic_sections(self):
        sections = [
            {
                "id": 10,
                "title": "Service",
                "questions": [
                    {"id": 1, "type": "scale", "score_weight": 2.5},
                    {"id": 2, "type": "yes_no", "score_weight": 3},
                    {
                        "id": 3,
                        "type": "single_choice",
                        "options": [{"id": 31, "points": 2.25}],
                    },
                    {
                        "id": 4,
                        "type": "multi_choice",
                        "options": [{"id": 41, "points": 1.5}, {"id": 42, "points": 3}],
                    },
                    {"id": 5, "type": "text"},
                ],
            },
            {"id": 20, "title": "Support", "questions": [{"id": 6, "type": "rating", "score_weight": 1}]},
        ]

        result = calculate_response_scores(
            sections,
            [(1, 4), (2, 1), (3, 31), (4, [41, 42]), (5, "Helpful"), (6, 1)],
        )

        self.assertEqual(result["section_scores"][0]["score"], Decimal("19.75"))
        self.assertEqual(result["section_scores"][1]["score"], Decimal("1.00"))
        self.assertEqual(result["total_score"], Decimal("20.75"))
        self.assertEqual(result["mean_score"], Decimal("10.38"))
        self.assertIsNone(result["question_scores"][5])
        self.assertEqual(result["question_scores"][4], Decimal("4.50"))

    def test_unanswered_and_empty_sections_contribute_zero_to_mean(self):
        result = calculate_response_scores(
            [
                {"id": 1, "title": "Answered", "questions": [{"id": 1, "type": "yes_no"}]},
                {"id": 2, "title": "Empty", "questions": []},
            ],
            [],
        )

        self.assertEqual(result["section_count"], 2)
        self.assertEqual(result["total_score"], Decimal("0.00"))
        self.assertEqual(result["mean_score"], Decimal("0.00"))


if __name__ == "__main__":
    unittest.main()
