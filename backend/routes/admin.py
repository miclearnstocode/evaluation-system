import json
import re
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint

if __package__ and "." in __package__:
    from ..core import *
else:
    from core import *

bp = Blueprint("admin_api", __name__)

TARGET_ENTITIES = {
    "vice_president": ("vice_presidents", "vice_president_id", False),
    "campus_administrator": ("campus_administrators", "campus_administrator_id", True),
    "satellite_college_director": ("satellite_college_directors", "satellite_college_director_id", True),
    "director": ("directors", "director_id", False),
    "rde_director": ("rde_directors", "rde_director_id", False),
    "rde_center_director": ("rde_center_directors", "rde_center_director_id", False),
}


def _redact_email_addresses(text: str) -> str:
    return re.sub(
        r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
        "[email redacted]",
        text,
        flags=re.IGNORECASE,
    )


def _result_cycles(cursor: Any) -> list[dict[str, Any]]:
    cycles = fetch_all(
        cursor,
        "SELECT id, title AS name, status, opens_at, closes_at "
        "FROM eval_cycles WHERE status IN ('open', 'closed') "
        "ORDER BY opens_at DESC, id DESC",
    )
    return [
        cycle
        for cycle in cycles
        if cycle["status"] == "closed" or _cycle_is_open(cycle)
    ]


def _generated_code(name: str) -> str:
    base = re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")[:35] or "TARGET"
    return f"{base}_{uuid.uuid4().hex[:8].upper()}"


def _create_target(
    cursor: Any,
    target_type: str,
    code: str,
    name: str,
    campus_id: int | None,
    is_central: bool,
) -> int:
    entity = TARGET_ENTITIES.get(target_type)
    if entity is None:
        raise ApiError("Choose a valid target type.")
    table, reference_column, requires_campus = entity
    if requires_campus and campus_id is None:
        raise ApiError("This target type must be assigned to a campus.")
    if requires_campus:
        cursor.execute(
            f"INSERT INTO {table} (code, title, campus_id) VALUES (%s, %s, %s)",
            (code, name, campus_id),
        )
    else:
        cursor.execute(f"INSERT INTO {table} (code, title) VALUES (%s, %s)", (code, name))
    entity_id = cursor.lastrowid
    cursor.execute(
        f"INSERT INTO targets (target_type, {reference_column}, campus_id, is_central) "
        "VALUES (%s, %s, %s, %s)",
        (target_type, entity_id, campus_id, is_central),
    )
    return cursor.lastrowid


def _update_target(cursor: Any, target_id: int, name: str | None = None, active: bool | None = None) -> None:
    target = fetch_one(
        cursor,
        "SELECT id, target_type, target_ref_id FROM target_catalog WHERE id = %s",
        (target_id,),
    )
    if not target:
        raise ApiError("Target not found.", 404)
    table = TARGET_ENTITIES[target["target_type"]][0]
    if name is not None:
        cursor.execute(f"UPDATE {table} SET title = %s WHERE id = %s", (name, target["target_ref_id"]))
    if active is not None:
        cursor.execute("UPDATE targets SET active = %s WHERE id = %s", (active, target_id))


def _retract_submission(cursor: Any, submission_token: str) -> None:
    participation = fetch_one(
        cursor,
        "SELECT cycle_id, target_id FROM participation WHERE submission_token = %s",
        (submission_token,),
    )
    if not participation:
        return
    answers = fetch_all(
        cursor,
        "SELECT ea.question_id, ea.answer_value, q.question_type "
        "FROM evaluator_answers ea JOIN questions q ON q.id = ea.question_id "
        "WHERE ea.submission_token = %s",
        (submission_token,),
    )
    for answer in answers:
        value = answer["answer_value"]
        if isinstance(value, str):
            value = json.loads(value)
        if answer["question_type"] == "text":
            continue
        option_keys = value if answer["question_type"] == "multi_choice" else [value]
        for option_key in option_keys:
            cursor.execute(
                "UPDATE answer_tallies SET cnt = cnt - 1 "
                "WHERE cycle_id = %s AND target_id = %s AND question_id = %s "
                "AND option_key = %s AND cnt > 0",
                (
                    participation["cycle_id"],
                    participation["target_id"],
                    answer["question_id"],
                    str(int(option_key)),
                ),
            )
    cursor.execute(
        "DELETE FROM answer_tallies WHERE cycle_id = %s AND target_id = %s AND cnt = 0",
        (participation["cycle_id"], participation["target_id"]),
    )
    cursor.execute(
        "UPDATE response_counts SET total_submissions = total_submissions - 1 "
        "WHERE cycle_id = %s AND target_id = %s AND total_submissions > 0",
        (participation["cycle_id"], participation["target_id"]),
    )
    cursor.execute(
        "DELETE FROM response_counts WHERE cycle_id = %s AND target_id = %s AND total_submissions = 0",
        (participation["cycle_id"], participation["target_id"]),
    )
    cursor.execute("DELETE FROM participation WHERE submission_token = %s", (submission_token,))


@bp.get("/api/admin/campuses")
@require_role("admin")
def list_campuses():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(cursor, "SELECT id, code, name, is_central, active FROM campuses ORDER BY name")
        cursor.close()
    return jsonify(items=rows)


@bp.post("/api/admin/campuses")
@require_role("admin")
def create_campus():
    payload = _json_body()
    code = str(payload.get("code", "")).strip().upper()
    name = str(payload.get("name", "")).strip()
    if not code or len(code) > 20 or not name or len(name) > 150:
        raise ApiError("A campus code and name are required.")
    is_central = _bool_value(payload.get("is_central", False), "is_central")
    with connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO campuses (code, name, location_code, is_central) VALUES (%s, %s, %s, %s)",
            (code, name, code, is_central),
        )
        campus_id = cursor.lastrowid
        conn.commit()
        cursor.close()
    return jsonify(id=campus_id), 201


