import unittest
from contextlib import contextmanager
from unittest.mock import patch

from backend.app import ApiError, _insert_all_cycle_targets, create_app


class RegistrationCursor:
    lastrowid = 42

    def __init__(self):
        self.query = ""
        self.executed = []
        self.batch_executed = []

    def execute(self, query, params=()):
        self.query = query
        self.executed.append((query, params))

    def fetchone(self):
        if "FROM campuses" in self.query:
            return {"id": 1, "location_code": "MAIN", "is_central": 0, "active": 1}
        raise AssertionError(f"Unexpected query: {self.query}")

    def fetchall(self):
        if "FROM target_catalog" in self.query:
            return [
                {"id": 2, "code": "VP_ACADEMIC", "target_type": "vice_president"},
                {"id": 3, "code": "BAC", "target_type": "director"},
            ]
        raise AssertionError(f"Unexpected query: {self.query}")

    def executemany(self, query, params):
        self.batch_executed.append((query, params))

    def close(self):
        pass


class RegistrationConnection:
    def __init__(self):
        self.db_cursor = RegistrationCursor()
        self.committed = False

    def cursor(self, dictionary=False):
        return self.db_cursor

    def start_transaction(self):
        pass

    def commit(self):
        self.committed = True

    def rollback(self):
        self.committed = False


class TargetCursor:
    def __init__(self):
        self.query = ""
        self.params = ()
        self.rowcount = 2

    def execute(self, query, params=()):
        self.query = query
        self.params = params

class RegistrationFlowTests(unittest.TestCase):
    def test_authenticated_user_lookup_does_not_read_registration_metadata(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = AdminConnection()

        @contextmanager
        def fake_connection(*args):
            yield connection

        client = app.test_client()
        with client.session_transaction() as session:
            session["user_id"] = 1

        with patch("backend.core.connection", fake_connection):
            response = client.get("/api/auth/me")

        self.assertEqual(response.status_code, 200)
        user_query = next(
            query for query, _ in connection.db_cursor.executed if "FROM users" in query
        )
        self.assertNotIn("position_role", user_query)
        self.assertNotIn("years_of_service", user_query)

    def test_registration_creates_active_account_without_email_verification(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = RegistrationConnection()

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.routes.auth.connection", fake_connection):
            response = app.test_client().post(
                "/api/auth/register",
                json={
                    "email": "evaluator@capsu.edu.ph",
                    "password": "secure-password-123",
                    "position_role": "non_teaching_staff",
                    "office_unit_codes": ["2", "3"],
                    "location_code": "MAIN",
                    "years_of_service": "1_5",
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json(), {"status": "registered"})
        self.assertTrue(connection.committed)
        queries = [query for query, _ in connection.db_cursor.executed]
        insert_query = next(query for query in queries if "INSERT INTO users" in query)
        self.assertIn("position_role", insert_query)
        self.assertNotIn("evaluator_group", insert_query)
        self.assertIn("VALUES (%s, %s, 'evaluator', %s, %s, %s, %s, 1)", insert_query)
        insert_params = next(
            params for query, params in connection.db_cursor.executed if "INSERT INTO users" in query
        )
        self.assertEqual(insert_params[3], "non_teaching_staff")
        self.assertEqual(
            connection.db_cursor.batch_executed,
            [
                (
                    "INSERT INTO user_office_assignments (user_id, target_id, assignment_role) "
                    "VALUES (%s, %s, 'member')",
                    [(42, 2), (42, 3)],
                )
            ],
        )

    def test_registration_rejects_duplicate_office_unit_selections(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        response = app.test_client().post(
            "/api/auth/register",
            json={
                "email": "evaluator@capsu.edu.ph",
                "password": "secure-password-123",
                "position_role": "non_teaching_staff",
                "office_unit_codes": ["BAC", "BAC"],
                "location_code": "MAIN",
                "years_of_service": "1_5",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("cannot be selected more than once", response.get_json()["error"])

    def test_cycle_automatically_includes_all_active_targets(self):
        cursor = TargetCursor()

        target_count = _insert_all_cycle_targets(cursor, 9)

        self.assertEqual(target_count, 2)
        self.assertIn("t.active = 1", cursor.query)
        self.assertIn("LEFT JOIN campuses", cursor.query)
        self.assertEqual(cursor.params, (9,))

    def test_cycle_creation_requires_at_least_one_active_target(self):
        cursor = TargetCursor()
        cursor.rowcount = 0

        with self.assertRaises(ApiError):
            _insert_all_cycle_targets(cursor, 9)

    def test_admin_delete_calls_private_account_cleanup_without_reading_responses(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = AdminConnection()

        @contextmanager
        def fake_connection(*args):
            yield connection

        client = app.test_client()
        with client.session_transaction() as session:
            session["user_id"] = 1

        with patch("backend.core.connection", fake_connection), patch("backend.routes.admin.connection", fake_connection):
            response = client.delete("/api/admin/users/7")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "deleted"})
        self.assertTrue(any("DELETE FROM users" in query for query, _ in connection.db_cursor.executed))
        self.assertTrue(any("SELECT submission_token FROM participation" in query for query, _ in connection.db_cursor.executed))


class AdminCursor:
    def __init__(self):
        self.query = ""
        self.executed = []

    def execute(self, query, params=()):
        self.query = query
        self.executed.append((query, params))

    def fetchone(self):
        if "SELECT id, email, role" in self.query:
            return {"id": 1, "email": "admin@capsu.edu.ph", "role": "super_admin", "active": 1}
        if "SELECT role FROM users" in self.query:
            return {"role": "evaluator"}
        raise AssertionError(f"Unexpected query: {self.query}")

    def fetchall(self):
        if "SELECT submission_token FROM participation" in self.query:
            return []
        raise AssertionError(f"Unexpected query: {self.query}")

    def close(self):
        pass


class AdminConnection:
    def __init__(self):
        self.db_cursor = AdminCursor()
        self.committed = False

    def cursor(self, dictionary=False):
        return self.db_cursor

    def start_transaction(self):
        pass

    def commit(self):
        self.committed = True

    def rollback(self):
        self.committed = False


if __name__ == "__main__":
    unittest.main()
