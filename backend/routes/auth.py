from flask import Blueprint

if __package__ and "." in __package__:
    from ..core import *
else:
    from core import *

bp = Blueprint("auth_api", __name__)

POSITION_ROLES = [
    {"value": "teaching_faculty", "label": "Teaching / Faculty"},
    {"value": "non_teaching_staff", "label": "Non-Teaching / Administrative Staff"},
    {"value": "student_leader", "label": "Student Leader / SSC & FLP Officials"},
    {"value": "campus_administrator_satellite_director", "label": "Campus Administrator / Satellite College Director"},
    {"value": "director", "label": "Director"},
]

SERVICE_YEARS = [
    {"value": "lt_1", "label": "Less than 1 year"},
    {"value": "1_5", "label": "1–5 years"},
    {"value": "6_10", "label": "6–10 years"},
    {"value": "11_plus", "label": "11+ years"},
]
SERVICE_YEAR_CODES = {item["value"] for item in SERVICE_YEARS}

OFFICE_SOURCES = [
    ("campus_administrator", "campus_administrators", True),
    ("satellite_college_director", "satellite_college_directors", True),
    ("director", "directors", False),
    ("rde_director", "rde_directors", False),
    ("rde_center_director", "rde_center_directors", False),
]

# Central offices a student leader may belong to (matched on code)
STUDENT_CENTRAL_OFFICE_CODES = {
    "STUDENT_AFFAIRS",
    "DISASTER_RISK",
    "CLIMATE_CHANGE",
    "NSTP",
    "SPORTS",
    "CULTURAL",
}

# Faculty may select every campus-scoped office plus every central office
# EXCEPT the Bids and Awards Committee (BAC).
FACULTY_EXCLUDED_CENTRAL_CODES = {"BAC"}

# Campus administrators / satellite directors may select only the BAC.
CAMPUS_ADMIN_ALLOWED_CODES = {"BAC"}

CAMPUS_SCOPED_TYPES = {"campus_administrator", "satellite_college_director"}


def _memberships_for_role(memberships, position_role):
    """Filter the full membership list down to what the given role may select."""
    if not position_role:
        return []

    if position_role == "teaching_faculty":
        return [
            m for m in memberships
            if m["target_type"] in CAMPUS_SCOPED_TYPES
            or m["unit_code"] not in FACULTY_EXCLUDED_CENTRAL_CODES
        ]

    if position_role == "student_leader":
        return [
            m for m in memberships
            if m["target_type"] in CAMPUS_SCOPED_TYPES
            or m["unit_code"] in STUDENT_CENTRAL_OFFICE_CODES
        ]

    if position_role == "campus_administrator_satellite_director":
        return [
            m for m in memberships
            if m["unit_code"] in CAMPUS_ADMIN_ALLOWED_CODES
        ]

    if position_role == "director":
        return list(memberships)

    # non_teaching_staff and anything else: full list
    return list(memberships)


@bp.post("/api/auth/login")
def login():
    payload = _json_body()
    email = payload.get("email")
    password = payload.get("password")
    if not isinstance(email, str) or not isinstance(password, str):
        raise ApiError("Email and password are required.")
    with connection("admin") as conn:
        cursor = conn.cursor(dictionary=True)
        user = fetch_one(
            cursor,
            "SELECT id, email, password_hash, role, active FROM users WHERE email = %s",
            (email.strip().lower(),),
        )
        cursor.close()
    if (
        not user
        or not user["active"]
        or not user["password_hash"]
        or not check_password_hash(user["password_hash"], password)
    ):
        raise ApiError("Invalid email or password.", 401)
    session.clear()
    session["user_id"] = user["id"]
    session.permanent = True
    return jsonify(role="admin" if user["role"] == "super_admin" else "evaluator")


@bp.get("/api/auth/me")
@require_role()
def me():
    user = request_user()
    return jsonify(
        id=user["id"],
        email=user["email"],
        role="admin" if user["role"] == "super_admin" else "evaluator",
    )


@bp.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify(status="ok")


@bp.get("/api/auth/registration-options")
def registration_options():
    position_role = request.args.get("position_role")

    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        locations = fetch_all(
            cursor,
            "SELECT location_code AS code, name FROM campuses WHERE active = 1 ORDER BY name",
        )

        memberships = []
        units = []
        head_offices = []

        for target_type, table, has_campus in OFFICE_SOURCES:
            category = "campus_office" if has_campus else "central_admin"
            if has_campus:
                rows = fetch_all(
                    cursor,
                    f"SELECT code, title AS name FROM `{table}` "
                    "WHERE campus_id IN (SELECT id FROM campuses WHERE active = 1) "
                    "ORDER BY title",
                )
            else:
                rows = fetch_all(
                    cursor,
                    f"SELECT code, title AS name FROM `{table}` ORDER BY title",
                )

            for row in rows:
                entry = {
                    "code": row["code"],
                    "name": row["name"],
                    "type": target_type,
                    "campus": None,
                    "category": category,
                }
                memberships.append(
                    {
                        "id": row["code"],
                        "name": row["name"],
                        "unit_code": row["code"],
                        "target_type": target_type,
                    }
                )
                if category == "campus_office":
                    units.append(entry)
                else:
                    head_offices.append(entry)

        cursor.close()

    memberships.sort(key=lambda m: m["name"].lower())
    units.sort(key=lambda u: u["name"].lower())
    head_offices.sort(key=lambda h: h["name"].lower())

    return jsonify(
        position_roles=POSITION_ROLES,
        locations=locations,
        service_years=SERVICE_YEARS,
        memberships=memberships,
        role_memberships=_memberships_for_role(memberships, position_role),
        units=units,
        head_offices=head_offices,
        supervisors=[],
    )

