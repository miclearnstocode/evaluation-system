from flask import Blueprint

from core import *

bp = Blueprint("admin_api", __name__)

@bp.get("/api/admin/campuses")
@require_role("super_admin")
def list_campuses():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(cursor, "SELECT id, code, name, is_central, active FROM campuses ORDER BY name")
        cursor.close()
    return jsonify(items=rows)


@bp.post("/api/admin/campuses")
@require_role("super_admin")
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
            "INSERT INTO campuses (code, name, is_central) VALUES (%s, %s, %s)",
            (code, name, is_central),
        )
        campus_id = cursor.lastrowid
        conn.commit()
        cursor.close()
    return jsonify(id=campus_id), 201


@bp.patch("/api/admin/campuses/<int:campus_id>")
@require_role("super_admin")
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
@require_role("super_admin")
def list_offices():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(
            cursor,
            "SELECT o.id, o.campus_id, o.name, o.office_type, o.active, c.name AS campus_name "
            "FROM offices o JOIN campuses c ON c.id = o.campus_id ORDER BY c.name, o.name",
        )
        cursor.close()
    return jsonify(items=rows)


@bp.post("/api/admin/offices")
@require_role("super_admin")
def create_office():
    payload = _json_body()
    campus_id = _positive_id(payload.get("campus_id"), "campus_id")
    name = str(payload.get("name", "")).strip()
    office_type = payload.get("office_type")
    if not name or len(name) > 150 or office_type not in {"central_admin", "campus_office"}:
        raise ApiError("A valid office name and type are required.")
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        campus = fetch_one(cursor, "SELECT id, active FROM campuses WHERE id = %s", (campus_id,))
        if not campus or not campus["active"]:
            raise ApiError("Campus not found or inactive.", 404)
        cursor.execute(
            "INSERT INTO offices (campus_id, name, office_type) VALUES (%s, %s, %s)",
            (campus_id, name, office_type),
        )
        office_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO targets (target_type, office_id, campus_id, is_central) VALUES ('office', %s, %s, %s)",
            (office_id, campus_id, office_type == "central_admin"),
        )
        conn.commit()
        cursor.close()
    return jsonify(id=office_id), 201


@bp.patch("/api/admin/offices/<int:office_id>")
@require_role("super_admin")
def update_office(office_id: int):
    payload = _json_body()
    allowed = {"name", "active"}
    updates = {key: payload[key] for key in allowed if key in payload}
    if not updates:
        raise ApiError("Provide a name or active status.")
    if "active" in updates:
        updates["active"] = _bool_value(updates["active"], "active")
    query = ", ".join(f"{key} = %s" for key in updates)
    with connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE offices SET {query} WHERE id = %s", (*updates.values(), office_id))
        if cursor.rowcount == 0:
            raise ApiError("Office not found.", 404)
        conn.commit()
        cursor.close()
    return jsonify(status="ok")


@bp.get("/api/admin/administrators")
@require_role("super_admin")
def list_administrators():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(
            cursor,
            "SELECT a.id, a.office_id, a.name, a.position, a.active, o.name AS office_name, "
            "o.campus_id, c.name AS campus_name FROM administrators a "
            "JOIN offices o ON o.id = a.office_id JOIN campuses c ON c.id = o.campus_id "
            "ORDER BY a.name",
        )
        cursor.close()
    return jsonify(items=rows)


@bp.post("/api/admin/administrators")
@require_role("super_admin")
def create_administrator():
    payload = _json_body()
    office_id = _positive_id(payload.get("office_id"), "office_id")
    name = str(payload.get("name", "")).strip()
    position = str(payload.get("position", "")).strip() or None
    if not name or len(name) > 150:
        raise ApiError("A valid administrator name is required.")
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        office = fetch_one(
            cursor,
            "SELECT id, campus_id, office_type FROM offices WHERE id = %s",
            (office_id,),
        )
        if not office:
            raise ApiError("Office not found.", 404)
        cursor.execute(
            "INSERT INTO administrators (office_id, name, position) VALUES (%s, %s, %s)",
            (office_id, name, position),
        )
        administrator_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO targets (target_type, administrator_id, campus_id, is_central) "
            "VALUES ('administrator', %s, %s, %s)",
            (administrator_id, office["campus_id"], office["office_type"] == "central_admin"),
        )
        conn.commit()
        cursor.close()
    return jsonify(id=administrator_id), 201


@bp.patch("/api/admin/administrators/<int:administrator_id>")
@require_role("super_admin")
def update_administrator(administrator_id: int):
    payload = _json_body()
    allowed = {"name", "position", "active"}
    updates = {key: payload[key] for key in allowed if key in payload}
    if not updates:
        raise ApiError("Provide at least one administrator field to update.")
    if "active" in updates:
        updates["active"] = _bool_value(updates["active"], "active")
    query = ", ".join(f"{key} = %s" for key in updates)
    with connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE administrators SET {query} WHERE id = %s", (*updates.values(), administrator_id))
        if cursor.rowcount == 0:
            raise ApiError("Administrator not found.", 404)
        conn.commit()
        cursor.close()
    return jsonify(status="ok")


