import json
import unittest
from contextlib import contextmanager
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

from backend.app import create_app


class SubmissionCursor:
    lastrowid = 77

    def __init__(self):
        self.executed = []
        self.batch_executed = []

    def execute(self, query, parameters=()):
        self.executed.append((query, parameters))

    def executemany(self, query, parameters):
        self.batch_executed.append((query, list(parameters)))

    def close(self):
        pass


class SubmissionConnection:
    def __init__(self):
        self.db_cursor = SubmissionCursor()
        self.committed = False

    def cursor(self, dictionary=False):
        return self.db_cursor

    def start_transaction(self):
        pass

    def commit(self):
        self.committed = True

    def rollback(self):
        self.committed = False


class EvaluationScoringPersistenceTests(unittest.TestCase):
    def test_submit_persists_anonymous_answer_and_section_scores(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = SubmissionConnection()
        cycle = {
            "id": 3,
            "survey_id": 4,
            "status": "open",
            "opens_at": datetime(2026, 1, 1),
            "closes_at": datetime(2027, 1, 1),
        }
        survey = {
            "status": "published",
            "sections": [
                {
                    "id": 10,
                    "title": "Service",
                    "questions": [
                        {
                            "id": 1,
                            "type": "scale",
                            "required": True,
                            "scale_min": 1,
                            "scale_max": 5,
                            "score_weight": Decimal("2.00"),
                            "options": [],
                        },
                        {
                            "id": 2,
                            "type": "single_choice",
                            "required": True,
                            "options": [{"id": 21, "points": Decimal("2.50")}],
                        },
                    ],
                },
                {
                    "id": 20,
                    "title": "Support",
                    "questions": [
                        {
                            "id": 3,
                            "type": "yes_no",
                            "required": True,
                            "score_weight": Decimal("3.00"),
                            "options": [],
                        }
                    ],
                },
            ],
        }

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.core._current_user", return_value={"id": 7, "role": "evaluator"}), patch(
            "backend.routes.evaluator.connection", fake_connection
        ), patch("backend.routes.evaluator.fetch_one", side_effect=[cycle, None]), patch(
            "backend.routes.evaluator._cycle_is_open", return_value=True
        ), patch(
            "backend.routes.evaluator._load_cycle_target", return_value={"id": 9}
        ), patch(
            "backend.routes.evaluator._cycle_user_eligible", return_value=True
        ), patch(
            "backend.routes.evaluator._load_survey", return_value=survey
        ):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 7
            response = client.post(
                "/api/evaluator/submit",
                json={"cycle_id": 3, "target_id": 9, "answers": {"1": 4, "2": 21, "3": True}},
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json(), {"status": "submitted"})
        self.assertTrue(connection.committed)

        queries = connection.db_cursor.executed
        score_insert = next(
            parameters
            for query, parameters in queries
            if "INSERT INTO evaluator_response_scores" in query
        )
        self.assertEqual(score_insert[4:7], (Decimal("13.50"), Decimal("6.75"), 2))
        saved_sections = json.loads(score_insert[7])
        self.assertEqual([section["score"] for section in saved_sections], [10.5, 3.0])

        answer_insert = next(
            parameters
            for query, parameters in connection.db_cursor.batch_executed
            if "INSERT INTO evaluator_answers" in query
        )
        self.assertEqual([answer[7] for answer in answer_insert], [
            Decimal("8.00"),
            Decimal("2.50"),
            Decimal("3.00"),
        ])
        participation_token = next(
            parameters[0]
            for query, parameters in queries
            if "INSERT INTO participation" in query
        )
        self.assertEqual(score_insert[1], participation_token)
        self.assertTrue(any("submission_token" in query for query, _ in connection.db_cursor.batch_executed))
        self.assertNotIn("response_id", response.get_json())


if __name__ == "__main__":
    unittest.main()
