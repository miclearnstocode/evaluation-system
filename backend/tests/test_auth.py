import unittest
from contextlib import contextmanager
from unittest.mock import patch

import bcrypt
from werkzeug.security import generate_password_hash

from backend.app import ApiError, _insert_all_cycle_targets, create_app
from backend.routes.auth import _password_matches


class RegistrationCursor:
    def __init__(self):
        self.query = ""
        self.executed = []
        self.batch_executed = []
        self.lastrowid = 0
        self.next_target_id = 100

    def execute(self, query, params=()):
        self.query = query
        self.executed.append((query, params))
        if "INSERT INTO users" in query:
            self.lastrowid = 42
        elif "INSERT INTO targets" in query:
            self.next_target_id += 1
            self.lastrowid = self.next_target_id

    def fetchone(self):
        if "FROM campuses" in self.query:
            return {"id": 1, "location_code": "MAIN", "is_central": 0, "active": 1}
        raise AssertionError(f"Unexpected query: {self.query}")

    def fetchall(self):
        selected_codes = self.executed[-1][1][1:]
        if "FROM `vice_presidents`" in self.query and "VP_ACADEMIC" in selected_codes:
            return [{
                "source_id": 1,
                "code": "VP_ACADEMIC",
                "campus_id": None,
                "campus_is_central": None,
                "target_id": None,
                "target_active": None,
            }]
        if "FROM `campus_administrators`" in self.query and "2" in selected_codes:
            return [{
                "source_id": 2,
                "code": "2",
                "campus_id": 1,
                "campus_is_central": 0,
                "target_id": None,
                "target_active": None,
            }]
        if "FROM `satellite_college_directors`" in self.query and "3" in selected_codes:
            return [{
                "source_id": 3,
                "code": "3",
                "campus_id": 1,
                "campus_is_central": 0,
                "target_id": None,
                "target_active": None,
            }]
        if "FROM `rde_directors`" in self.query and "RESEARCH_OFFICE" in selected_codes:
            return [{
                "source_id": 1,
                "code": "RESEARCH_OFFICE",
                "campus_id": None,
                "campus_is_central": None,
                "target_id": None,
                "target_active": None,
            }]
        if "t.id AS target_id" in self.query:
            return []
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


class LoginCursor:
    def __init__(self, user):
        self.user = user
        self.query = ""

    def execute(self, query, params=()):
        self.query = query

    def fetchone(self):
        return self.user

    def fetchall(self):
        return []

    def close(self):
        pass


class LoginConnection:
    def __init__(self, user):
        self.db_cursor = LoginCursor(user)

    def cursor(self, dictionary=False):
        return self.db_cursor

    def close(self):
        pass