@bp.get("/api/admin/targets")
@require_role("super_admin")
def list_targets():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(
            cursor,
            "SELECT t.id, t.target_type, t.campus_id, t.is_central, c.name AS campus_name, "
            "CASE WHEN t.target_type = 'office' THEN o.name "
            "ELSE CONCAT(c.name, ' — ', o.name, ' (', a.name, ')') END AS name "
            "FROM targets t JOIN campuses c ON c.id = t.campus_id AND c.active = 1 "
            "LEFT JOIN administrators a ON a.id = t.administrator_id "
            "LEFT JOIN offices o ON o.id = COALESCE(t.office_id, a.office_id) "
            "WHERE (t.target_type = 'office' AND o.active = 1 OR "
            "t.target_type = 'administrator' AND a.active = 1) "
            "ORDER BY campus_name, name",
        )
        cursor.close()
    return jsonify(items=rows)


@bp.get("/api/admin/users")
@require_role("super_admin")
def list_users():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(
            cursor,
            "SELECT u.id, u.email, u.role, u.campus_id, u.evaluator_group, u.position_role, "
            "u.office_unit_code, u.years_of_service, u.is_central_staff, "
            "u.active, c.name AS campus_name, "
            "CASE u.office_unit_code WHEN 'FACULTY' THEN 'I am a Faculty' "
            "WHEN 'STUDENT' THEN 'I am a Student' ELSE COALESCE("
            "(SELECT GROUP_CONCAT(o.name ORDER BY o.name SEPARATOR ', ') "
            "FROM office_memberships om JOIN offices o ON o.id = om.office_id "
            "WHERE om.user_id = u.id), r.name) END AS office_unit_name "
            "FROM users u LEFT JOIN campuses c ON c.id = u.campus_id "
            "LEFT JOIN registration_units r ON r.code = u.office_unit_code ORDER BY u.email",
        )
        cursor.close()
    return jsonify(items=rows)


@bp.post("/api/admin/users")
@require_role("super_admin")
def create_user():
    payload = _json_body()
    email = payload.get("email")
    password = payload.get("password")
    role = payload.get("role")
    if not isinstance(email, str) or len(email.strip()) > 190 or "@" not in email:
        raise ApiError("A valid email is required.")
    if not isinstance(password, str) or len(password) < 12:
        raise ApiError("Password must contain at least 12 characters.")
    if role != "super_admin":
        raise ApiError("Evaluator accounts must be created through registration.")
    with connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (email, password_hash, role, active) "
            "VALUES (%s, %s, 'super_admin', 1)",
            (
                email.strip().lower(),
                generate_password_hash(password),
            ),
        )
        user_id = cursor.lastrowid
        conn.commit()
        cursor.close()
    return jsonify(id=user_id), 201


@bp.patch("/api/admin/users/<int:user_id>")
@require_role("super_admin")
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
@require_role("super_admin")
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
            cursor.callproc("delete_evaluator_account", (user_id,))
            _audit(cursor, actor, "delete", "user", user_id)
            conn.commit()
        except mysql.connector.Error as error:
            conn.rollback()
            if error.errno == 1644:
                raise ApiError("The evaluator account changed and could not be deleted. Refresh and try again.", 409) from None
            raise
        finally:
            cursor.close()
    return jsonify(status="deleted")


@bp.get("/api/admin/surveys")
@require_role("super_admin")
def list_surveys():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(cursor, "SELECT id, title, description, version, status FROM surveys ORDER BY id DESC")
        cursor.close()
    return jsonify(items=rows)


@bp.post("/api/admin/surveys")
@require_role("super_admin")
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
@require_role("super_admin")
def get_survey(survey_id: int):
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        survey = _load_survey(cursor, survey_id)
        cursor.close()
    return jsonify(survey)


@bp.put("/api/admin/surveys/<int:survey_id>")
@require_role("super_admin")
def update_survey(survey_id: int):
    payload = _json_body()
    title = str(payload.get("title", "")).strip()
    sections = validate_survey_payload(payload.get("sections"))
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        survey = fetch_one(cursor, "SELECT id, status FROM surveys WHERE id = %s", (survey_id,))
        if not survey:
            raise ApiError("Survey not found.", 404)
        if survey["status"] != "draft":
            raise ApiError("Published surveys are locked. Clone the survey to make changes.", 409)
        cursor.execute(
            "UPDATE surveys SET title = %s, description = %s WHERE id = %s",
            (title, str(payload.get("description", "")).strip() or None, survey_id),
        )
        cursor.execute("DELETE FROM sections WHERE survey_id = %s", (survey_id,))
        _insert_survey_content(cursor, survey_id, sections)
        conn.commit()
        cursor.close()
    return jsonify(status="ok")


