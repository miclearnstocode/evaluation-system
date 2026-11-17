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
        if "FROM registration_roles" in self.query:
            return {"code": "non_teaching_staff"}
        if "FROM registration_service_years" in self.query:
            return {"code": "1_5"}
        if "FROM offices" in self.query:
            return {"id": self.executed[-1][1][0]}
        raise AssertionError(f"Unexpected query: {self.query}")

    def fetchall(self):
        if "FROM offices" in self.query:
            return [
                {"id": 2, "unit_code": "VP_ACADEMIC", "category": "vp"},
                {"id": 3, "unit_code": "BAC", "category": "director"},
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


class TargetCursor:
    def __init__(self):
        self.query = ""
        self.params = ()
        self.rowcount = 2

    def execute(self, query, params=()):
        self.query = query
        self.params = params

class RegistrationFlowTests(unittest.TestCase):
    def test_registration_creates_active_account_without_email_verification(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = RegistrationConnection()

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("routes.auth.connection", fake_connection):
            response = app.test_client().post(
                "/api/auth/register",
                json={
                    "email": "evaluator@capsu.edu.ph",
                    "password": "secure-password-123",
                    "position_role": "non_teaching_staff",
                    "office_unit_codes": ["VP_ACADEMIC", "BAC"],
                    "location_code": "MAIN",
                    "years_of_service": "1_5",
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json(), {"status": "registered"})
        self.assertTrue(connection.committed)
        queries = [query for query, _ in connection.db_cursor.executed]
        insert_query = next(query for query in queries if "INSERT INTO users" in query)
        self.assertIn("VALUES (%s, %s, 'evaluator', %s, %s, %s, %s, %s, %s, 1)", insert_query)
        insert_params = next(
            params for query, params in connection.db_cursor.executed if "INSERT INTO users" in query
        )
        self.assertIsNone(insert_params[5])
        self.assertEqual(
            connection.db_cursor.batch_executed,
            [("INSERT INTO office_memberships (user_id, office_id) VALUES (%s, %s)", [(42, 2), (42, 3)])],
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

    def test_cycle_automatically_includes_all_active_office_and_admin_targets(self):
        cursor = TargetCursor()

        target_count = _insert_all_cycle_targets(cursor, 9)

        self.assertEqual(target_count, 2)
        self.assertIn("t.target_type = 'office'", cursor.query)
        self.assertIn("t.target_type = 'administrator'", cursor.query)
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

        with patch("core.connection", fake_connection), patch("routes.admin.connection", fake_connection):
            response = client.delete("/api/admin/users/7")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "deleted"})
        self.assertEqual(connection.db_cursor.procedures, [("delete_evaluator_account", (7,))])
        self.assertFalse(any("participation" in query or "comments" in query for query, _ in connection.db_cursor.executed))


class AdminCursor:
    def __init__(self):
        self.query = ""
        self.executed = []
        self.procedures = []

    def execute(self, query, params=()):
        self.query = query
        self.executed.append((query, params))

    def fetchone(self):
        if "SELECT id, email, role" in self.query:
            return {"id": 1, "email": "admin@capsu.edu.ph", "role": "super_admin", "active": 1}
        if "SELECT role FROM users" in self.query:
            return {"role": "evaluator"}
        raise AssertionError(f"Unexpected query: {self.query}")

    def callproc(self, procedure, args=()):
        self.procedures.append((procedure, args))

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