class LoginFlowTests(unittest.TestCase):
    def test_admin_login_is_not_promoted_to_super_admin(self):
        password = "test-admin-password"
        user = {
            "id": 7,
            "email": "admin@capsu.edu.ph",
            "password_hash": bcrypt.hashpw(
                password.encode("utf-8"), bcrypt.gensalt()
            ).decode("ascii"),
            "role": "admin",
            "active": 1,
            "campus_id": None,
            "is_central_staff": 0,
        }
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = LoginConnection(user)

        @contextmanager
        def fake_connection(*args):
            yield connection

        client = app.test_client()
        with patch("backend.routes.auth.connection", fake_connection), patch(
            "backend.core.connection", fake_connection
        ), patch("backend.routes.admin.connection", fake_connection):
            login_response = client.post(
                "/api/auth/login",
                json={"email": user["email"], "password": password},
            )
            me_response = client.get("/api/auth/me")
            management_response = client.get("/api/admin/campuses")
            result_response = client.get("/api/admin/results?cycle_id=1&target_id=1")

        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.get_json(), {"role": "admin"})
        self.assertEqual(me_response.get_json()["role"], "admin")
        self.assertEqual(management_response.status_code, 200)
        self.assertEqual(result_response.status_code, 403)

    def test_super_admin_cannot_access_admin_management_endpoints(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})

        with patch(
            "backend.core._current_user",
            return_value={"id": 8, "role": "super_admin"},
        ):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 8
            response = client.get("/api/admin/campuses")

        self.assertEqual(response.status_code, 403)

    def test_super_admin_can_read_result_selector_cycles_and_targets(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = LoginConnection({
            "id": 8,
            "email": "results@capsu.edu.ph",
            "role": "super_admin",
            "active": 1,
        })

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch(
            "backend.core._current_user",
            return_value={"id": 8, "role": "super_admin"},
        ), patch("backend.routes.admin.connection", fake_connection):
            client = app.test_client()
            with client.session_transaction() as session:
                session["user_id"] = 8
            cycles_response = client.get("/api/admin/cycles")
            targets_response = client.get("/api/admin/targets")

        self.assertEqual(cycles_response.status_code, 200)
        self.assertEqual(targets_response.status_code, 200)

    def test_werkzeug_password_hashes_remain_supported(self):
        password_hash = generate_password_hash("test-evaluator-password")

        self.assertTrue(_password_matches(password_hash, "test-evaluator-password"))
        self.assertFalse(_password_matches(password_hash, "wrong-password"))


class RegistrationFlowTests(unittest.TestCase):
    def test_registration_options_return_all_41_offices_without_role_filtering(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = RegistrationConnection()
        sections = [
            ("vice_presidents", "Vice President offices", 4),
            ("campus_administrators", "Campus Administrator", 3),
            ("satellite_college_directors", "Satellite College Directors", 6),
            ("rde_directors", "RDE Directors", 2),
            ("rde_center_directors", "RDE Center", 7),
            ("directors", "Director", 19),
        ]

        @contextmanager
        def fake_connection(*args):
            yield connection

        def fake_fetch_all(cursor, query, params=()):
            for table, label, count in sections:
                if f"FROM `{table}`" in query:
                    rows = [
                        {"code": f"{table}_{index}", "name": f"{label} {index}"}
                        for index in range(count)
                    ]
                    if table == "campus_administrators":
                        self.assertIn("c.location_code AS campus_code", query)
                        rows[2]["campus_code"] = "BURIAS"
                    return rows
            return []

        with patch("backend.routes.auth.connection", fake_connection), patch(
            "backend.routes.auth.fetch_all", side_effect=fake_fetch_all
        ):
            response = app.test_client().get(
                "/api/auth/registration-options?position_role=teaching_faculty"
            )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(len(data["memberships"]), 41)
        burias = next(office for office in data["memberships"] if office["campus_code"] == "BURIAS")
        self.assertEqual(burias["unit_code"], "campus_administrators_2")
        self.assertTrue(burias["student_leader_available"])
        self.assertIn({"value": "vice_president", "label": "Vice President"}, data["position_roles"])
        self.assertEqual(
            [
                (section["label"], [office["unit_code"] for office in section["offices"]])
                for section in data["office_sections"]
            ],
            [
                (label, [f"{table}_{index}" for index in range(count)])
                for table, label, count in sections
            ],
        )
        self.assertNotIn("role_memberships", data)

    def test_registration_saves_vice_president_office_for_non_teaching_staff(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = RegistrationConnection()

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.routes.auth.connection", fake_connection):
            response = app.test_client().post(
                "/api/auth/register",
                json={
                    "email": "vp@capsu.edu.ph",
                    "password": "secure-password-123",
                    "first_name": "Ada",
                    "last_name": "Lovelace",
                    "position_role": "non_teaching_staff",
                    "office_unit_codes": ["VP_ACADEMIC"],
                    "location_code": "MAIN",
                    "years_of_service": "1_5",
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(connection.committed)
        user_query, user_params = next(
            entry for entry in connection.db_cursor.executed if "INSERT INTO users" in entry[0]
        )
        self.assertIn("'evaluator'", user_query)
        self.assertEqual(user_params[5], "non_teaching_staff")
        target_query, target_params = next(
            entry for entry in connection.db_cursor.executed if "INSERT INTO targets" in entry[0]
        )
        self.assertIn("vice_president_id", target_query)
        self.assertEqual(target_params, ("vice_president", 1, None, True))
        self.assertEqual(connection.db_cursor.batch_executed[0][1], [(42, 101)])

    def test_authenticated_user_lookup_reads_role_for_assignment_eligibility(self):
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
        self.assertIn("position_role", user_query)
        self.assertNotIn("years_of_service", user_query)

    def test_registration_does_not_require_an_office_membership(self):
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
                    "first_name": "Ada",
                    "last_name": "Lovelace",
                    "position_role": "non_teaching_staff",
                    "office_unit_codes": [],
                    "location_code": "MAIN",
                    "years_of_service": "1_5",
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(connection.committed)
        self.assertEqual(connection.db_cursor.batch_executed, [])

    def test_registration_accepts_all_41_office_memberships(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = RegistrationConnection()
        office_codes = [f"OFFICE_{index}" for index in range(41)]
        office_rows = [
            {
                "source_id": index,
                "code": code,
                "campus_id": None,
                "campus_is_central": None,
                "target_id": None,
                "target_active": None,
            }
            for index, code in enumerate(office_codes, start=1)
        ]

        @contextmanager
        def fake_connection(*args):
            yield connection

        def fake_fetch_all(cursor, query, params=()):
            return office_rows if "FROM `directors`" in query else []

        with patch("backend.routes.auth.connection", fake_connection), patch(
            "backend.routes.auth.fetch_all", side_effect=fake_fetch_all
        ):
            response = app.test_client().post(
                "/api/auth/register",
                json={
                    "email": "evaluator@capsu.edu.ph",
                    "password": "secure-password-123",
                    "first_name": "Ada",
                    "last_name": "Lovelace",
                    "position_role": "teaching_faculty",
                    "office_unit_codes": office_codes,
                    "location_code": "MAIN",
                    "years_of_service": "1_5",
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(connection.db_cursor.batch_executed[0][1]), 41)

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
                    "first_name": " Ada ",
                    "last_name": " Lovelace ",
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
        self.assertIn("first_name, last_name", insert_query)
        self.assertNotIn("evaluator_group", insert_query)
        self.assertIn("VALUES (%s, %s, %s, %s, 'evaluator', %s, %s, %s, %s, 1)", insert_query)
        insert_params = next(
            params for query, params in connection.db_cursor.executed if "INSERT INTO users" in query
        )
        self.assertEqual(insert_params[2:4], ("Ada", "Lovelace"))
        self.assertEqual(insert_params[5], "non_teaching_staff")
        self.assertEqual(
            connection.db_cursor.batch_executed,
            [
                (
                    "INSERT INTO user_office_assignments (user_id, target_id, assignment_role) "
                    "VALUES (%s, %s, 'member')",
                    [(42, 101), (42, 102)],
                )
            ],
        )
        queries = [query for query, _ in connection.db_cursor.executed]
        user_insert_index = next(i for i, query in enumerate(queries) if "INSERT INTO users" in query)
        target_insert_indices = [
            i for i, query in enumerate(queries) if "INSERT INTO targets" in query
        ]
        self.assertEqual(len(target_insert_indices), 2)
        self.assertTrue(all(index > user_insert_index for index in target_insert_indices))
        target_params = [
            params
            for query, params in connection.db_cursor.executed
            if "INSERT INTO targets" in query
        ]
        self.assertEqual(
            target_params,
            [
                ("campus_administrator", 2, 1, False),
                ("satellite_college_director", 3, 1, False),
            ],
        )
        cycle_target_params = [
            params
            for query, params in connection.db_cursor.executed
            if "INSERT IGNORE INTO cycle_targets" in query
        ]
        self.assertEqual(
            [(params[0], params[3]) for params in cycle_target_params],
            [
                (101, "campus_administrator"),
                (102, "satellite_college_director"),
            ],
        )
        self.assertTrue(
            all(
                "c.status = 'open'" in query
                for query, _ in connection.db_cursor.executed
                if "INSERT IGNORE INTO cycle_targets" in query
            )
        )

    def test_registration_creates_missing_rde_target_for_new_evaluator(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = RegistrationConnection()

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.routes.auth.connection", fake_connection):
            response = app.test_client().post(
                "/api/auth/register",
                json={
                    "email": "researcher@capsu.edu.ph",
                    "password": "secure-password-123",
                    "first_name": "Ada",
                    "last_name": "Lovelace",
                    "position_role": "non_teaching_staff",
                    "office_unit_codes": ["RESEARCH_OFFICE"],
                    "location_code": "MAIN",
                    "years_of_service": "1_5",
                },
            )

        self.assertEqual(response.status_code, 201)
        target_insert = next(
            (query, params)
            for query, params in connection.db_cursor.executed
            if "INSERT INTO targets" in query
        )
        self.assertIn("rde_director_id", target_insert[0])
        self.assertEqual(target_insert[1], ("rde_director", 1, None, False))
        self.assertEqual(
            connection.db_cursor.batch_executed[0][1],
            [(42, 101)],
        )

    def test_registration_rejects_duplicate_office_unit_selections(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        response = app.test_client().post(
            "/api/auth/register",
            json={
                "email": "evaluator@capsu.edu.ph",
                "password": "secure-password-123",
                "first_name": "Ada",
                "last_name": "Lovelace",
                "position_role": "non_teaching_staff",
                "office_unit_codes": ["BAC", "BAC"],
                "location_code": "MAIN",
                "years_of_service": "1_5",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("cannot be selected more than once", response.get_json()["error"])

    def test_registration_requires_names_within_column_length(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        valid_payload = {
            "email": "evaluator@capsu.edu.ph",
            "password": "secure-password-123",
            "first_name": "Ada",
            "last_name": "Lovelace",
            "position_role": "teaching_faculty",
            "office_unit_codes": [],
            "location_code": "MAIN",
            "years_of_service": "1_5",
        }

        for field, value in (("first_name", " "), ("last_name", "L" * 101)):
            with self.subTest(field=field):
                payload = {**valid_payload, field: value}
                response = app.test_client().post("/api/auth/register", json=payload)

                self.assertEqual(response.status_code, 400)
                self.assertIn("First and last name", response.get_json()["error"])

    def test_student_leader_registration_does_not_require_years_of_service(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        connection = RegistrationConnection()

        @contextmanager
        def fake_connection(*args):
            yield connection

        with patch("backend.routes.auth.connection", fake_connection):
            response = app.test_client().post(
                "/api/auth/register",
                json={
                    "email": " Leader@Student.CAPSU.edu.ph ",
                    "password": "secure-password-123",
                    "first_name": "Ada",
                    "last_name": "Lovelace",
                    "position_role": "student_leader",
                    "office_unit_codes": [],
                    "location_code": "MAIN",
                },
            )

        self.assertEqual(response.status_code, 201)
        insert_params = next(
            params
            for query, params in connection.db_cursor.executed
            if "INSERT INTO users" in query
        )
        self.assertEqual(insert_params[0], "leader@student.capsu.edu.ph")
        self.assertIsNone(insert_params[6])

    def test_registration_silently_rejects_unsupported_email_domains(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        with patch("backend.routes.auth.connection") as connection:
            for email in (
                "evaluator@gmail.com",
                "evaluator@capsu.edu.ph.example.com",
                "evaluator@other.capsu.edu.ph",
            ):
                with self.subTest(email=email):
                    response = app.test_client().post("/api/auth/register", json={"email": email})
                    self.assertEqual(response.status_code, 204)
                    self.assertEqual(response.data, b"")
            connection.assert_not_called()

    def test_other_roles_still_require_years_of_service(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        response = app.test_client().post(
            "/api/auth/register",
            json={
                "email": "faculty@capsu.edu.ph",
                "password": "secure-password-123",
                "first_name": "Ada",
                "last_name": "Lovelace",
                "position_role": "teaching_faculty",
                "office_unit_codes": [],
                "location_code": "MAIN",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("valid years of service", response.get_json()["error"])

    def test_registration_limits_offices_by_role_and_campus(self):
        app = create_app({"SECRET_KEY": "test-secret", "TESTING": True})
        cases = [
            ("satellite_college_director", "SATELLITE_DIRECTOR_TAPAZ", 27, 201),
            ("satellite_college_director", "SATELLITE_DIRECTOR_PILAR", 20, 400),
            ("campus_administrator", "CAMPUS_FOCAL_ROXAS", 19, 400),
            ("director", "STUDENT_AFFAIRS", None, 201),
            ("director", "SPORTS", None, 201),
            ("director", "CULTURAL", None, 201),
            ("director", "BAC", None, 400),
            ("vice_president", "VP_ACADEMIC", None, 201),
            ("rde_director", "RESEARCH_OFFICE", None, 400),
        ]
        role_cases = [("student_leader", *case) for case in cases] + [
            ("teaching_faculty", "campus_administrator", "CAMPUS_ADMIN_BURIAS", 21, 400),
            ("teaching_faculty", "satellite_college_director", "SATELLITE_DIRECTOR_TAPAZ", 27, 201),
            ("teaching_faculty", "satellite_college_director", "SATELLITE_DIRECTOR_PILAR", 20, 400),
            ("teaching_faculty", "director", "BAC", None, 201),
            ("teaching_faculty", "rde_director", "RESEARCH_OFFICE", None, 201),
            ("director", "director", "BAC", None, 201),
            ("director", "director", "SPORTS", None, 400),
            ("vice_president", "vice_president", "VP_ACADEMIC", None, 400),
            ("vice_president", "satellite_college_director", "SATELLITE_DIRECTOR_TAPAZ", 27, 400),
            ("vice_president", "director", "BAC", None, 201),
            ("vice_president", "rde_director", "RESEARCH_OFFICE", None, 201),
            ("vice_president", "rde_center_director", "FOOD_TECH_CENTER", None, 201),
            ("campus_administrator_satellite_director", "director", "DIR_BAC", None, 201),
            ("campus_administrator_satellite_director", "satellite_college_director", "SATELLITE_DIRECTOR_TAPAZ", 27, 400),
        ]
        campus_cases = [("TAPAZ", 27, *case) for case in role_cases] + [
            ("BURIAS", 21, "vice_president", "campus_administrator", "CAMPUS_ADMIN_BURIAS", 21, 400),
            ("BURIAS", 21, "non_teaching_staff", "campus_administrator", "CAMPUS_ADMIN_BURIAS", 21, 201),
            ("BURIAS", 21, "non_teaching_staff", "satellite_college_director", "SATELLITE_DIRECTOR_TAPAZ", 27, 400),
        ]
        for location, campus_id, role, target_type, code, office_campus, status in campus_cases:
            with self.subTest(location=location, role=role, code=code):
                connection = RegistrationConnection()

                @contextmanager
                def fake_connection(*args):
                    yield connection

                def fake_fetch_all(cursor, query, params=()):
                    if params[0] != target_type:
                        return []
                    return [{
                        "code": code,
                        "campus_id": office_campus,
                        "target_id": 10,
                        "target_active": True,
                    }]

                with patch("backend.routes.auth.connection", fake_connection), patch(
                    "backend.routes.auth.fetch_one", return_value={"id": campus_id, "is_central": 0}
                ), patch("backend.routes.auth.fetch_all", side_effect=fake_fetch_all):
                    response = app.test_client().post("/api/auth/register", json={
                        "email": "leader@capsu.edu.ph",
                        "password": "secure-password-123",
                        "first_name": "Ada",
                        "last_name": "Lovelace",
                        "position_role": role,
                        "years_of_service": "1_5",
                        "office_unit_codes": [code],
                        "location_code": location,
                    })

                self.assertEqual(response.status_code, status)
                self.assertEqual(connection.committed, status == 201)

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
            return {"id": 1, "email": "admin@capsu.edu.ph", "role": "admin", "active": 1}
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