@bp.post("/api/admin/surveys/<int:survey_id>/publish")
@require_role("super_admin")
def publish_survey(survey_id: int):
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        survey = fetch_one(cursor, "SELECT id, status FROM surveys WHERE id = %s", (survey_id,))
        if not survey:
            raise ApiError("Survey not found.", 404)
        if survey["status"] != "draft":
            raise ApiError("Only draft surveys can be published.", 409)
        question = fetch_one(cursor, "SELECT COUNT(*) AS total FROM questions WHERE survey_id = %s AND archived = 0", (survey_id,))
        if question["total"] == 0:
            raise ApiError("Add at least one question before publishing.")
        cursor.execute("UPDATE surveys SET status = 'published' WHERE id = %s", (survey_id,))
        conn.commit()
        cursor.close()
    return jsonify(status="published")


@bp.post("/api/admin/surveys/<int:survey_id>/clone")
@require_role("super_admin")
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
        content = _load_survey(cursor, survey_id)
        sections = [
            {
                "title": section["title"],
                "questions": [
                    {
                        "text": question["question_text"],
                        "type": question["type"],
                        "required": bool(question["required"]),
                        "options": [option["label"] for option in question["options"]],
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
@require_role("super_admin")
def list_cycles():
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        rows = fetch_all(
            cursor,
            "SELECT c.id, c.survey_id, c.target_type, c.name, c.opens_at, c.closes_at, c.status, "
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
@require_role("super_admin")
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
        survey = fetch_one(cursor, "SELECT id, status FROM surveys WHERE id = %s", (survey_id,))
        if not survey or survey["status"] != "published":
            raise ApiError("Choose a published survey.", 409)
        allow_same = _bool_value(payload.get("allow_same_campus", True), "allow_same_campus")
        cursor.execute(
            "INSERT INTO eval_cycles (survey_id, target_type, name, opens_at, closes_at, min_responses, allow_same_campus) "
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
@require_role("super_admin")
def update_cycle_rules(cycle_id: int):
    payload = _json_body()
    rules = payload.get("rules")
    if not isinstance(rules, list) or not rules:
        raise ApiError("Provide at least one eligibility rule.")
    clean = []
    for rule in rules:
        if not isinstance(rule, dict) or rule.get("effect") not in {"allow", "deny"}:
            raise ApiError("Each rule needs an allow or deny effect.")
        group = rule.get("evaluator_group")
        if group is not None and group not in EVALUATOR_GROUPS:
            raise ApiError("Invalid evaluator group in eligibility rule.")
        for key in ("evaluator_is_central", "target_is_central", "same_campus"):
            if key in rule and rule[key] is not None:
                _bool_value(rule[key], key)
        clean.append(
            (
                rule.get("evaluator_is_central"),
                group,
                rule.get("target_is_central"),
                rule.get("same_campus"),
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
            "(cycle_id, evaluator_is_central, evaluator_group, target_is_central, same_campus, effect) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            [(cycle_id, *rule) for rule in clean],
        )
        conn.commit()
        cursor.close()
    return jsonify(status="ok")


@bp.post("/api/admin/cycles/<int:cycle_id>/open")
@require_role("super_admin")
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
@require_role("super_admin")
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
@require_role("super_admin")
def participation_report():
    cycle_id = _positive_id(request.args.get("cycle_id"), "cycle_id")
    actor = request_user()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        cycle = fetch_one(cursor, "SELECT id, name, status FROM eval_cycles WHERE id = %s", (cycle_id,))
        if not cycle:
            raise ApiError("Cycle not found.", 404)
        _audit(cursor, actor, "view", "participation", cycle_id)
        targets = fetch_all(
            cursor,
            "SELECT t.id, t.target_type, t.campus_id, t.is_central, "
            "COALESCE(t.office_id, a.office_id) AS target_office_id, "
            "t.administrator_id AS target_administrator_id, o.unit_code AS office_unit_code, "
            "CASE WHEN t.target_type = 'office' THEN o.name "
            "ELSE CONCAT(c.name, ' — ', o.name, ' (', a.name, ')') END AS target_name, "
            "COALESCE(pc.submitted, 0) AS submitted "
            "FROM cycle_targets ct JOIN targets t ON t.id = ct.target_id "
            "LEFT JOIN administrators a ON a.id = t.administrator_id "
            "LEFT JOIN offices o ON o.id = COALESCE(t.office_id, a.office_id) "
            "JOIN campuses c ON c.id = t.campus_id "
            "LEFT JOIN participation_counts pc ON pc.cycle_id = ct.cycle_id AND pc.target_id = t.id "
            "WHERE ct.cycle_id = %s ORDER BY target_name",
            (cycle_id,),
        )
        rules = _load_rules(cursor, cycle_id)
        evaluators = fetch_all(
            cursor,
            "SELECT id, campus_id, evaluator_group, office_unit_code, is_central_staff FROM users "
            "WHERE role = 'evaluator' AND active = 1",
        )
        for target in targets:
            target["eligible"] = sum(
                _cycle_user_eligible(cursor, cycle_id, evaluator, target, rules)
                for evaluator in evaluators
            )
            target["percent"] = round(target["submitted"] * 100 / target["eligible"]) if target["eligible"] else 0
        conn.commit()
        cursor.close()
    return jsonify(cycle=cycle, items=targets)


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
            "SELECT id, survey_id, name, status, closes_at, min_responses "
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
            "SELECT total FROM response_counts WHERE cycle_id = %s AND target_id = %s",
            (cycle_id, target_id),
        )
        total = sum(row["total"] for row in counts)
        threshold = max(cycle["min_responses"], current_app.config["MIN_RESULT_COUNT"])
        if total < threshold:
            _audit(cursor, actor, "view_suppressed", "results", f"{cycle_id}:{target_id}")
            conn.commit()
            cursor.close()
            return jsonify(released=False, minimum=threshold, response_count=total)
        survey = _load_survey(cursor, cycle["survey_id"])
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
                mean = (
                    round(sum(row["option_key"] * row["count"] for row in distributions) / value_count, 2)
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
                                "value": row["option_key"],
                                "label": labels.get(row["option_key"], str(row["option_key"])),
                                "count": row["count"],
                            }
                            for row in distributions
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
    )


@bp.get("/api/admin/comments")
@require_role("super_admin")
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
        if not cycle or not _cycle_is_closed(cycle):
            raise ApiError("Comments are available only after the cycle is closed.", 409)
        if not _load_cycle_target(cursor, cycle_id, target_id):
            raise ApiError("Target not found in this cycle.", 404)
        threshold = max(cycle["min_responses"], current_app.config["MIN_RESULT_COUNT"])
        rows = fetch_all(
            cursor,
            "SELECT cm.id, cm.question_id, cm.body, cm.status, q.question_text, "
            "(SELECT COUNT(*) FROM comments all_cm WHERE all_cm.cycle_id = cm.cycle_id "
            "AND all_cm.target_id = cm.target_id AND all_cm.question_id = cm.question_id) AS question_count "
            "FROM comments cm JOIN questions q ON q.id = cm.question_id "
            "WHERE cm.cycle_id = %s AND cm.target_id = %s AND cm.status = %s "
            "ORDER BY RAND()",
            (cycle_id, target_id, status),
        )
        visible = [
            {"id": row["id"], "question_id": row["question_id"], "question": row["question_text"], "body": row["body"], "status": row["status"]}
            for row in rows
            if row["question_count"] >= threshold
        ]
        _audit(cursor, actor, "view", "comments", f"{cycle_id}:{target_id}:{status}")
        conn.commit()
        cursor.close()
    return jsonify(items=visible, minimum=threshold)


@bp.post("/api/admin/comments/<comment_id>/moderate")
@require_role("super_admin")
def moderate_comment(comment_id: str):
    try:
        normalized_id = str(uuid.UUID(comment_id))
    except ValueError:
        raise ApiError("Comment not found.", 404) from None
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
            "c.closes_at, (SELECT COUNT(*) FROM comments all_cm WHERE all_cm.cycle_id = cm.cycle_id "
            "AND all_cm.target_id = cm.target_id AND all_cm.question_id = cm.question_id) AS question_count "
            "FROM comments cm JOIN eval_cycles c ON c.id = cm.cycle_id WHERE cm.id = %s",
            (normalized_id,),
        )
        if not comment:
            raise ApiError("Comment not found.", 404)
        if not _cycle_is_closed({"status": comment["cycle_status"], "closes_at": comment["closes_at"]}):
            raise ApiError("Comments can be moderated only after the cycle is closed.", 409)
        threshold = max(
            current_app.config["MIN_RESULT_COUNT"],
            fetch_one(cursor, "SELECT min_responses FROM eval_cycles WHERE id = %s", (comment["cycle_id"],))["min_responses"],
        )
        if comment["question_count"] < threshold:
            raise ApiError("This comment group is below the privacy threshold.", 409)
        cursor.execute("UPDATE comments SET status = %s WHERE id = %s", (status, normalized_id))
        _audit(cursor, actor, status, "comment", normalized_id)
        conn.commit()
        cursor.close()
    return jsonify(status=status)


@bp.get("/api/admin/audit-log")
@require_role("super_admin")
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