@bp.post("/api/auth/register")
def register():
    payload = _json_body()
    email = payload.get("email")
    password = payload.get("password")
    first_name = payload.get("first_name")
    last_name = payload.get("last_name")
    position_role = payload.get("position_role")
    office_unit_codes = payload.get("office_unit_codes", [])
    location_code = payload.get("location_code")
    years_of_service = payload.get("years_of_service")
    role_codes = {item["value"] for item in POSITION_ROLES}

    if not isinstance(email, str) or not CAPSU_EMAIL.fullmatch(email.strip()):
        raise ApiError("Use your @capsu.edu.ph university email address.")
    if not isinstance(password, str) or len(password) < 12:
        raise ApiError("Password must contain at least 12 characters.")
    if (
        not isinstance(first_name, str)
        or not isinstance(last_name, str)
        or not first_name.strip()
        or not last_name.strip()
        or len(first_name.strip()) > 100
        or len(last_name.strip()) > 100
    ):
        raise ApiError("First and last name must each contain 1 to 100 characters.")
    if not isinstance(position_role, str) or position_role not in role_codes:
        raise ApiError("Select a valid position.")
    if position_role == "student_leader":
        years_of_service = None
    elif not isinstance(years_of_service, str) or years_of_service not in SERVICE_YEAR_CODES:
        raise ApiError("Select valid years of service.")
    if (
        not isinstance(office_unit_codes, list)
        or len(office_unit_codes) > 3
        or any(not isinstance(code, str) for code in office_unit_codes)
    ):
        raise ApiError("Select no more than three valid Offices/Units.")
    if len(set(office_unit_codes)) != len(office_unit_codes):
        raise ApiError("An Office/Unit cannot be selected more than once.")
    if position_role == "non_teaching_staff" and not office_unit_codes:
        raise ApiError("Select at least one Office/Unit.")
    if not isinstance(location_code, str):
        raise ApiError("Select a valid campus or office location.")

    normalized_email = email.strip().lower()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            conn.start_transaction()
            campus = fetch_one(
                cursor,
                "SELECT id, is_central FROM campuses WHERE location_code = %s AND active = 1",
                (location_code,),
            )
            if not campus:
                raise ApiError("Select a valid campus or office location.")

            valid_codes = set()
            if office_unit_codes:
                placeholders = ", ".join(["%s"] * len(office_unit_codes))
                for target_type, table, has_campus in OFFICE_SOURCES:
                    if has_campus:
                        rows = fetch_all(
                            cursor,
                            f"SELECT code FROM `{table}` WHERE code IN ({placeholders}) "
                            "AND campus_id IN (SELECT id FROM campuses WHERE active = 1)",
                            tuple(office_unit_codes),
                        )
                    else:
                        rows = fetch_all(
                            cursor,
                            f"SELECT code FROM `{table}` WHERE code IN ({placeholders})",
                            tuple(office_unit_codes),
                        )
                    valid_codes.update(row["code"] for row in rows)

            missing = set(office_unit_codes) - valid_codes
            if missing:
                raise ApiError("One of the selected Offices/Units is unavailable.", 409)

            cursor.execute(
                "INSERT INTO users "
                "(email, password_hash, first_name, last_name, role, campus_id, "
                "position_role, years_of_service, is_central_staff, active) "
                "VALUES (%s, %s, %s, %s, 'evaluator', %s, %s, %s, %s, 1)",
                (
                    normalized_email,
                    generate_password_hash(password),
                    first_name.strip(),
                    last_name.strip(),
                    campus["id"],
                    position_role,
                    years_of_service,
                    campus["is_central"],
                ),
            )
            user_id = cursor.lastrowid
            if office_unit_codes:
                cursor.executemany(
                    "INSERT INTO user_office_assignments (user_id, office_code, assignment_role) "
                    "VALUES (%s, %s, 'member')",
                    [(user_id, code) for code in office_unit_codes],
                )
            conn.commit()
        except mysql.connector.IntegrityError as error:
            conn.rollback()
            if error.errno == 1062:
                raise ApiError("An account already exists for that email address.", 409) from None
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
    return jsonify(status="registered"), 201