@bp.patch("/api/admin/campuses/<int:campus_id>")
@require_role("admin")
def update_campus(campus_id: int):
    payload = _json_body()
    allowed = {"code", "name", "is_central", "active"}
    updates = {key: payload[key] for key in allowed if key in payload}
    if not updates:
        raise ApiError("Provide at least one campus field to update.")
    for key in ("code", "name"):
        if key in updates:
            updates[key] = str(updates[key]).strip()
            if not updates[key]:
                raise ApiError(f"{key} cannot be empty.")
    for key in ("is_central", "active"):
        if key in updates:
            updates[key] = _bool_value(updates[key], key)
    if "code" in updates:
        updates["location_code"] = updates["code"].upper()
        updates["code"] = updates["code"].upper()
    query = ", ".join(f"{key} = %s" for key in updates)
    with connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE campuses SET {query} WHERE id = %s", (*updates.values(), campus_id))
        if cursor.rowcount == 0:
            raise ApiError("Campus not found.", 404)
        conn.commit()
        cursor.close()
    return jsonify(status="ok")


@bp.get("/api/admin/offices")
@require_role("admin")
def list_offices():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(
            cursor,
            "SELECT tc.id, tc.campus_id, tc.name, tc.is_central, "
            "tc.target_type AS office_type, tc.active, "
            "c.name AS campus_name FROM target_catalog tc "
            "LEFT JOIN campuses c ON c.id = tc.campus_id "
            "ORDER BY c.name, tc.name",
        )
        cursor.close()
    return jsonify(items=rows)


@bp.post("/api/admin/offices")
@require_role("admin")
def create_office():
    payload = _json_body()
    campus_id = _positive_id(payload.get("campus_id"), "campus_id") if payload.get("campus_id") else None
    name = str(payload.get("name", "")).strip()
    target_type = payload.get("target_type")
    if target_type is None:
        target_type = "director" if payload.get("office_type") == "central_admin" else "satellite_college_director"
    if not name or len(name) > 255 or target_type not in TARGET_ENTITIES:
        raise ApiError("A valid target name and type are required.")
    is_central = (
        _bool_value(payload["is_central"], "is_central")
        if "is_central" in payload
        else target_type in {"vice_president", "director"}
    )
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        if campus_id is not None:
            campus = fetch_one(cursor, "SELECT id, active, is_central FROM campuses WHERE id = %s", (campus_id,))
            if not campus or not campus["active"]:
                raise ApiError("Campus not found or inactive.", 404)
            if "is_central" not in payload:
                is_central = bool(campus["is_central"])
        code = str(payload.get("code") or _generated_code(name)).strip().upper()
        if not code or len(code) > 50:
            raise ApiError("A valid target code is required.")
        target_id = _create_target(cursor, target_type, code, name, campus_id, is_central)
        conn.commit()
        cursor.close()
    return jsonify(id=target_id), 201


@bp.patch("/api/admin/offices/<int:office_id>")
@require_role("admin")
def update_office(office_id: int):
    payload = _json_body()
    allowed = {"name", "active"}
    updates = {key: payload[key] for key in allowed if key in payload}
    if not updates:
        raise ApiError("Provide a name or active status.")
    if "active" in updates:
        updates["active"] = _bool_value(updates["active"], "active")
    if "name" in updates:
        updates["name"] = str(updates["name"]).strip()
        if not updates["name"] or len(updates["name"]) > 255:
            raise ApiError("Target name must contain 1 to 255 characters.")
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        _update_target(cursor, office_id, updates.get("name"), updates.get("active"))
        conn.commit()
        cursor.close()
    return jsonify(status="ok")


@bp.get("/api/admin/administrators")
@require_role("admin")
def list_administrators():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(
            cursor,
            "SELECT tc.id, tc.id AS office_id, tc.name, NULL AS position, tc.active, "
            "tc.name AS office_name, tc.campus_id, c.name AS campus_name, "
            "tc.target_type FROM target_catalog tc "
            "LEFT JOIN campuses c ON c.id = tc.campus_id "
            "WHERE tc.target_type IN ('campus_administrator', 'satellite_college_director') "
            "ORDER BY tc.name",)
        cursor.close()
    return jsonify(items=rows)


@bp.post("/api/admin/administrators")
@require_role("admin")
def create_administrator():
    payload = _json_body()
    office_id = _positive_id(payload.get("office_id"), "office_id")
    name = str(payload.get("name", "")).strip()
    position = str(payload.get("position", "")).strip() or None
    if not name or len(name) > 255:
        raise ApiError("A valid administrator name is required.")
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        office = fetch_one(
            cursor,
            "SELECT id, campus_id, target_type, is_central FROM target_catalog WHERE id = %s",
            (office_id,),
        )
        if not office:
            raise ApiError("Target not found.", 404)
        if office["campus_id"] is None:
            raise ApiError("Choose a campus-specific target before creating an administrator target.")
        title = f"{name} — {position}" if position else name
        code = _generated_code(title)
        administrator_id = _create_target(
            cursor,
            "campus_administrator",
            code,
            title,
            office["campus_id"],
            bool(office["is_central"]),
        )
        conn.commit()
        cursor.close()
    return jsonify(id=administrator_id), 201


@bp.patch("/api/admin/administrators/<int:administrator_id>")
@require_role("admin")
def update_administrator(administrator_id: int):
    payload = _json_body()
    allowed = {"name", "active"}
    if set(payload) - allowed:
        raise ApiError("Only administrator name and active status can be changed.")
    updates = {key: payload[key] for key in allowed if key in payload}
    if not updates:
        raise ApiError("Provide at least one administrator field to update.")
    if "active" in updates:
        updates["active"] = _bool_value(updates["active"], "active")
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        name = updates.get("name")
        if name is not None:
            name = str(name).strip()
            if not name or len(name) > 255:
                raise ApiError("Administrator name must contain 1 to 255 characters.")
        _update_target(cursor, administrator_id, name, updates.get("active"))
        conn.commit()
        cursor.close()
    return jsonify(status="ok")


