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
        ), patch(
            "backend.routes.evaluator.fetch_one", side_effect=[cycle, {"membership": 1}, None]
        ), patch(
            "backend.routes.evaluator._cycle_is_open", return_value=True
        ), patch(
            "backend.routes.evaluator._load_evaluator_target", return_value={"id": 9}
        ), patch(
            "backend.routes.evaluator._cycle_user_eligible",
            side_effect=AssertionError("Evaluator submission must not apply profile eligibility rules"),
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
        response_body = response.get_json()
        self.assertEqual(response_body["status"], "submitted")
        self.assertEqual(response_body["total_score"], 13.5)
        self.assertEqual(response_body["mean_score"], 6.75)
        self.assertEqual(
            [section["score"] for section in response_body["section_scores"]],
            [10.5, 3.0],
        )
        self.assertEqual(response_body["question_scores"], {
            "1": 8.0,
            "2": 2.5,
            "3": 3.0,
        })
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
        self.assertTrue(
            any("INSERT IGNORE INTO cycle_targets" in query for query, _ in queries)
        )
        self.assertTrue(any("submission_token" in query for query, _ in connection.db_cursor.batch_executed))
        self.assertNotIn("response_id", response.get_json())


class EvaluationTargetAccessTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        self.connection = SubmissionConnection()
        self.user = {"id": 7, "role": "evaluator", "campus_id": 2, "is_central_staff": 0}
        self.target = {
            "target_id": 9,
            "target_type": "director",
            "campus_id": 5,
            "is_central": 0,
            "office_head_name": None,
            "target_name": "Office Alpha",
            "campus_name": "Remote Campus",
        }

    @contextmanager
    def fake_connection(self, *args):
        yield self.connection

    def authenticated_client(self):
        client = self.app.test_client()
        with client.session_transaction() as session:
            session["user_id"] = self.user["id"]
        return client

    def test_target_list_is_limited_to_selected_memberships(self):
        cycle = {
            "cycle_id": 3,
            "cycle_name": "Current cycle",
            "opens_at": datetime(2026, 1, 1),
            "closes_at": datetime(2027, 1, 1),
            "survey_id": 4,
        }
        with patch("backend.core._current_user", return_value=self.user), patch(
            "backend.routes.evaluator.connection", self.fake_connection
        ), patch("backend.routes.evaluator.fetch_all", side_effect=[[cycle], [self.target]]) as fetch_all, patch(
            "backend.routes.evaluator.fetch_one", return_value=None
        ), patch("backend.routes.evaluator._cycle_is_open", return_value=True), patch(
            "backend.routes.evaluator._cycle_user_eligible", return_value=False
        ):
            response = self.authenticated_client().get("/api/evaluator/targets")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.get_json()["items"]), 1)
        self.assertEqual(response.get_json()["items"][0]["target_name"], "Office Alpha")
        target_query = fetch_all.call_args_list[1].args[1]
        self.assertIn("FROM user_office_assignments ua", target_query)
        self.assertIn("JOIN target_catalog tc", target_query)
        self.assertIn("assignment_role = 'member'", target_query)
        self.assertNotIn("FROM targets", target_query)
        self.assertEqual(fetch_all.call_args_list[1].args[2], (self.user["id"],))
        self.assertNotIn("cycle_targets", fetch_all.call_args_list[1].args[1])

    def test_target_list_returns_selected_memberships_when_no_cycle_is_open(self):
        with patch("backend.core._current_user", return_value=self.user), patch(
            "backend.routes.evaluator.connection", self.fake_connection
        ), patch("backend.routes.evaluator.fetch_all", side_effect=[[], [self.target]]) as fetch_all, patch(
            "backend.routes.evaluator.fetch_one"
        ) as fetch_one:
            response = self.authenticated_client().get("/api/evaluator/targets")

        self.assertEqual(response.status_code, 200)
        target_query = fetch_all.call_args_list[1].args[1]
        self.assertIn("FROM user_office_assignments ua", target_query)
        self.assertNotIn("FROM targets", target_query)
        self.assertEqual(fetch_all.call_args_list[1].args[2], (self.user["id"],))
        self.assertEqual(
            response.get_json()["items"],
            [
                {
                    "cycle_id": None,
                    "target_id": 9,
                    "target_type": "director",
                    "target_name": "Office Alpha",
                    "office_head_name": None,
                    "campus_name": "Remote Campus",
                    "is_central": 0,
                    "submitted": False,
                }
            ],
        )
        fetch_one.assert_not_called()

    def test_form_is_available_for_a_selected_membership(self):
        cycle = {
            "id": 3,
            "survey_id": 4,
            "name": "Current cycle",
            "opens_at": datetime(2026, 1, 1),
            "closes_at": datetime(2027, 1, 1),
            "status": "open",
        }
        survey = {
            "status": "published",
            "title": "Service survey",
            "description": None,
            "sections": [],
        }
        with patch("backend.core._current_user", return_value=self.user), patch(
            "backend.routes.evaluator.connection", self.fake_connection
        ), patch(
            "backend.routes.evaluator.fetch_one", side_effect=[cycle, {"membership": 1}, None]
        ) as fetch_one, patch(
            "backend.routes.evaluator._cycle_is_open", return_value=True
        ), patch(
            "backend.routes.evaluator._load_evaluator_target",
            return_value={"id": 9, "target_name": "Office Alpha"},
        ), patch(
            "backend.routes.evaluator._load_survey", return_value=survey
        ) as load_survey:
            response = self.authenticated_client().get(
                "/api/evaluator/targets/9/form?cycle_id=3"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["target_name"], "Office Alpha")
        membership_query = next(
            call.args[1]
            for call in fetch_one.call_args_list
            if "FROM user_office_assignments" in call.args[1]
        )
        self.assertIn("assignment_role = 'member'", membership_query)
        load_survey.assert_called_once_with(
            self.connection.db_cursor,
            4,
        )

    def test_form_rejects_a_target_outside_selected_memberships(self):
        cycle = {
            "id": 3,
            "survey_id": 4,
            "name": "Current cycle",
            "opens_at": datetime(2026, 1, 1),
            "closes_at": datetime(2027, 1, 1),
            "status": "open",
        }
        with patch("backend.core._current_user", return_value=self.user), patch(
            "backend.routes.evaluator.connection", self.fake_connection
        ), patch(
            "backend.routes.evaluator.fetch_one",
            side_effect=[cycle, None],
        ), patch(
            "backend.routes.evaluator._cycle_is_open", return_value=True
        ), patch(
            "backend.routes.evaluator._load_evaluator_target",
            return_value={"id": 9, "target_name": "Office Alpha"},
        ):
            response = self.authenticated_client().get(
                "/api/evaluator/targets/9/form?cycle_id=3"
            )

        self.assertEqual(response.status_code, 403)
        self.assertIn("selected in your membership", response.get_json()["error"])

    def test_submit_rejects_a_second_evaluation_for_the_same_target_and_cycle(self):
        cycle = {
            "id": 3,
            "survey_id": 4,
            "status": "open",
            "opens_at": datetime(2026, 1, 1),
            "closes_at": datetime(2027, 1, 1),
        }
        with patch("backend.core._current_user", return_value=self.user), patch(
            "backend.routes.evaluator.connection", self.fake_connection
        ), patch(
            "backend.routes.evaluator.fetch_one",
            side_effect=[cycle, {"membership": 1}, {"id": 12}],
        ), patch(
            "backend.routes.evaluator._cycle_is_open", return_value=True
        ), patch(
            "backend.routes.evaluator._load_evaluator_target",
            return_value={"id": 9, "target_name": "Office Alpha"},
        ), patch(
            "backend.routes.evaluator._cycle_user_eligible",
            side_effect=AssertionError("Evaluator submission must not apply profile eligibility rules"),
        ):
            response = self.authenticated_client().post(
                "/api/evaluator/submit",
                json={"cycle_id": 3, "target_id": 9, "answers": {}},
            )

        self.assertEqual(response.status_code, 409)
        self.assertIn("already submitted", response.get_json()["error"])
        self.assertFalse(self.connection.committed)

    def test_submit_rejects_a_target_outside_selected_memberships(self):
        cycle = {
            "id": 3,
            "survey_id": 4,
            "status": "open",
            "opens_at": datetime(2026, 1, 1),
            "closes_at": datetime(2027, 1, 1),
        }
        with patch("backend.core._current_user", return_value=self.user), patch(
            "backend.routes.evaluator.connection", self.fake_connection
        ), patch(
            "backend.routes.evaluator.fetch_one",
            side_effect=[cycle, None],
        ), patch(
            "backend.routes.evaluator._cycle_is_open", return_value=True
        ), patch(
            "backend.routes.evaluator._load_evaluator_target",
            return_value={"id": 9, "target_name": "Office Alpha"},
        ):
            response = self.authenticated_client().post(
                "/api/evaluator/submit",
                json={"cycle_id": 3, "target_id": 9, "answers": {}},
            )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.connection.committed)
        self.assertFalse(
            any("INSERT INTO participation" in query for query, _ in self.connection.db_cursor.executed)
        )


class EvaluationSubmissionReviewTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        self.connection = SubmissionConnection()
        self.user = {"id": 7, "role": "evaluator"}

    @contextmanager
    def fake_connection(self, *args):
        yield self.connection

    def authenticated_client(self):
        client = self.app.test_client()
        with client.session_transaction() as session:
            session["user_id"] = self.user["id"]
        return client

    def test_evaluator_can_view_their_own_submission_answers(self):
        answers = [
            {
                "question_id": 1,
                "answer_value": b"4",
                "question": "Rate the service",
                "question_type": "scale",
                "section_id": 10,
                "section_title": "Service",
            },
            {
                "question_id": 2,
                "answer_value": b"21",
                "question": "Choose one",
                "question_type": "single_choice",
                "section_id": 10,
                "section_title": "Service",
            },
            {
                "question_id": 3,
                "answer_value": b"[31, 32]",
                "question": "Choose all that apply",
                "question_type": "multi_choice",
                "section_id": 10,
                "section_title": "Service",
            },
            {
                "question_id": 4,
                "answer_value": b"false",
                "question": "Would you recommend this office?",
                "question_type": "yes_no",
                "section_id": 20,
                "section_title": "Support",
            },
        ]
        options = [
            {"id": 21, "question_id": 2, "option_text": "Helpful"},
            {"id": 31, "question_id": 3, "option_text": "Timely"},
            {"id": 32, "question_id": 3, "option_text": "Clear"},
        ]
        with patch("backend.core._current_user", return_value=self.user), patch(
            "backend.routes.evaluator.connection", self.fake_connection
        ), patch(
            "backend.routes.evaluator.fetch_one",
            side_effect=[
                {
                    "submission_token": "own-submission",
                    "cycle_name": "Current cycle",
                    "survey_title": "Service survey",
                },
                {
                    "total_score": Decimal("12.50"),
                    "mean_score": Decimal("6.25"),
                    "section_count": 2,
                    "section_scores": json.dumps(
                        [
                            {"section_id": 10, "title": "Service", "score": 8.5},
                            {"section_id": 20, "title": "Support", "score": 4},
                        ]
                    ).encode(),
                },
            ],
        ) as fetch_one, patch(
            "backend.routes.evaluator._load_evaluator_target",
            return_value={
                "target_name": "Office Alpha",
                "campus_name": "Remote Campus",
                "is_central": 0,
            },
        ), patch(
            "backend.routes.evaluator.fetch_all", side_effect=[answers, options]
        ):
            response = self.authenticated_client().get(
                "/api/evaluator/submissions?cycle_id=3&target_id=9"
            )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["target_name"], "Office Alpha")
        self.assertEqual(
            data["scores"],
            {
                "total_score": 12.5,
                "mean_score": 6.25,
                "section_count": 2,
                "section_scores": [
                    {"section_id": 10, "title": "Service", "score": 8.5},
                    {"section_id": 20, "title": "Support", "score": 4.0},
                ],
            },
        )
        self.assertEqual(
            data["sections"],
            [
                {
                    "id": 10,
                    "title": "Service",
                    "answers": [
                        {"question_id": 1, "question": "Rate the service", "answer": 4},
                        {"question_id": 2, "question": "Choose one", "answer": "Helpful"},
                        {
                            "question_id": 3,
                            "question": "Choose all that apply",
                            "answer": ["Timely", "Clear"],
                        },
                    ],
                },
                {
                    "id": 20,
                    "title": "Support",
                    "answers": [
                        {
                            "question_id": 4,
                            "question": "Would you recommend this office?",
                            "answer": "No",
                        }
                    ],
                },
            ],
        )
        self.assertEqual(
            fetch_one.call_args_list[0].args[2],
            (self.user["id"], 3, 9),
        )
        self.assertIn("evaluator_response_scores", fetch_one.call_args_list[1].args[1])
        self.assertEqual(
            fetch_one.call_args_list[1].args[2],
            ("own-submission", 3, 9),
        )

    def test_evaluator_cannot_view_another_users_submission(self):
        with patch("backend.core._current_user", return_value=self.user), patch(
            "backend.routes.evaluator.connection", self.fake_connection
        ), patch("backend.routes.evaluator.fetch_one", return_value=None), patch(
            "backend.routes.evaluator.fetch_all"
        ) as fetch_all:
            response = self.authenticated_client().get(
                "/api/evaluator/submissions?cycle_id=3&target_id=9"
            )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"], "Evaluation not found.")
        fetch_all.assert_not_called()


if __name__ == "__main__":
    unittest.main()
