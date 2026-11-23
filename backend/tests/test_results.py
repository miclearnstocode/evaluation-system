import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

from mysql.connector import IntegrityError

from backend.app import create_app
from backend.core import _load_survey


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
    def test_cycle_survey_loader_reads_active_sections_and_questions(self):
        cursor = ResultsCursor()
        survey = {
            "id": 4,
            "title": "Current title",
            "description": "Current description",
            "status": "published",
        }
        sections = [{"id": 8, "title": "Service", "sort_order": 0}]
        questions = [{
            "id": 9,
            "type": "scale",
            "question_text": "Current question",
            "required": 0,
            "sort_order": 0,
            "scale_min": 1,
            "scale_max": 5,
            "min_label": None,
            "max_label": None,
            "score_weight": 2,
        }]
        options = []

        with patch("backend.core.fetch_one", return_value=survey), patch(
            "backend.core.fetch_all", side_effect=[sections, questions, options]
        ) as fetch_all:
            loaded = _load_survey(cursor, 4, include_scoring=True)

        self.assertEqual(loaded["title"], "Current title")
        self.assertEqual(loaded["description"], "Current description")
        self.assertEqual(loaded["sections"][0]["questions"][0]["question_text"], "Current question")
        self.assertIs(loaded["sections"][0]["questions"][0]["required"], False)
        self.assertIn("FROM sections", fetch_all.call_args_list[0].args[1])
        self.assertIn("FROM questions", fetch_all.call_args_list[1].args[1])
        self.assertTrue(
            all(
                "cycle_survey_snapshots" not in call.args[1]
                and "cycle_survey_questions" not in call.args[1]
                for call in fetch_all.call_args_list
            )
        )

    def test_standing_is_restricted_to_admin_and_super_admin_accounts(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})

        with patch("backend.core._current_user", return_value={"id": 4, "role": "evaluator"}):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 4
            response = client.get("/api/admin/standing")

        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_a_restricted_admin_account(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        connection.db_cursor.lastrowid = 15

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch(
            "backend.core._current_user", return_value={"id": 1, "role": "admin"}
        ), patch("backend.routes.admin.connection", fake_connection):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.post(
                "/api/admin/users",
                json={
                    "email": "office.admin@capsu.edu.ph",
                    "password": "secure-admin-password",
                    "role": "admin",
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json(), {"id": 15})
        query, parameters = connection.db_cursor.executed[0]
        self.assertIn("VALUES (%s, %s, %s, 1)", query)
        self.assertEqual(parameters[0], "office.admin@capsu.edu.ph")
        self.assertEqual(parameters[2], "admin")

    def test_admin_can_update_a_draft_survey(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        sections = [{"title": "Service", "questions": [{"text": "Was it helpful?"}]}]

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch(
            "backend.core._current_user", return_value={"id": 2, "role": "admin"}
        ), patch("backend.routes.admin.connection", fake_connection), patch(
            "backend.routes.admin.fetch_one", return_value={"id": 5, "status": "draft"}
        ), patch("backend.routes.admin.validate_survey_payload", return_value=sections), patch(
            "backend.routes.admin._update_survey_content"
        ) as update_content:
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 2
            response = client.put(
                "/api/admin/surveys/5",
                json={"title": "Updated survey", "description": "Revised", "sections": sections},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "updated"})
        self.assertTrue(any("UPDATE surveys SET title" in query for query, _ in connection.db_cursor.executed))
        self.assertTrue(all("DELETE FROM sections" not in query for query, _ in connection.db_cursor.executed))
        update_content.assert_called_once_with(connection.db_cursor, 5, sections)

    def test_published_survey_updates_in_place_and_preserves_old_questions(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        sections = [{"title": "Service", "questions": [{"text": "Was it helpful?"}]}]

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch(
            "backend.core._current_user", return_value={"id": 2, "role": "admin"}
        ), patch("backend.routes.admin.connection", fake_connection), patch(
            "backend.routes.admin.fetch_one",
            return_value={"id": 5, "status": "published"},
        ), patch("backend.routes.admin.validate_survey_payload", return_value=sections), patch(
            "backend.routes.admin._update_survey_content"
        ) as update_content:
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 2
            response = client.put(
                "/api/admin/surveys/5",
                json={"title": "Updated survey", "sections": sections},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "updated"})
        self.assertTrue(any("UPDATE surveys SET title" in query for query, _ in connection.db_cursor.executed))
        self.assertTrue(all("DELETE FROM sections" not in query for query, _ in connection.db_cursor.executed))
        update_content.assert_called_once_with(connection.db_cursor, 5, sections)

    def test_admin_can_delete_unreferenced_survey(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch(
            "backend.core._current_user", return_value={"id": 2, "role": "admin"}
        ), patch("backend.routes.admin.connection", fake_connection), patch(
            "backend.routes.admin.fetch_one", side_effect=[{"id": 5}, None]
        ), patch.object(connection, "start_transaction") as start_transaction:
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 2
            response = client.delete("/api/admin/surveys/5")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "deleted"})
        self.assertTrue(any("DELETE FROM surveys" in query for query, _ in connection.db_cursor.executed))
        self.assertTrue(any("INSERT INTO admin_audit_log" in query for query, _ in connection.db_cursor.executed))
        start_transaction.assert_not_called()

    def test_admin_cannot_delete_survey_used_by_cycle(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch(
            "backend.core._current_user", return_value={"id": 2, "role": "admin"}
        ), patch("backend.routes.admin.connection", fake_connection), patch(
            "backend.routes.admin.fetch_one", side_effect=[{"id": 5}, {"id": 9}]
        ):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 2
            response = client.delete("/api/admin/surveys/5")

        self.assertEqual(response.status_code, 409)
        self.assertIn("evaluation cycle", response.get_json()["error"])
        self.assertFalse(any("DELETE FROM surveys" in query for query, _ in connection.db_cursor.executed))

    def test_survey_delete_reports_foreign_key_conflict_instead_of_server_error(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch(
            "backend.core._current_user", return_value={"id": 2, "role": "admin"}
        ), patch("backend.routes.admin.connection", fake_connection), patch(
            "backend.routes.admin.fetch_one", side_effect=[{"id": 5}, None]
        ), patch.object(
            connection.db_cursor,
            "execute",
            side_effect=IntegrityError(msg="foreign key conflict", errno=1451),
        ), patch.object(connection, "rollback") as rollback:
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 2
            response = client.delete("/api/admin/surveys/5")

        self.assertEqual(response.status_code, 409)
        self.assertIn("referenced by an evaluation cycle", response.get_json()["error"])
        rollback.assert_called_once()

    def test_admin_standing_contains_only_the_office_mean(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        cycle = {
            "id": 3,
            "name": "Current cycle",
            "survey_id": 4,
            "status": "closed",
        }
        targets = [
            {
                "target_id": 9,
                "target_name": "Office Alpha",
                "target_type": "director",
                "campus_id": None,
                "campus_name": None,
                "is_central": 1,
            }
        ]
        score_rows = [
            {
                "target_id": 9,
                "mean_score": "4.00",
                "section_scores": b'[{"section_id":1,"title":"Service","score":8.0}]',
                "evaluator_email": "first@capsu.edu.ph",
            },
            {
                "target_id": 9,
                "mean_score": "2.00",
                "section_scores": b'[{"section_id":1,"title":"Service","score":4.0}]',
                "evaluator_email": "second@capsu.edu.ph",
            },
        ]

        @contextmanager
        def fake_connection(*args):
            yield connection

        def fake_fetch_all(cursor, query, parameters=()):
            if "FROM eval_cycles" in query:
                return [cycle]
            if "FROM evaluator_response_scores" in query:
                return score_rows
            if "FROM cycle_targets" in query:
                return targets
            raise AssertionError(f"Unexpected query: {query}")

        with patch("backend.core._current_user", return_value={"id": 2, "role": "admin"}), patch(
            "backend.routes.admin.connection", fake_connection
        ), patch("backend.routes.admin.fetch_all", side_effect=fake_fetch_all) as fetch_all, patch(
            "backend.routes.admin._audit"
        ):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 2
            response = client.get("/api/admin/standing?cycle_id=3")

        self.assertEqual(response.status_code, 200)
        item = response.get_json()["items"][0]
        self.assertEqual(item["office_mean_score"], 3.0)
        self.assertNotIn("response_count", item)
        self.assertNotIn("section_means", item)
        self.assertNotIn("evaluator_means", item)
        score_query = next(call.args[1] for call in fetch_all.call_args_list if "FROM evaluator_response_scores" in call.args[1])
        self.assertNotIn("evaluator_email", score_query)
        self.assertNotIn("JOIN users", score_query)

    def test_super_admin_standing_includes_section_and_evaluator_means(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        cycle = {
            "id": 3,
            "name": "Current cycle",
            "survey_id": 4,
            "status": "closed",
        }
        targets = [
            {
                "target_id": 9,
                "target_name": "Office Alpha",
                "target_type": "director",
                "campus_id": None,
                "campus_name": None,
                "is_central": 1,
            }
        ]
        score_rows = [
            {
                "target_id": 9,
                "mean_score": "4.00",
                "section_scores": '[{"section_id":1,"title":"Service","score":8.0}]',
            },
            {
                "target_id": 9,
                "mean_score": "2.00",
                "section_scores": '[{"section_id":1,"title":"Service","score":4.0}]',
            },
        ]

        @contextmanager
        def fake_connection(*args):
            yield connection

        def fake_fetch_all(cursor, query, parameters=()):
            if "FROM eval_cycles" in query:
                return [cycle]
            if "FROM sections" in query:
                return [{"id": 1, "title": "Service"}]
            if "FROM evaluator_response_scores" in query:
                self.assertNotIn("email", query)
                return score_rows
            if "FROM cycle_targets" in query:
                return targets
            raise AssertionError(f"Unexpected query: {query}")

        with patch(
            "backend.core._current_user", return_value={"id": 1, "role": "super_admin"}
        ), patch("backend.routes.admin.connection", fake_connection), patch(
            "backend.routes.admin.fetch_all", side_effect=fake_fetch_all
        ), patch("backend.routes.admin._audit"):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.get("/api/admin/standing?cycle_id=3")

        self.assertEqual(response.status_code, 200)
        item = response.get_json()["items"][0]
        self.assertEqual(item["office_mean_score"], 3.0)
        self.assertEqual(item["response_count"], 2)
        self.assertEqual(item["section_means"], [
            {"section_id": 1, "title": "Service", "mean_score": 6.0},
        ])
        self.assertEqual(item["evaluator_means"], [
            {"evaluator_number": 1, "mean_score": 4.0},
            {"evaluator_number": 2, "mean_score": 2.0},
        ])

    def test_super_admin_result_options_include_only_active_cycle_targets(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        cycle = {"id": 3, "name": "Closed cycle", "status": "closed"}
        target = {
            "id": 9,
            "name": "Office Alpha",
            "target_type": "director",
            "campus_id": None,
            "is_central": 1,
            "campus_name": None,
            "office_head_name": "Dr. Alex Rivera",
        }

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch(
            "backend.core._current_user", return_value={"id": 1, "role": "super_admin"}
        ), patch("backend.routes.admin.connection", fake_connection), patch(
            "backend.routes.admin.fetch_all",
            side_effect=[[cycle], [{"target_id": 9}], [target]],
        ) as fetch_all:
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.get("/api/admin/results/options")

        self.assertEqual(response.status_code, 200)
        self.assertIn("t.office_head_name", fetch_all.call_args.args[1])
        self.assertEqual(response.get_json(), {"cycles": [{**cycle, "target_ids": [9]}], "targets": [target]})

    def test_submission_list_includes_evaluator_email_for_admin_review(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        submissions = [
            {
                "submission_token": "123e4567-e89b-12d3-a456-426614174000",
                "submitted_at": "2026-11-23 09:00:00",
                "evaluator_email": "evaluator@capsu.edu.ph",
            }
        ]

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.core._current_user", return_value={"id": 1, "role": "admin"}), patch(
            "backend.routes.admin.connection", fake_connection
        ), patch(
            "backend.routes.admin.fetch_one",
            return_value={"id": 3, "status": "open"},
        ), patch(
            "backend.routes.admin._load_cycle_target",
            return_value={"target_name": "Office Alpha"},
        ), patch("backend.routes.admin.fetch_all", return_value=submissions), patch(
            "backend.routes.admin._audit"
        ):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.get("/api/admin/submissions?cycle_id=3&target_id=9")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"items": submissions})

    def test_super_admin_submission_list_includes_each_evaluators_scores(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        cycle = {"id": 3, "status": "closed"}
        items = [
            {
                "submitted": 1,
                "total_score": Decimal("155.00"),
                "mean_score": Decimal("22.14"),
            },
            {
                "submitted": 0,
                "total_score": None,
                "mean_score": None,
            },
        ]

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch(
            "backend.core._current_user", return_value={"id": 1, "role": "super_admin"}
        ), patch("backend.routes.admin.connection", fake_connection), patch(
            "backend.routes.admin.fetch_one",
            side_effect=[cycle, {"target_name": "Office Alpha"}],
        ), patch(
            "backend.routes.admin._load_cycle_target",
            return_value={"target_name": "Office Alpha"},
        ), patch("backend.routes.admin.fetch_all", return_value=items), patch(
            "backend.routes.admin._audit"
        ):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.get(
                "/api/admin/super-admin/submissions?cycle_id=3&target_id=9"
            )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["items"][0]["total_score"], 155.0)
        self.assertEqual(body["items"][0]["mean_score"], 22.14)
        self.assertEqual([item["evaluator_number"] for item in body["items"]], [1, 2])
        self.assertEqual(
            set(body["items"][0]),
            {"evaluator_number", "submitted", "total_score", "mean_score"},
        )
        self.assertEqual(body["office_mean"], 22.14)

    def test_super_admin_can_view_anonymous_comments_for_an_office(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        token = "123e4567-e89b-12d3-a456-426614174000"
        cycle = {
            "status": "closed",
            "opens_at": datetime(2026, 1, 1),
            "closes_at": datetime(2026, 2, 1),
        }
        comments = [
            {
                "id": 44,
                "question_id": 12,
                "question": "Additional comments",
                "body": "Please contact me at evaluator@capsu.edu.ph",
                "status": "pending",
            }
        ]

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch(
            "backend.core._current_user", return_value={"id": 1, "role": "super_admin"}
        ), patch("backend.routes.admin.connection", fake_connection), patch(
            "backend.routes.admin.fetch_one",
            return_value=cycle,
        ), patch(
            "backend.routes.admin._load_cycle_target",
            return_value={"target_name": "Office Alpha"},
        ), patch(
            "backend.routes.admin.fetch_all", return_value=comments
        ), patch("backend.routes.admin._audit"):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.get("/api/admin/super-admin/comments?cycle_id=3&target_id=9")
            old_response = client.get(f"/api/admin/super-admin/submissions/{token}/comments")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["items"][0]["body"],
            "Please contact me at [email redacted]",
        )
        self.assertEqual(set(response.get_json()["items"][0]), {"question", "body"})
        self.assertIn(old_response.status_code, {404, 405})

    def test_super_admin_office_comments_route_requires_super_admin(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        with patch(
            "backend.core._current_user", return_value={"id": 1, "role": "admin"}
        ):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.get(
                "/api/admin/super-admin/comments?cycle_id=3&target_id=9"
            )

        self.assertEqual(response.status_code, 403)

    def test_cycle_rules_reject_evaluator_group_filters(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})

        with patch("backend.core._current_user", return_value={"id": 1, "role": "admin"}):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 1
            response = client.put(
                "/api/admin/cycles/3/rules",
                json={"rules": [{"effect": "allow", "evaluator_group": "faculty"}]},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Evaluator groups are no longer supported", response.get_json()["error"])

    def test_submission_review_returns_content_without_identity_or_token(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = ResultsConnection()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        token = "123e4567-e89b-12d3-a456-426614174000"

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.core._current_user", return_value={"id": 1, "role": "admin"}), patch(
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
                        "answer_value": b'"Please email evaluator@capsu.edu.ph"',
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

        with patch("backend.core._current_user", return_value={"id": 1, "role": "admin"}), patch(
            "backend.routes.admin.connection", fake_connection
        ), patch(
            "backend.routes.admin.fetch_one",
            return_value={"cycle_id": 3, "target_id": 9},
        ), patch(
            "backend.routes.admin.fetch_all",
            return_value=[{"question_id": 12, "answer_value": b"4", "question_type": "scale"}],
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

        with patch("backend.core._current_user", return_value={"id": 1, "role": "admin"}), patch(
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

        with patch("backend.core._current_user", return_value={"id": 1, "role": "admin"}), patch(
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
                        "answer_value": b"4",
                        "question_score": "8.00",
                    },
                    {
                        "response_id": "private-response-id",
                        "question_id": 12,
                        "answer_value": b'"Please email me at mmestorque@capsu.edu.ph"',
                        "question_score": None,
                    },
                ],
                [
                    {
                        "response_id": "private-response-id",
                        "total_score": "8.00",
                        "mean_score": "4.00",
                        "section_scores": b'[{"section_id":1,"title":"Service","score":8.0},{"section_id":2,"title":"Comments","score":0.0}]',
                    }
                ],
                [{"option_key": 4, "count": Decimal("1")}],
                [],
            ],
        ) as fetch_all, patch(
            "backend.routes.admin._load_survey",
            return_value=survey,
        ) as load_survey, patch("backend.routes.admin._audit"):
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
        self.assertIsInstance(body["questions"][0]["mean"], float)
        self.assertEqual(body["questions"][0]["mean"], 4.0)
        self.assertNotIn("comments", body["questions"][1])
        self.assertEqual(len(body["individual_responses"]), 1)
        self.assertEqual(len(body["individual_responses"][0]["answers"]), 1)
        self.assertEqual(body["individual_responses"][0]["total_score"], 8.0)
        self.assertEqual(body["individual_responses"][0]["mean_score"], 4.0)
        self.assertEqual(body["individual_responses"][0]["section_scores"][0]["score"], 8.0)
        self.assertEqual(body["individual_responses"][0]["answers"][0]["score"], 8.0)
        self.assertNotIn("Please email me", response.get_data(as_text=True))
        self.assertNotIn("private-response-id", response.get_data(as_text=True))
        self.assertNotIn("mmestorque@capsu.edu.ph", response.get_data(as_text=True))
        self.assertFalse(any("FROM comments" in call.args[1] for call in fetch_all.call_args_list))
        load_survey.assert_called_once_with(connection.db_cursor, 4)


if __name__ == "__main__":
    unittest.main()