@bp.get("/api/admin/targets")
@require_role()
def list_targets():
    if request_user()["role"] not in {"admin", "super_admin"}:
        raise ApiError("You do not have permission to access this resource.", 403)
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        if request_user()["role"] == "super_admin":
            target_ids = {
                target["target_id"]
                for cycle in _result_cycles(cursor)
                for target in fetch_all(
                    cursor,
                    "SELECT target_id FROM cycle_targets WHERE cycle_id = %s",
                    (cycle["id"],),
                )
            }
            rows = []
            if target_ids:
                placeholders = ", ".join(["%s"] * len(target_ids))
                rows = fetch_all(
                    cursor,
                    "SELECT tc.id, tc.target_type, tc.campus_id, tc.is_central, "
                    "c.name AS campus_name, tc.name FROM target_catalog tc "
                    "LEFT JOIN campuses c ON c.id = tc.campus_id "
                    f"WHERE tc.id IN ({placeholders}) AND tc.active = 1 "
                    "AND (tc.campus_id IS NULL OR c.active = 1) "
                    "ORDER BY campus_name, tc.name",
                    tuple(target_ids),
                )
        else:
            rows = fetch_all(
                cursor,
                "SELECT tc.id, tc.target_type, tc.campus_id, tc.is_central, "
                "c.name AS campus_name, tc.name FROM target_catalog tc "
                "LEFT JOIN campuses c ON c.id = tc.campus_id "
                "WHERE tc.active = 1 AND (tc.campus_id IS NULL OR c.active = 1) "
                "ORDER BY campus_name, tc.name",
            )
        cursor.close()
    return jsonify(items=rows)


@bp.get("/api/admin/users")
@require_role("admin")
def list_users():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(
            cursor,
            "SELECT u.id, u.email, u.role, u.campus_id, u.position_role, "
            "NULL AS office_unit_code, u.years_of_service, u.is_central_staff, "
            "u.active, c.name AS campus_name, "
            "GROUP_CONCAT(tc.name ORDER BY tc.name SEPARATOR ', ') AS office_unit_name "
            "FROM users u LEFT JOIN campuses c ON c.id = u.campus_id "
            "LEFT JOIN user_office_assignments ua ON ua.user_id = u.id "
            "LEFT JOIN target_catalog tc ON tc.id = ua.target_id "
            "GROUP BY u.id, c.name ORDER BY u.email",
        )
        cursor.close()
    return jsonify(items=rows)


@bp.post("/api/admin/users")
@require_role("admin")
def create_user():
    payload = _json_body()
    email = payload.get("email")
    password = payload.get("password")
    role = payload.get("role")
    if not isinstance(email, str) or len(email.strip()) > 190 or "@" not in email:
        raise ApiError("A valid email is required.")
    if not isinstance(password, str) or len(password) < 12:
        raise ApiError("Password must contain at least 12 characters.")
    if not isinstance(role, str) or role not in {"admin", "super_admin"}:
        raise ApiError("Only admin and super-admin accounts can be created here.")
    with connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (email, password_hash, role, active) "
            "VALUES (%s, %s, %s, 1)",
            (
                email.strip().lower(),
                generate_password_hash(password),
                role,
            ),
        )
        user_id = cursor.lastrowid
        conn.commit()
        cursor.close()
    return jsonify(id=user_id), 201


@bp.patch("/api/admin/users/<int:user_id>")
@require_role("admin")
def update_user(user_id: int):
    payload = _json_body()
    actor = request_user()
    if set(payload) != {"active"}:
        raise ApiError("Only account active status can be changed here.")
    active = _bool_value(payload.get("active"), "active")
    if user_id == actor["id"] and not active:
        raise ApiError("You cannot deactivate or demote your own account.")
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        existing = fetch_one(
            cursor,
            "SELECT id, role, active FROM users WHERE id = %s",
            (user_id,),
        )
        if not existing:
            raise ApiError("User not found.", 404)
        removes_admin = existing["role"] == "super_admin" and not active
        if removes_admin:
            active_admins = fetch_one(
                cursor,
                "SELECT COUNT(*) AS total FROM users WHERE role = 'super_admin' AND active = 1",
            )
            if active_admins["total"] <= 2:
                raise ApiError("At least two active super admin accounts must be kept.")
        cursor.execute("UPDATE users SET active = %s WHERE id = %s", (active, user_id))
        conn.commit()
        cursor.close()
    return jsonify(status="ok")


@bp.delete("/api/admin/users/<int:user_id>")
@require_role("admin")
def delete_user(user_id: int):
    actor = request_user()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        existing = fetch_one(cursor, "SELECT role FROM users WHERE id = %s", (user_id,))
        if not existing:
            raise ApiError("User not found.", 404)
        if existing["role"] != "evaluator":
            raise ApiError("Only evaluator accounts can be deleted here.", 409)

        conn.start_transaction()
        try:
            tokens = fetch_all(
                cursor,
                "SELECT submission_token FROM participation WHERE user_id = %s",
                (user_id,),
            )
            for row in tokens:
                _retract_submission(cursor, row["submission_token"])
            _audit(cursor, actor, "delete", "user", user_id)
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
    return jsonify(status="deleted")


@bp.get("/api/admin/surveys")
@require_role("admin")
def list_surveys():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(cursor, "SELECT id, title, description, version, status FROM surveys ORDER BY id DESC")
        cursor.close()
    return jsonify(items=rows)


@bp.post("/api/admin/surveys")
@require_role("admin")
def create_survey():
    payload = _json_body()
    title = str(payload.get("title", "")).strip()
    description = str(payload.get("description", "")).strip() or None
    sections = validate_survey_payload(payload.get("sections"))
    if not title or len(title) > 200:
        raise ApiError("A survey title is required.")
    with connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO surveys (title, description) VALUES (%s, %s)",
            (title, description),
        )
        survey_id = cursor.lastrowid
        _insert_survey_content(cursor, survey_id, sections)
        conn.commit()
        cursor.close()
    return jsonify(id=survey_id), 201


@bp.get("/api/admin/surveys/<int:survey_id>")
@require_role("admin")
def get_survey(survey_id: int):
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        survey = _load_survey(cursor, survey_id, include_scoring=True)
        cursor.close()
    return jsonify(survey)


@bp.put("/api/admin/surveys/<int:survey_id>")
@require_role("admin")
def update_survey(survey_id: int):
    payload = _json_body()
    title = str(payload.get("title", "")).strip()
    sections = validate_survey_payload(payload.get("sections"))
    if not title or len(title) > 200:
        raise ApiError("A survey title is required.")
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        survey = fetch_one(cursor, "SELECT id, status FROM surveys WHERE id = %s FOR UPDATE", (survey_id,))
        if not survey:
            raise ApiError("Survey not found.", 404)
        cursor.execute(
            "UPDATE surveys SET title = %s, description = %s WHERE id = %s",
            (title, str(payload.get("description", "")).strip() or None, survey_id),
        )
        _update_survey_content(cursor, survey_id, sections)
        conn.commit()
        cursor.close()
    return jsonify(status="updated")


