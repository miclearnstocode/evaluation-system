from flask import Blueprint

if __package__ and "." in __package__:
    from ..core import *
else:
    from core import *

bp = Blueprint("auth_api", __name__)

POSITION_ROLES = [
    {"value": "teaching_faculty", "label": "Teaching / Faculty"},
    {"value": "non_teaching_staff", "label": "Non-Teaching / Administrative Staff"},
    {"value": "student_leader", "label": "Student Leader"},
]
SERVICE_YEARS = [
    {"value": "lt_1", "label": "Less than 1 year"},
    {"value": "1_5", "label": "1–5 years"},
    {"value": "6_10", "label": "6–10 years"},
    {"value": "11_plus", "label": "11+ years"},
]
SERVICE_YEAR_CODES = {item["value"] for item in SERVICE_YEARS}


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
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        locations = fetch_all(
            cursor,
            "SELECT location_code AS code, name FROM campuses "
            "WHERE active = 1 ORDER BY name",
        )
        memberships = fetch_all(
            cursor,
            "SELECT id, name, CAST(id AS CHAR) AS unit_code, target_type FROM target_catalog "
            "WHERE active = 1 AND (campus_id IS NULL OR campus_id IN "
            "(SELECT id FROM campuses WHERE active = 1)) ORDER BY name",
        )
        cursor.close()
    return jsonify(
        position_roles=POSITION_ROLES,
        locations=locations,
        service_years=SERVICE_YEARS,
        memberships=memberships,
        units=[],
        head_offices=[],
        supervisors=[],
    )


@bp.post("/api/auth/register")
def register():
    payload = _json_body()
    email = payload.get("email")
    password = payload.get("password")
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
        not isinstance(position_role, str)
        or position_role not in role_codes
        or not isinstance(years_of_service, str)
        or years_of_service not in SERVICE_YEAR_CODES
    ):
        raise ApiError("Select a valid position and years of service.")
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
    try:
        target_ids = [_positive_id(code, "office_unit_code") for code in office_unit_codes]
    except ApiError:
        raise ApiError("Select only valid Offices/Units.") from None

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

            assigned_targets = []
            if target_ids:
                placeholders = ", ".join(["%s"] * len(target_ids))
                assigned_targets = fetch_all(
                    cursor,
                    "SELECT id, target_type FROM target_catalog "
                    f"WHERE id IN ({placeholders}) AND active = 1 "
                    "AND (campus_id IS NULL OR campus_id IN "
                    "(SELECT id FROM campuses WHERE active = 1))",
                    tuple(target_ids),
                )
                if len(assigned_targets) != len(target_ids):
                    raise ApiError("One of the selected Offices/Units is unavailable.", 409)

            try:
                evaluator_group = derive_evaluator_group(
                    position_role,
                    [target["target_type"] for target in assigned_targets],
                )
            except ValueError:
                raise ApiError("Position/Role and Office/Unit must be a valid combination.") from None

            cursor.execute(
                "INSERT INTO users "
                "(email, password_hash, role, campus_id, evaluator_group, position_role, "
                "years_of_service, is_central_staff, active) "
                "VALUES (%s, %s, 'evaluator', %s, %s, %s, %s, %s, 1)",
                (
                    normalized_email,
                    generate_password_hash(password),
                    campus["id"],
                    evaluator_group,
                    position_role,
                    years_of_service,
                    campus["is_central"],
                ),
            )
            user_id = cursor.lastrowid
            if assigned_targets:
                cursor.executemany(
                    "INSERT INTO user_office_assignments (user_id, target_id, assignment_role) "
                    "VALUES (%s, %s, 'member')",
                    [(user_id, target["id"]) for target in assigned_targets],
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
