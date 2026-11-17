from flask import Blueprint

from core import *

bp = Blueprint("evaluator_api", __name__)

@bp.get("/api/evaluator/targets")
@require_role("evaluator")
def evaluator_targets():
    user = request_user()
    with connection("submit") as conn:
        cursor = conn.cursor(dictionary=True)
        cycles = fetch_all(
            cursor,
            "SELECT c.id AS cycle_id, c.name AS cycle_name, c.opens_at, c.closes_at, c.survey_id "
            "FROM eval_cycles c WHERE c.status = 'open' ORDER BY c.closes_at",
        )
        items = []
        for cycle in cycles:
            if not _cycle_is_open({"status": "open", **cycle}):
                continue
            rules = _load_rules(cursor, cycle["cycle_id"])
            targets = fetch_all(
                cursor,
                "SELECT t.id AS target_id, t.target_type, t.campus_id, t.is_central, "
                "COALESCE(t.office_id, a.office_id) AS target_office_id, "
                "t.administrator_id AS target_administrator_id, o.unit_code AS office_unit_code, "
                "CASE WHEN t.target_type = 'office' THEN o.name "
                "ELSE CONCAT(c.name, ' — ', o.name, ' (', a.name, ')') END AS target_name, "
                "c.name AS campus_name "
                "FROM cycle_targets ct JOIN targets t ON t.id = ct.target_id "
                "JOIN campuses c ON c.id = t.campus_id AND c.active = 1 "
                "LEFT JOIN administrators a ON a.id = t.administrator_id "
                "LEFT JOIN offices o ON o.id = COALESCE(t.office_id, a.office_id) "
                "WHERE ct.cycle_id = %s AND (t.target_type = 'office' AND o.active = 1 OR "
                "t.target_type = 'administrator' AND a.active = 1)",
                (cycle["cycle_id"],),
            )
            for target in targets:
                if not _cycle_user_eligible(cursor, cycle["cycle_id"], user, target, rules):
                    continue
                previous = fetch_one(
                    cursor,
                    "SELECT id FROM participation WHERE user_id = %s AND cycle_id = %s AND target_id = %s",
                    (user["id"], cycle["cycle_id"], target["target_id"]),
                )
                items.append(
                    {
                        "cycle_id": cycle["cycle_id"],
                        "cycle_name": cycle["cycle_name"],
                        "target_id": target["target_id"],
                        "target_type": target["target_type"],
                        "target_name": target["target_name"],
                        "campus_name": target["campus_name"],
                        "submitted": previous is not None,
                    }
                )
        cursor.close()
    return jsonify(items=items)


@bp.get("/api/evaluator/targets/<int:target_id>/form")
@require_role("evaluator")
def evaluator_form(target_id: int):
    cycle_id = _positive_id(request.args.get("cycle_id"), "cycle_id")
    user = request_user()
    with connection("submit") as conn:
        cursor = conn.cursor(dictionary=True)
        cycle = fetch_one(
            cursor,
            "SELECT c.id, c.survey_id, c.name, c.opens_at, c.closes_at, c.status "
            "FROM eval_cycles c WHERE c.id = %s",
            (cycle_id,),
        )
        if not cycle or not _cycle_is_open(cycle):
            raise ApiError("This evaluation cycle is not open.", 409)
        target = _load_cycle_target(cursor, cycle_id, target_id)
        if not target or not _cycle_user_eligible(cursor, cycle_id, user, target):
            raise ApiError("You are not eligible to evaluate this target.", 403)
        previous = fetch_one(
            cursor,
            "SELECT id FROM participation WHERE user_id = %s AND cycle_id = %s AND target_id = %s",
            (user["id"], cycle_id, target_id),
        )
        if previous:
            raise ApiError("You have already submitted this evaluation.", 409)
        survey = _load_survey(cursor, cycle["survey_id"])
        if survey["status"] != "published":
            raise ApiError("This survey is not available.", 409)
        cursor.close()
    return jsonify(
        cycle_id=cycle_id,
        cycle_name=cycle.get("name"),
        target_id=target_id,
        target_name=target["target_name"],
        survey_title=survey["title"],
        description=survey["description"],
        sections=survey["sections"],
    )


@bp.post("/api/evaluator/submit")
@require_role("evaluator")
def submit_evaluation():
    user = request_user()
    payload = _json_body()
    cycle_id = _positive_id(payload.get("cycle_id"), "cycle_id")
    target_id = _positive_id(payload.get("target_id"), "target_id")
    with connection("submit") as conn:
        cursor = conn.cursor(dictionary=True)
        stage = ""
        try:
            conn.start_transaction()
            cycle = fetch_one(
                cursor,
                "SELECT id, survey_id, opens_at, closes_at, status FROM eval_cycles "
                "WHERE id = %s LOCK IN SHARE MODE",
                (cycle_id,),
            )
            if not cycle or not _cycle_is_open(cycle):
                raise ApiError("This evaluation cycle is not open.", 409)
            target = _load_cycle_target(cursor, cycle_id, target_id)
            if not target or not _cycle_user_eligible(cursor, cycle_id, user, target):
                raise ApiError("You are not eligible to evaluate this target.", 403)
            existing = fetch_one(
                cursor,
                "SELECT id FROM participation WHERE user_id = %s AND cycle_id = %s AND target_id = %s",
                (user["id"], cycle_id, target_id),
            )
            if existing:
                raise ApiError("You have already submitted this evaluation.", 409)
            survey = _load_survey(cursor, cycle["survey_id"])
            if survey["status"] != "published":
                raise ApiError("This survey is not available.", 409)
            questions = [
                question
                for section in survey["sections"]
                for question in section["questions"]
            ]
            tallies, comments = validate_questions(questions, payload.get("answers"))
            submission_token = str(uuid.uuid4())
            stage = "participation"
            cursor.execute(
                "INSERT INTO participation "
                "(submission_token, user_id, cycle_id, target_id, submitted_on) "
                "VALUES (%s, %s, %s, %s, %s)",
                (submission_token, user["id"], cycle_id, target_id, _utcnow_naive().date()),
            )
            stage = "answers"
            for question_id, option_key in tallies:
                cursor.execute(
                    "INSERT INTO answer_tallies "
                    "(cycle_id, target_id, question_id, option_key, cnt) "
                    "VALUES (%s, %s, %s, %s, 1) "
                    "ON DUPLICATE KEY UPDATE cnt = cnt + 1",
                    (cycle_id, target_id, question_id, option_key),
                )
                cursor.execute(
                    "INSERT INTO submission_contributions "
                    "(submission_token, question_id, option_key) VALUES (%s, %s, %s)",
                    (submission_token, question_id, option_key),
                )
            cursor.execute(
                "INSERT INTO response_counts (cycle_id, target_id, total) "
                "VALUES (%s, %s, 1) ON DUPLICATE KEY UPDATE total = total + 1",
                (cycle_id, target_id),
            )
            for question_id, body in comments:
                comment_id = str(uuid.uuid4())
                cursor.execute(
                    "INSERT INTO comments (id, cycle_id, target_id, question_id, body) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (comment_id, cycle_id, target_id, question_id, body),
                )
                cursor.execute(
                    "INSERT INTO submission_contributions "
                    "(submission_token, question_id, comment_id) VALUES (%s, %s, %s)",
                    (submission_token, question_id, comment_id),
                )
            conn.commit()
        except mysql.connector.IntegrityError as error:
            conn.rollback()
            if error.errno == 1062 and stage == "participation":
                raise ApiError("You have already submitted this evaluation.", 409) from None
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
    return jsonify(status="submitted"), 201
