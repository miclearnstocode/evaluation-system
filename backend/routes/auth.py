from flask import Blueprint

from core import *

bp = Blueprint("auth_api", __name__)

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
            "WHERE location_code IS NOT NULL AND active = 1 ORDER BY id",
        )
        position_roles = fetch_all(
            cursor,
            "SELECT code AS value, name AS label FROM registration_roles "
            "WHERE active = 1 ORDER BY sort_order, code",
        )
        service_years = fetch_all(
            cursor,
            "SELECT code AS value, name AS label FROM registration_service_years "
            "WHERE active = 1 ORDER BY sort_order, code",
        )
        units = fetch_all(
            cursor,
            "SELECT code, name, category FROM registration_units WHERE active = 1 ORDER BY code",
        )
        memberships = fetch_all(
            cursor,
            "SELECT o.id, o.name, o.unit_code FROM offices o "
            "JOIN registration_units r ON r.code = o.unit_code "
            "WHERE o.active = 1 AND r.active = 1 ORDER BY o.name",
        )
        head_offices = fetch_all(
            cursor,
            "SELECT o.id AS office_id, r.name, r.category, a.id AS administrator_id "
            "FROM offices o JOIN registration_units r ON r.code = o.unit_code "
            "JOIN administrators a ON a.office_id = o.id AND a.active = 1 "
            "LEFT JOIN office_head_claims hc ON hc.office_id = o.id "
            "WHERE r.category IN ('campus_head', 'director') AND o.active = 1 AND hc.user_id IS NULL "
            "ORDER BY r.name",
        )
        supervisors = fetch_all(
            cursor,
            "SELECT hc.id AS claim_id, r.name AS office_name, c.name AS campus_name "
            "FROM office_head_claims hc JOIN users u ON u.id = hc.user_id "
            "JOIN offices o ON o.id = hc.office_id JOIN registration_units r ON r.code = o.unit_code "
            "JOIN campuses c ON c.id = u.campus_id "
            "LEFT JOIN supervisor_claims sc ON sc.head_user_id = hc.user_id "
            "WHERE u.active = 1 AND sc.head_user_id IS NULL "
            "ORDER BY r.name",
        )
        cursor.close()
    return jsonify(
        position_roles=position_roles,
        locations=locations,
        units=units,
        service_years=service_years,
        memberships=memberships,
        head_offices=head_offices,
        supervisors=supervisors,
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
    if not isinstance(email, str) or not CAPSU_EMAIL.fullmatch(email.strip()):
        raise ApiError("Use your @capsu.edu.ph university email address.")
    if not isinstance(password, str) or len(password) < 12:
        raise ApiError("Password must contain at least 12 characters.")
    if not isinstance(position_role, str) or not isinstance(years_of_service, str):
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
    identity_unit_code = (
        "FACULTY" if position_role == "teaching_faculty"
        else "STUDENT" if position_role == "student_leader"
        else None
    )
    head_office_id = payload.get("head_office_id")
    reports_to_vp_office_id = payload.get("reports_to_vp_office_id")
    supervisor_claim_id = payload.get("supervisor_claim_id")
    if head_office_id:
        head_office_id = _positive_id(head_office_id, "head_office_id")
    if reports_to_vp_office_id:
        reports_to_vp_office_id = _positive_id(reports_to_vp_office_id, "reports_to_vp_office_id")
    if not head_office_id and reports_to_vp_office_id:
        raise ApiError("Choose a head office before selecting the Vice President you report to.")
    if supervisor_claim_id:
        try:
            supervisor_claim_id = str(uuid.UUID(supervisor_claim_id))
        except (TypeError, ValueError):
            raise ApiError("Select a valid immediate supervisor.") from None

    normalized_email = email.strip().lower()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        conn.start_transaction()
        position = fetch_one(
            cursor,
            "SELECT code FROM registration_roles WHERE code = %s AND active = 1",
            (position_role,),
        )
        service_year = fetch_one(
            cursor,
            "SELECT code FROM registration_service_years WHERE code = %s AND active = 1",
            (years_of_service,),
        )
        if not position or not service_year:
            raise ApiError("Select a valid position and years of service.")
        campus = fetch_one(
            cursor,
            "SELECT id, location_code, is_central, active FROM campuses "
            "WHERE location_code = %s",
            (location_code,),
        )
        if not campus or not campus["active"]:
            raise ApiError("Select a valid campus or office location.")
        member_office_ids = []
        if office_unit_codes:
            placeholders = ", ".join(["%s"] * len(office_unit_codes))
            offices = fetch_all(
                cursor,
                "SELECT o.id, o.unit_code, r.category FROM offices o "
                "JOIN registration_units r ON r.code = o.unit_code "
                f"WHERE o.unit_code IN ({placeholders}) AND o.active = 1 AND r.active = 1",
                tuple(office_unit_codes),
            )
            offices_by_code = {office["unit_code"]: office for office in offices}
            if len(offices_by_code) != len(office_unit_codes):
                raise ApiError("One of the selected Offices/Units is unavailable.", 409)
            member_office_ids = [offices_by_code[code]["id"] for code in office_unit_codes]
        else:
            offices_by_code = {}
        try:
            evaluator_group = derive_evaluator_group(
                position_role,
                [office["category"] for office in offices_by_code.values()],
            )
        except ValueError as error:
            raise ApiError(str(error)) from None

        head = None
        if head_office_id:
            heads = fetch_all(
                cursor,
                "SELECT o.id AS office_id, o.unit_code, r.category, a.id AS administrator_id "
                "FROM offices o JOIN registration_units r ON r.code = o.unit_code "
                "JOIN administrators a ON a.office_id = o.id AND a.active = 1 "
                "LEFT JOIN office_head_claims hc ON hc.office_id = o.id "
                "WHERE o.id = %s AND o.active = 1 AND hc.user_id IS NULL FOR UPDATE",
                (head_office_id,),
            )
            if len(heads) != 1:
                raise ApiError("That office head position is already claimed or has no single active administrator target.", 409)
            head = heads[0]
            if head["category"] == "director":
                vp = fetch_one(
                    cursor,
                    "SELECT o.id FROM offices o JOIN registration_units r ON r.code = o.unit_code "
                    "WHERE o.id = %s AND o.active = 1 AND r.active = 1 AND r.category = 'vp'",
                    (reports_to_vp_office_id,),
                ) if reports_to_vp_office_id else None
                if not vp:
                    raise ApiError("Director heads must select the Vice President office they report to.")
            elif reports_to_vp_office_id:
                raise ApiError("Only director-office heads select a reporting Vice President.")

        supervisor_user_id = None
        if supervisor_claim_id:
            supervisor = fetch_one(
                cursor,
                "SELECT hc.user_id FROM office_head_claims hc "
                "JOIN users u ON u.id = hc.user_id "
                "LEFT JOIN supervisor_claims sc ON sc.head_user_id = hc.user_id "
                "WHERE hc.id = %s AND u.active = 1 "
                "AND sc.head_user_id IS NULL",
                (supervisor_claim_id,),
            )
            if not supervisor:
                raise ApiError("That immediate-supervisor claim is no longer available.", 409)
            supervisor_user_id = supervisor["user_id"]

        cursor.execute(
            "INSERT INTO users "
            "(email, password_hash, role, campus_id, evaluator_group, position_role, office_unit_code, "
            "years_of_service, is_central_staff, active) "
            "VALUES (%s, %s, 'evaluator', %s, %s, %s, %s, %s, %s, 1)",
            (
                normalized_email,
                generate_password_hash(password),
                campus["id"],
                evaluator_group,
                position_role,
                identity_unit_code,
                years_of_service,
                campus["is_central"],
            ),
        )
        user_id = cursor.lastrowid
        if member_office_ids:
            cursor.executemany(
                "INSERT INTO office_memberships (user_id, office_id) VALUES (%s, %s)",
                [(user_id, office_id) for office_id in member_office_ids],
            )
        if head:
            cursor.execute(
                "INSERT INTO office_head_claims "
                "(id, user_id, office_id, administrator_id, reports_to_vp_office_id) "
                "VALUES (%s, %s, %s, %s, %s)",
                (
                    str(uuid.uuid4()),
                    user_id,
                    head["office_id"],
                    head["administrator_id"],
                    reports_to_vp_office_id,
                ),
            )
        if supervisor_user_id:
            if supervisor_user_id == user_id:
                raise ApiError("You cannot select yourself as your immediate supervisor.")
            cursor.execute(
                "INSERT INTO supervisor_claims (supervisor_user_id, head_user_id) VALUES (%s, %s)",
                (user_id, supervisor_user_id),
            )
        conn.commit()
        cursor.close()
    return jsonify(status="registered"), 201


