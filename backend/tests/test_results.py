import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from backend.app import create_app


class ResultsCursor:
    def __init__(self):
        self.executed = []

    def execute(self, query, parameters=None):
        self.executed.append((query, parameters))

    def close(self):
        pass


class ResultsConnection:
    def __init__(self):
        self.db_cursor = ResultsCursor()

    def cursor(self, dictionary=False):
        return self.db_cursor

    def commit(self):
        pass

    def start_transaction(self):
        pass

    def rollback(self):
        pass


class AdminResultsTests(unittest.TestCase):
    def test_submission_review_returns_content_without_identity_or_token(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        token = "123e4567-e89b-12d3-a456-426614174000"

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.core._current_user", return_value={"id": 1, "role": "super_admin"}), patch(
            "backend.routes.admin.connection", fake_connection
        ), patch(
            "backend.routes.admin.fetch_one",
            side_effect=[
                {"cycle_id": 3, "target_id": 9},
                {
                    "status": "open",
                    "opens_at": now - timedelta(minutes=1),
                    "closes_at": now + timedelta(minutes=1),
                },
            ],
        ), patch(
            "backend.routes.admin.fetch_all",
            side_effect=[
                [
                    {
                        "question_id": 12,
                        "answer_value": '"Please email evaluator@capsu.edu.ph"',
                        "score": None,
                        "prompt": "Additional comments",
                        "question_type": "text",
                    }
                ],
                [
                    {
                        "id": 44,
                        "question_id": 12,
                        "question": "Additional comments",
                        "comment_text": "evaluator@capsu.edu.ph",
                        "status": "pending",
                    }
                ],
            ],
        ) as fetch_all, patch("backend.routes.admin._audit"):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.post(
                "/api/admin/submissions/review",
                json={"submission_token": token},
            )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["answers"][0]["answer"], "Please email [email redacted]")
        self.assertEqual(body["comments"][0]["comment_text"], "[email redacted]")
        self.assertNotIn(token, response.get_data(as_text=True))
        self.assertNotIn("user_id", response.get_data(as_text=True))
        self.assertTrue(all("participation" not in call.args[1] and "users" not in call.args[1] for call in fetch_all.call_args_list))

    def test_submission_delete_retracts_counts_before_cascade_delete(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        token = "123e4567-e89b-12d3-a456-426614174000"

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.core._current_user", return_value={"id": 1, "role": "super_admin"}), patch(
            "backend.routes.admin.connection", fake_connection
        ), patch(
            "backend.routes.admin.fetch_one",
            return_value={"cycle_id": 3, "target_id": 9},
        ), patch(
            "backend.routes.admin.fetch_all",
            return_value=[{"question_id": 12, "answer_value": "4", "question_type": "scale"}],
        ), patch("backend.routes.admin._audit"):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.delete(
                "/api/admin/submissions",
                json={"submission_token": token},
            )

        self.assertEqual(response.status_code, 200)
        queries = [query for query, _ in connection.db_cursor.executed]
        self.assertTrue(any("UPDATE answer_tallies SET cnt = cnt - 1" in query for query in queries))
        self.assertTrue(any("UPDATE response_counts SET total_submissions" in query for query in queries))
        self.assertTrue(any("DELETE FROM participation" in query for query in queries))

    def test_open_cycle_comments_are_visible_as_they_arrive(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        cycle = {
            "id": 3,
            "status": "open",
            "opens_at": now - timedelta(minutes=1),
            "closes_at": now + timedelta(minutes=1),
            "min_responses": 5,
        }
        comment = {
            "id": 12,
            "question_id": 12,
            "body": "Please contact me at evaluator@capsu.edu.ph",
            "status": "pending",
            "question_text": "Additional comments",
        }

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.core._current_user", return_value={"id": 1, "role": "super_admin"}), patch(
            "backend.routes.admin.connection",
            fake_connection,
        ), patch("backend.routes.admin.fetch_one", return_value=cycle), patch(
            "backend.routes.admin._load_cycle_target",
            return_value={"target_name": "Office Alpha"},
        ), patch("backend.routes.admin.fetch_all", return_value=[comment]), patch("backend.routes.admin._audit"):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.get("/api/admin/comments?cycle_id=3&target_id=9")

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(len(body["items"]), 1)
        self.assertEqual(body["items"][0]["body"], "Please contact me at [email redacted]")
        self.assertNotIn("minimum", body)

    def test_open_cycle_comments_can_be_moderated(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        comment = {
            "id": 12,
            "cycle_id": 3,
            "target_id": 9,
            "question_id": 12,
            "cycle_status": "open",
            "opens_at": now - timedelta(minutes=1),
            "closes_at": now + timedelta(minutes=1),
        }

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.core._current_user", return_value={"id": 1, "role": "super_admin"}), patch(
            "backend.routes.admin.connection",
            fake_connection,
        ), patch("backend.routes.admin.fetch_one", return_value=comment), patch("backend.routes.admin._audit"):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.post(
                "/api/admin/comments/12/moderate",
                json={"status": "approved"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "approved"})

    def test_open_cycle_releases_first_aggregate_without_comments_or_evaluator_identity(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        cycle = {
            "id": 3,
            "survey_id": 4,
            "name": "Current evaluation",
            "status": "open",
            "closes_at": "2099-01-01 00:00:00",
            "min_responses": 5,
        }
        survey = {
            "sections": [
                {
                    "questions": [
                        {
                            "id": 11,
                            "question_text": "Service rating",
                            "type": "rating",
                            "options": [],
                        },
                        {
                            "id": 12,
                            "question_text": "Additional comments",
                            "type": "text",
                            "options": [],
                        },
                    ],
                },
            ],
        }

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.core._current_user", return_value={"id": 1, "role": "super_admin"}), patch(
            "backend.routes.admin.connection",
            fake_connection,
        ), patch("backend.routes.admin.fetch_one", return_value=cycle), patch(
            "backend.routes.admin._load_cycle_target",
            return_value={"target_name": "Office Alpha"},
        ), patch(
            "backend.routes.admin.fetch_all",
            side_effect=[
                [{"total": 1}],
                [
                    {
                        "response_id": "private-response-id",
                        "question_id": 11,
                        "answer_value": "4",
                        "question_score": "8.00",
                    },
                    {
                        "response_id": "private-response-id",
                        "question_id": 12,
                        "answer_value": '"Please email me at mmestorque@capsu.edu.ph"',
                        "question_score": None,
                    },
                ],
                [
                    {
                        "response_id": "private-response-id",
                        "total_score": "8.00",
                        "mean_score": "4.00",
                        "section_scores": '[{"section_id":1,"title":"Service","score":8.0},{"section_id":2,"title":"Comments","score":0.0}]',
                    }
                ],
                [{"option_key": 4, "count": 1}],
                [],
            ],
        ) as fetch_all, patch(
            "backend.routes.admin._load_survey",
            return_value=survey,
        ), patch("backend.routes.admin._audit"):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.get("/api/admin/results?cycle_id=3&target_id=9")

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body["released"])
        self.assertEqual(body["response_count"], 1)
        self.assertEqual(body["minimum"], 1)
        self.assertEqual(body["questions"][0]["distribution"][0]["count"], 1)
        self.assertNotIn("comments", body["questions"][1])
        self.assertEqual(len(body["individual_responses"]), 1)
        self.assertEqual(len(body["individual_responses"][0]["answers"]), 2)
        self.assertEqual(body["individual_responses"][0]["total_score"], 8.0)
        self.assertEqual(body["individual_responses"][0]["mean_score"], 4.0)
        self.assertEqual(body["individual_responses"][0]["section_scores"][0]["score"], 8.0)
        self.assertEqual(body["individual_responses"][0]["answers"][0]["score"], 8.0)
        self.assertEqual(
            body["individual_responses"][0]["answers"][1]["answer"],
            "Please email me at [email redacted]",
        )
        self.assertNotIn("private-response-id", response.get_data(as_text=True))
        self.assertNotIn("mmestorque@capsu.edu.ph", response.get_data(as_text=True))
        self.assertFalse(any("FROM comments" in call.args[1] for call in fetch_all.call_args_list))


if __name__ == "__main__":
    unittest.main()