@bp.delete("/api/admin/surveys/<int:survey_id>")
@require_role("admin")
def delete_survey(survey_id: int):
    actor = request_user()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            survey = fetch_one(
                cursor,
                "SELECT id FROM surveys WHERE id = %s FOR UPDATE",
                (survey_id,),
            )
            if not survey:
                raise ApiError("Survey not found.", 404)

            cycle = fetch_one(
                cursor,
                "SELECT id FROM eval_cycles WHERE survey_id = %s LIMIT 1",
                (survey_id,),
            )
            if cycle:
                raise ApiError("A survey used by an evaluation cycle cannot be deleted.", 409)

            cursor.execute("DELETE FROM surveys WHERE id = %s", (survey_id,))
            _audit(cursor, actor, "delete", "survey", survey_id)
            conn.commit()
        except mysql.connector.IntegrityError as error:
            conn.rollback()
            if error.errno == 1451:
                raise ApiError(
                    "This survey is still referenced by an evaluation cycle and cannot be deleted.",
                    409,
                ) from None
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
    return jsonify(status="deleted")


@bp.post("/api/admin/surveys/<int:survey_id>/publish")
@require_role("admin")
def publish_survey(survey_id: int):
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        survey = fetch_one(cursor, "SELECT id, status FROM surveys WHERE id = %s", (survey_id,))
        if not survey:
            raise ApiError("Survey not found.", 404)
        if survey["status"] != "draft":
            raise ApiError("Only draft surveys can be published.", 409)
        question = fetch_one(cursor, "SELECT COUNT(*) AS total FROM questions WHERE survey_id = %s AND is_archived = 0", (survey_id,))
        if question["total"] == 0:
            raise ApiError("Add at least one question before publishing.")
        cursor.execute("UPDATE surveys SET status = 'published' WHERE id = %s", (survey_id,))
        conn.commit()
        cursor.close()
    return jsonify(status="published")


@bp.post("/api/admin/surveys/<int:survey_id>/clone")
@require_role("admin")
def clone_survey(survey_id: int):
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        original = fetch_one(cursor, "SELECT * FROM surveys WHERE id = %s", (survey_id,))
        if not original:
            raise ApiError("Survey not found.", 404)
        new_version = fetch_one(
            cursor,
            "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM surveys WHERE title = %s",
            (original["title"],),
        )["version"]
        cursor.execute(
            "INSERT INTO surveys (title, description, version, status) "
            "VALUES (%s, %s, %s, 'draft')",
            (original["title"], original["description"], new_version),
        )
        new_id = cursor.lastrowid
        content = _load_survey(cursor, survey_id, include_scoring=True)
        sections = [
            {
                "title": section["title"],
                "questions": [
                    {
                        "text": question["question_text"],
                        "type": question["type"],
                        "required": bool(question["required"]),
                        "options": [
                            {"label": option["label"], "points": option["points"]}
                            for option in question["options"]
                        ],
                        "score_weight": question["score_weight"],
                        "scale_min": question["scale_min"] or 1,
                        "scale_max": question["scale_max"] or 5,
                        "min_label": question["min_label"],
                        "max_label": question["max_label"],
                    }
                    for question in section["questions"]
                ],
            }
            for section in content["sections"]
        ]
        _insert_survey_content(cursor, new_id, sections)
        conn.commit()
        cursor.close()
    return jsonify(id=new_id, version=new_version), 201


@bp.get("/api/admin/cycles")
@require_role()
def list_cycles():
    actor = request_user()
    if actor["role"] not in {"admin", "super_admin"}:
        raise ApiError("You do not have permission to access this resource.", 403)
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        if actor["role"] == "super_admin":
            rows = _result_cycles(cursor)
        else:
            rows = fetch_all(
                cursor,
                "SELECT c.id, c.survey_id, c.target_type, c.title AS name, c.opens_at, c.closes_at, c.status, "
                "c.min_responses, c.allow_same_campus, s.title AS survey_title "
                "FROM eval_cycles c JOIN surveys s ON s.id = c.survey_id ORDER BY c.id DESC",
            )
        for row in rows:
            row["target_ids"] = [
                target["target_id"]
                for target in fetch_all(cursor, "SELECT target_id FROM cycle_targets WHERE cycle_id = %s", (row["id"],))
            ]
        cursor.close()
    return jsonify(items=rows)


@bp.post("/api/admin/cycles")
@require_role("admin")
def create_cycle():
    payload = _json_body()
    survey_id = _positive_id(payload.get("survey_id"), "survey_id")
    name = str(payload.get("name", "")).strip()
    opens_at = _date_value(payload.get("opens_at"), "opens_at")
    closes_at = _date_value(payload.get("closes_at"), "closes_at")
    if not name or len(name) > 150 or closes_at <= opens_at:
        raise ApiError("Provide a cycle name and a valid time window.")
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        survey = fetch_one(cursor, "SELECT id, status FROM surveys WHERE id = %s FOR UPDATE", (survey_id,))
        if not survey or survey["status"] != "published":
            raise ApiError("Choose a published survey.", 409)
        allow_same = _bool_value(payload.get("allow_same_campus", True), "allow_same_campus")
        cursor.execute(
            "INSERT INTO eval_cycles (survey_id, target_type, title, opens_at, closes_at, min_responses, allow_same_campus) "
            "VALUES (%s, 'all', %s, %s, %s, %s, %s)",
            (survey_id, name, opens_at, closes_at, current_app.config["MIN_RESULT_COUNT"], allow_same),
        )
        cycle_id = cursor.lastrowid
        _insert_all_cycle_targets(cursor, cycle_id)
        _insert_default_rules(cursor, cycle_id, allow_same)
        conn.commit()
        cursor.close()
    return jsonify(id=cycle_id), 201


@bp.put("/api/admin/cycles/<int:cycle_id>/rules")
@require_role("admin")
def update_cycle_rules(cycle_id: int):
    payload = _json_body()
    rules = payload.get("rules")
    if not isinstance(rules, list) or not rules:
        raise ApiError("Provide at least one eligibility rule.")
    clean = []
    for rule in rules:
        if not isinstance(rule, dict) or rule.get("effect") not in {"allow", "deny"}:
            raise ApiError("Each rule needs an allow or deny effect.")
        if "evaluator_group" in rule:
            raise ApiError("Evaluator groups are no longer supported in eligibility rules.")
        target_central = rule.get("require_target_central", rule.get("target_is_central"))
        same_campus = rule.get("require_same_campus", rule.get("same_campus"))
        for key, value in (
            ("evaluator_is_central", rule.get("evaluator_is_central")),
            ("require_target_central", target_central),
            ("require_same_campus", same_campus),
        ):
            if value is not None:
                _bool_value(value, key)
        clean.append(
            (
                rule.get("evaluator_is_central"),
                target_central,
                same_campus,
                rule["effect"],
            )
        )
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        cycle = fetch_one(cursor, "SELECT status FROM eval_cycles WHERE id = %s", (cycle_id,))
        if not cycle:
            raise ApiError("Cycle not found.", 404)
        if cycle["status"] != "draft":
            raise ApiError("Eligibility rules are locked once a cycle is opened.", 409)
        cursor.execute("DELETE FROM eligibility_rules WHERE cycle_id = %s", (cycle_id,))
        cursor.executemany(
            "INSERT INTO eligibility_rules "
            "(cycle_id, evaluator_is_central, require_target_central, require_same_campus, action) "
            "VALUES (%s, %s, %s, %s, %s)",
            [(cycle_id, *rule) for rule in clean],
        )
        conn.commit()
        cursor.close()
    return jsonify(status="ok")


@bp.post("/api/admin/cycles/<int:cycle_id>/open")
@require_role("admin")
def open_cycle(cycle_id: int):
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        cycle = fetch_one(
            cursor,
            "SELECT c.status, c.survey_id, c.closes_at, s.status AS survey_status, "
            "(SELECT COUNT(*) FROM cycle_targets WHERE cycle_id = c.id) AS target_count "
            "FROM eval_cycles c JOIN surveys s ON s.id = c.survey_id WHERE c.id = %s",
            (cycle_id,),
        )
        if not cycle:
            raise ApiError("Cycle not found.", 404)
        if cycle["status"] != "draft" or cycle["survey_status"] != "published" or not cycle["target_count"]:
            raise ApiError("Cycle needs a published survey and at least one target.", 409)
        if cycle["closes_at"] <= _utcnow_naive():
            raise ApiError("A cycle whose close time has passed cannot be opened.", 409)
        cursor.execute("UPDATE eval_cycles SET status = 'open' WHERE id = %s", (cycle_id,))
        conn.commit()
        cursor.close()
    return jsonify(status="open")


@bp.post("/api/admin/cycles/<int:cycle_id>/close")
@require_role("admin")
def close_cycle(cycle_id: int):
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        cycle = fetch_one(cursor, "SELECT status, closes_at FROM eval_cycles WHERE id = %s", (cycle_id,))
        if not cycle:
            raise ApiError("Cycle not found.", 404)
        if cycle["status"] != "open":
            raise ApiError("Only open cycles can be closed.", 409)
        if cycle["closes_at"] > _utcnow_naive():
            raise ApiError("A cycle cannot be closed before its scheduled close time.", 409)
        cursor.execute("UPDATE eval_cycles SET status = 'closed' WHERE id = %s", (cycle_id,))
        conn.commit()
        cursor.close()
    return jsonify(status="closed")


@bp.get("/api/admin/participation")
@require_role("admin")
def participation_report():
    cycle_id = _positive_id(request.args.get("cycle_id"), "cycle_id")
    actor = request_user()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        cycle = fetch_one(cursor, "SELECT id, title AS name, status FROM eval_cycles WHERE id = %s", (cycle_id,))
        if not cycle:
            raise ApiError("Cycle not found.", 404)
        _audit(cursor, actor, "view", "participation", cycle_id)
        targets = fetch_all(
            cursor,
            "SELECT t.id, t.target_type, tc.campus_id, t.is_central, tc.name AS target_name, "
            "COALESCE(pc.submitted, 0) AS submitted "
            "FROM cycle_targets ct JOIN targets t ON t.id = ct.target_id "
            "JOIN target_catalog tc ON tc.id = t.id "
            "LEFT JOIN participation_counts pc ON pc.cycle_id = ct.cycle_id AND pc.target_id = t.id "
            "LEFT JOIN campuses c ON c.id = tc.campus_id "
            "WHERE ct.cycle_id = %s ORDER BY target_name",
            (cycle_id,),
        )
        evaluators = fetch_all(
            cursor,
            "SELECT id FROM users WHERE role = 'evaluator' AND active = 1",
        )
        for target in targets:
            target["eligible"] = len(evaluators)
            target["percent"] = round(target["submitted"] * 100 / target["eligible"]) if target["eligible"] else 0
        conn.commit()
        cursor.close()
    return jsonify(cycle=cycle, items=targets)


def _average_scores(scores: list[Decimal]) -> float | None:
    if not scores:
        return None
    average = sum(scores, Decimal("0")) / Decimal(len(scores))
    return float(average.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


@bp.get("/api/admin/standing")
@require_role()
def office_standing():
    actor = request_user()
    if actor["role"] not in {"admin", "super_admin"}:
        raise ApiError("You do not have permission to access this resource.", 403)

    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        cycles = fetch_all(
            cursor,
            "SELECT id, title AS name, survey_id, status, opens_at, closes_at "
            "FROM eval_cycles WHERE status IN ('open', 'closed') "
            "ORDER BY opens_at DESC, id DESC",
        )
        cycles = [
            cycle
            for cycle in cycles
            if cycle["status"] == "closed" or _cycle_is_open(cycle)
        ]
        if not cycles:
            cursor.close()
            return jsonify(role=actor["role"], cycles=[], selected_cycle_id=None, items=[])

        requested_cycle_id = request.args.get("cycle_id")
        if requested_cycle_id:
            selected_cycle_id = _positive_id(requested_cycle_id, "cycle_id")
            cycle = next((item for item in cycles if item["id"] == selected_cycle_id), None)
            if not cycle:
                raise ApiError("Cycle not found or not available.", 404)
        else:
            cycle = next((item for item in cycles if item["status"] == "open"), cycles[0])

        cycle_options = [
            {"id": item["id"], "name": item["name"], "status": item["status"]}
            for item in cycles
        ]
        sections = []
        if actor["role"] == "super_admin":
            sections = fetch_all(
                cursor,
                "SELECT id, title FROM sections WHERE survey_id = %s ORDER BY sort_order, id",
                (cycle["survey_id"],),
            )
            score_rows = fetch_all(
                cursor,
                "SELECT ers.target_id, ers.mean_score, ers.section_scores, "
                "u.email AS evaluator_email "
                "FROM evaluator_response_scores ers "
                "JOIN participation p ON p.submission_token = ers.score_link_token "
                "JOIN users u ON u.id = p.user_id "
                "WHERE ers.cycle_id = %s ORDER BY ers.target_id, p.submitted_at",
                (cycle["id"],),
            )
        else:
            score_rows = fetch_all(
                cursor,
                "SELECT target_id, mean_score FROM evaluator_response_scores "
                "WHERE cycle_id = %s ORDER BY target_id",
                (cycle["id"],),
            )
        targets = fetch_all(
            cursor,
            "SELECT t.id AS target_id, tc.name AS target_name, tc.target_type, "
            "tc.campus_id, t.is_central, c.name AS campus_name "
            "FROM cycle_targets ct JOIN targets t ON t.id = ct.target_id "
            "JOIN target_catalog tc ON tc.id = t.id "
            "LEFT JOIN campuses c ON c.id = tc.campus_id "
            "WHERE ct.cycle_id = %s AND t.active = 1 "
            "AND (tc.campus_id IS NULL OR c.active = 1) ORDER BY tc.name",
            (cycle["id"],),
        )

        scores_by_target: dict[int, list[dict[str, Any]]] = {}
        for row in score_rows:
            scores_by_target.setdefault(row["target_id"], []).append(row)

        items = []
        section_ids = {section["id"] for section in sections}
        for target in targets:
            target_scores = scores_by_target.get(target["target_id"], [])
            item = {
                **target,
                "office_mean_score": _average_scores(
                    [Decimal(str(row["mean_score"])) for row in target_scores]
                ),
            }
            if actor["role"] == "super_admin":
                item["response_count"] = len(target_scores)
                section_values: dict[int, list[Decimal]] = {
                    section_id: [] for section_id in section_ids
                }
                for row in target_scores:
                    section_scores = row["section_scores"]
                    if isinstance(section_scores, str):
                        section_scores = json.loads(section_scores)
                    for section_score in section_scores:
                        section_id = section_score["section_id"]
                        if section_id in section_values:
                            section_values[section_id].append(
                                Decimal(str(section_score["score"]))
                            )
                item["section_means"] = [
                    {
                        "section_id": section["id"],
                        "title": section["title"],
                        "mean_score": _average_scores(section_values[section["id"]]),
                    }
                    for section in sections
                ]
                item["evaluator_means"] = [
                    {
                        "email": row["evaluator_email"],
                        "mean_score": float(row["mean_score"]),
                    }
                    for row in target_scores
                ]
            items.append(item)

        _audit(cursor, actor, "view", "office_standing", cycle["id"])
        conn.commit()
        cursor.close()

    return jsonify(
        role=actor["role"],
        cycles=cycle_options,
        selected_cycle_id=cycle["id"],
        items=items,
    )


@bp.get("/api/admin/submissions")
@require_role("admin")
def list_submissions():
    cycle_id = _positive_id(request.args.get("cycle_id"), "cycle_id")
    target_id = _positive_id(request.args.get("target_id"), "target_id")
    actor = request_user()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        cycle = fetch_one(
            cursor,
            "SELECT id, status FROM eval_cycles WHERE id = %s",
            (cycle_id,),
        )
        if not cycle or cycle["status"] not in {"open", "closed"}:
            raise ApiError("Submissions are available only for open or closed cycles.", 409)
        if not _load_cycle_target(cursor, cycle_id, target_id):
            raise ApiError("Target not found in this cycle.", 404)
            
        # Fetch ALL active evaluators, LEFT JOIN their submission and score
        items = fetch_all(
            cursor,
            "SELECT u.id AS user_id, u.first_name, u.last_name, u.email AS evaluator_email, "
            "p.submission_token, p.submitted_at, ers.mean_score "
            "FROM users u "
            "LEFT JOIN participation p ON p.user_id = u.id AND p.cycle_id = %s AND p.target_id = %s "
            "LEFT JOIN evaluator_response_scores ers ON ers.score_link_token = p.submission_token "
            "WHERE u.role = 'evaluator' AND u.active = 1 "
            "ORDER BY u.first_name, u.last_name",
            (cycle_id, target_id),
        )
        
        valid_scores = []
        for item in items:
            if item["mean_score"] is not None:
                item["mean_score"] = float(item["mean_score"])
                valid_scores.append(Decimal(str(item["mean_score"])))
            if item["submitted_at"] is not None:
                item["submitted_at"] = str(item["submitted_at"])

        office_mean = _average_scores(valid_scores) if valid_scores else None

        _audit(cursor, actor, "view", "submission_list", f"{cycle_id}:{target_id}")
        conn.commit()
        cursor.close()
        
    return jsonify(items=items, office_mean=office_mean)


@bp.post("/api/admin/submissions/review")
@require_role("admin")
def review_submission():
    payload = _json_body()
    try:
        submission_token = str(uuid.UUID(payload.get("submission_token", "")))
    except (AttributeError, TypeError, ValueError):
        raise ApiError("Submission not found.", 404) from None
    actor = request_user()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        submission = fetch_one(
            cursor,
            "SELECT cycle_id, target_id FROM participation WHERE submission_token = %s",
            (submission_token,),
        )
        if not submission:
            raise ApiError("Submission not found.", 404)
        cycle = fetch_one(
            cursor,
            "SELECT status, opens_at, closes_at FROM eval_cycles WHERE id = %s",
            (submission["cycle_id"],),
        )
        if not cycle or not (_cycle_is_open(cycle) or _cycle_is_closed(cycle)):
            raise ApiError("Submissions can be reviewed only while a cycle is open or after it closes.", 409)
        answers = fetch_all(
            cursor,
            "SELECT ea.question_id, ea.answer_value, ea.score, q.prompt, q.question_type "
            "FROM evaluator_answers ea JOIN questions q ON q.id = ea.question_id "
            "WHERE ea.submission_token = %s ORDER BY q.sort_order, q.id",
            (submission_token,),
        )
        for answer in answers:
            value = answer["answer_value"]
            if isinstance(value, str):
                value = json.loads(value)
            if answer["question_type"] == "single_choice":
                option = fetch_one(
                    cursor,
                    "SELECT option_text FROM question_options WHERE id = %s",
                    (value,),
                )
                value = option["option_text"] if option else str(value)
            elif answer["question_type"] == "multi_choice" and value:
                placeholders = ", ".join(["%s"] * len(value))
                options = fetch_all(
                    cursor,
                    f"SELECT id, option_text FROM question_options WHERE id IN ({placeholders})",
                    tuple(value),
                )
                labels = {option["id"]: option["option_text"] for option in options}
                value = [labels.get(option_id, str(option_id)) for option_id in value]
            elif answer["question_type"] == "yes_no":
                value = "Yes" if value else "No"
            elif answer["question_type"] == "text":
                value = _redact_email_addresses(value)
            answer["answer"] = value
            answer["score"] = float(answer["score"]) if answer["score"] is not None else None
            del answer["answer_value"]
        comments = fetch_all(
            cursor,
            "SELECT cm.id, cm.question_id, q.prompt AS question, cm.comment_text, cm.status "
            "FROM comments cm JOIN questions q ON q.id = cm.question_id "
            "WHERE cm.submission_token = %s ORDER BY q.sort_order, q.id",
            (submission_token,),
        )
        for comment in comments:
            comment["comment_text"] = _redact_email_addresses(comment["comment_text"])
        _audit(cursor, actor, "view", "submission_review", f"{submission['cycle_id']}:{submission['target_id']}")
        conn.commit()
        cursor.close()
    return jsonify(answers=answers, comments=comments)


@bp.delete("/api/admin/submissions")
@require_role("admin")
def delete_submission():
    payload = _json_body()
    try:
        submission_token = str(uuid.UUID(payload.get("submission_token", "")))
    except (AttributeError, TypeError, ValueError):
        raise ApiError("Submission not found.", 404) from None
    actor = request_user()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        conn.start_transaction()
        try:
            submission = fetch_one(
                cursor,
                "SELECT cycle_id, target_id FROM participation "
                "WHERE submission_token = %s FOR UPDATE",
                (submission_token,),
            )
            if not submission:
                raise ApiError("Submission not found.", 404)
            _retract_submission(cursor, submission_token)
            _audit(cursor, actor, "delete", "submission", f"{submission['cycle_id']}:{submission['target_id']}")
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
    return jsonify(status="deleted")


@bp.get("/api/admin/results/options")
@require_role("super_admin")
def results_options():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        cycles = _result_cycles(cursor)
        for cycle in cycles:
            cycle["target_ids"] = [
                target["target_id"]
                for target in fetch_all(
                    cursor,
                    "SELECT target_id FROM cycle_targets WHERE cycle_id = %s",
                    (cycle["id"],),
                )
            ]
        target_ids = sorted(
            {target_id for cycle in cycles for target_id in cycle["target_ids"]}
        )
        targets = []
        if target_ids:
            placeholders = ", ".join(["%s"] * len(target_ids))
            targets = fetch_all(
                cursor,
                "SELECT tc.id, tc.name, tc.target_type, tc.campus_id, "
                "tc.is_central, c.name AS campus_name "
                "FROM target_catalog tc LEFT JOIN campuses c ON c.id = tc.campus_id "
                f"WHERE tc.id IN ({placeholders}) AND tc.active = 1 "
                "AND (tc.campus_id IS NULL OR c.active = 1) ORDER BY tc.name",
                tuple(target_ids),
            )
        available_ids = {target["id"] for target in targets}
        for cycle in cycles:
            cycle["target_ids"] = [
                target_id
                for target_id in cycle["target_ids"]
                if target_id in available_ids
            ]
        cursor.close()
    return jsonify(cycles=cycles, targets=targets)


@bp.get("/api/admin/results")
@require_role("super_admin")
def results():
    cycle_id = _positive_id(request.args.get("cycle_id"), "cycle_id")
    target_id = _positive_id(request.args.get("target_id"), "target_id")
    actor = request_user()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        cycle = fetch_one(
            cursor,
            "SELECT id, survey_id, title AS name, status, closes_at, min_responses "
            "FROM eval_cycles WHERE id = %s",
            (cycle_id,),
        )
        if not cycle:
            raise ApiError("Cycle not found.", 404)
        if cycle["status"] not in {"open", "closed"}:
            raise ApiError("Results are available only for open or closed cycles.", 409)
        target = _load_cycle_target(cursor, cycle_id, target_id)
        if not target:
            raise ApiError("Target not found in this cycle.", 404)
        counts = fetch_all(
            cursor,
            "SELECT total_submissions AS total FROM response_counts WHERE cycle_id = %s AND target_id = %s",
            (cycle_id, target_id),
        )
        total = sum(row["total"] for row in counts)
        threshold = 1
        if total < threshold:
            _audit(cursor, actor, "view_suppressed", "results", f"{cycle_id}:{target_id}")
            conn.commit()
            cursor.close()
            return jsonify(released=False, minimum=threshold, response_count=total)
        survey = _load_survey(cursor, cycle["survey_id"])
        answer_rows = fetch_all(
            cursor,
            "SELECT response_id, question_id, answer_value, score AS question_score "
            "FROM evaluator_answers WHERE cycle_id = %s AND target_id = %s ORDER BY RAND()",
            (cycle_id, target_id),
        )
        score_rows = fetch_all(
            cursor,
            "SELECT response_id, total_score, mean_score, section_scores "
            "FROM evaluator_response_scores WHERE cycle_id = %s AND target_id = %s ORDER BY RAND()",
            (cycle_id, target_id),
        )
        questions_by_id = {
            question["id"]: question
            for section in survey["sections"]
            for question in section["questions"]
        }
        response_answers: dict[str, dict[str, Any]] = {}
        for row in score_rows:
            section_scores = row["section_scores"]
            if isinstance(section_scores, str):
                section_scores = json.loads(section_scores)
            response_answers[row["response_id"]] = {
                "answers": {},
                "total_score": float(row["total_score"]),
                "mean_score": float(row["mean_score"]),
                "section_scores": [
                    {**section, "score": float(section["score"])}
                    for section in section_scores
                ],
            }
        for row in answer_rows:
            question = questions_by_id.get(row["question_id"])
            if not question:
                continue
            answer_value = row["answer_value"]
            if isinstance(answer_value, str):
                answer_value = json.loads(answer_value)
            if question["type"] == "single_choice":
                answer_value = next(
                    (option["label"] for option in question["options"] if option["id"] == answer_value),
                    str(answer_value),
                )
            elif question["type"] == "multi_choice":
                option_labels = {option["id"]: option["label"] for option in question["options"]}
                answer_value = [option_labels.get(value, str(value)) for value in answer_value]
            elif question["type"] == "yes_no":
                answer_value = "Yes" if answer_value else "No"
            elif question["type"] == "text":
                answer_value = _redact_email_addresses(answer_value)
            response = response_answers.setdefault(row["response_id"], {"answers": {}})
            response["answers"][row["question_id"]] = {
                "question": question["question_text"],
                "answer": answer_value,
                "score": float(row["question_score"]) if row["question_score"] is not None else None,
            }
        individual_responses = []
        for response in response_answers.values():
            answers = response.pop("answers")
            individual_responses.append(
                {
                    **response,
                    "answers": [
                        answers[question["id"]]
                        for question in questions_by_id.values()
                        if question["id"] in answers
                    ],
                }
            )
        question_results = []
        for section in survey["sections"]:
            for question in section["questions"]:
                distributions = fetch_all(
                    cursor,
                    "SELECT option_key, SUM(cnt) AS count FROM answer_tallies "
                    "WHERE cycle_id = %s AND target_id = %s AND question_id = %s "
                    "GROUP BY option_key ORDER BY option_key",
                    (cycle_id, target_id, question["id"]),
                )
                value_count = sum(row["count"] for row in distributions)
                normalized_distributions = []
                for row in distributions:
                    value = row["option_key"]
                    if question["type"] in {"scale", "rating", "yes_no"}:
                        value = int(value)
                    elif value.isdigit():
                        value = int(value)
                    normalized_distributions.append({**row, "value": value})
                mean = (
                    round(sum(row["value"] * row["count"] for row in normalized_distributions) / value_count, 2)
                    if question["type"] in {"scale", "rating", "yes_no"} and value_count
                    else None
                )
                if question["type"] in {"single_choice", "multi_choice"}:
                    labels = {option["id"]: option["label"] for option in question["options"]}
                elif question["type"] == "yes_no":
                    labels = {0: "No", 1: "Yes"}
                else:
                    labels = {}
                question_results.append(
                    {
                        "id": question["id"],
                        "text": question["question_text"],
                        "type": question["type"],
                        "mean": mean,
                        "distribution": [
                            {
                                "value": row["value"],
                                "label": labels.get(row["value"], str(row["value"])),
                                "count": row["count"],
                            }
                            for row in normalized_distributions
                        ],
                    }
                )
        _audit(cursor, actor, "view", "results", f"{cycle_id}:{target_id}")
        conn.commit()
        cursor.close()
    return jsonify(
        released=True,
        minimum=threshold,
        response_count=total,
        cycle={"id": cycle_id, "name": cycle["name"]},
        target={"id": target_id, "name": target["target_name"]},
        questions=question_results,
        individual_responses=individual_responses,
    )


@bp.get("/api/admin/comments")
@require_role("admin")
def list_comments():
    cycle_id = _positive_id(request.args.get("cycle_id"), "cycle_id")
    target_id = _positive_id(request.args.get("target_id"), "target_id")
    status = request.args.get("status", "pending")
    if status not in {"pending", "approved", "hidden"}:
        raise ApiError("Invalid comment status.")
    actor = request_user()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        cycle = fetch_one(cursor, "SELECT * FROM eval_cycles WHERE id = %s", (cycle_id,))
        if not cycle or not (_cycle_is_open(cycle) or _cycle_is_closed(cycle)):
            raise ApiError("Comments are available only while a cycle is open or after it closes.", 409)
        if not _load_cycle_target(cursor, cycle_id, target_id):
            raise ApiError("Target not found in this cycle.", 404)
        rows = fetch_all(
            cursor,
            "SELECT cm.id, cm.question_id, cm.comment_text AS body, cm.status, q.prompt AS question_text "
            "FROM comments cm JOIN questions q ON q.id = cm.question_id "
            "WHERE cm.cycle_id = %s AND cm.target_id = %s AND cm.status = %s "
            "ORDER BY RAND()",
            (cycle_id, target_id, status),
        )
        visible = [
            {
                "id": row["id"],
                "question_id": row["question_id"],
                "question": row["question_text"],
                "body": _redact_email_addresses(row["body"]),
                "status": row["status"],
            }
            for row in rows
        ]
        _audit(cursor, actor, "view", "comments", f"{cycle_id}:{target_id}:{status}")
        conn.commit()
        cursor.close()
    return jsonify(items=visible)


@bp.post("/api/admin/comments/<int:comment_id>/moderate")
@require_role("admin")
def moderate_comment(comment_id: int):
    payload = _json_body()
    status = payload.get("status")
    if status not in {"approved", "hidden"}:
        raise ApiError("Comment status must be approved or hidden.")
    actor = request_user()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        comment = fetch_one(
            cursor,
            "SELECT cm.id, cm.cycle_id, cm.target_id, cm.question_id, c.status AS cycle_status, "
            "c.opens_at, c.closes_at "
            "FROM comments cm JOIN eval_cycles c ON c.id = cm.cycle_id WHERE cm.id = %s",
            (comment_id,),
        )
        if not comment:
            raise ApiError("Comment not found.", 404)
        cycle = {
            "status": comment["cycle_status"],
            "opens_at": comment["opens_at"],
            "closes_at": comment["closes_at"],
        }
        if not (_cycle_is_open(cycle) or _cycle_is_closed(cycle)):
            raise ApiError("Comments can be moderated only while a cycle is open or after it closes.", 409)
        cursor.execute("UPDATE comments SET status = %s WHERE id = %s", (status, comment_id))
        _audit(cursor, actor, status, "comment", comment_id)
        conn.commit()
        cursor.close()
    return jsonify(status=status)


@bp.get("/api/admin/audit-log")
@require_role("admin")
def audit_log():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(
            cursor,
            "SELECT l.id, u.email AS admin_email, l.action, l.entity, l.entity_id, l.created_at "
            "FROM admin_audit_log l JOIN users u ON u.id = l.admin_id "
            "ORDER BY l.created_at DESC, l.id DESC LIMIT 500",
        )
        cursor.close()
    return jsonify(items=rows)
