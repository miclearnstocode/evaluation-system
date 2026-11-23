import json

from flask import Blueprint

if __package__ and "." in __package__:
    from ..core import *
    from ..scoring import calculate_response_scores
else:
    from core import *
    from scoring import calculate_response_scores

bp = Blueprint("evaluator_api", __name__)


def _load_evaluator_target(cursor: Any, target_id: int) -> dict[str, Any] | None:
    return fetch_one(
        cursor,
        "SELECT t.id, t.target_type, COALESCE(tc.campus_id, t.campus_id) AS campus_id, "
        "t.is_central, COALESCE(tc.name, t.office_head_name, "
        "CONCAT(REPLACE(t.target_type, '_', ' '), ' #', t.id)) AS target_name, "
        "c.name AS campus_name FROM targets t "
        "LEFT JOIN target_catalog tc ON tc.id = t.id "
        "LEFT JOIN campuses c ON c.id = COALESCE(tc.campus_id, t.campus_id) "
        "WHERE t.id = %s",
        (target_id,),
    )


@bp.get("/api/evaluator/targets")
@require_role("evaluator")
def evaluator_targets():
    user = request_user()
    with connection("submit") as conn:
        cursor = conn.cursor(dictionary=True)
        cycles = fetch_all(
            cursor,
            "SELECT c.id AS cycle_id, c.title AS cycle_name, c.opens_at, c.closes_at, c.survey_id "
            "FROM eval_cycles c WHERE c.status = 'open' ORDER BY c.closes_at",
        )
        targets = fetch_all(
            cursor,
            "SELECT t.id AS target_id, t.target_type, "
            "COALESCE(tc.campus_id, t.campus_id) AS campus_id, t.is_central, "
            "COALESCE(tc.name, t.office_head_name, "
            "CONCAT(REPLACE(t.target_type, '_', ' '), ' #', t.id)) AS target_name, "
            "c.name AS campus_name FROM targets t "
            "LEFT JOIN target_catalog tc ON tc.id = t.id "
            "LEFT JOIN campuses c ON c.id = COALESCE(tc.campus_id, t.campus_id) "
            "ORDER BY target_name",
        )
        open_cycles = [
            cycle
            for cycle in cycles
            if _cycle_is_open({"status": "open", **cycle})
        ]
        items = []
        for cycle in open_cycles:
            for target in targets:
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
                        "is_central": target["is_central"],
                        "submitted": previous is not None,
                    }
                )
        if not open_cycles:
            items = [
                {
                    "cycle_id": None,
                    "cycle_name": None,
                    "target_id": target["target_id"],
                    "target_type": target["target_type"],
                    "target_name": target["target_name"],
                    "campus_name": target["campus_name"],
                    "is_central": target["is_central"],
                    "submitted": False,
                }
                for target in targets
            ]
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
            "SELECT c.id, c.survey_id, c.title AS name, c.opens_at, c.closes_at, c.status "
            "FROM eval_cycles c WHERE c.id = %s",
            (cycle_id,),
        )
        if not cycle or not _cycle_is_open(cycle):
            raise ApiError("This evaluation cycle is not open.", 409)
        target = _load_evaluator_target(cursor, target_id)
        if not target:
            raise ApiError("Target not found.", 404)
        previous = fetch_one(
            cursor,
            "SELECT id FROM participation WHERE user_id = %s AND cycle_id = %s AND target_id = %s",
            (user["id"], cycle_id, target_id),
        )
        if previous:
            raise ApiError("You have already submitted this evaluation.", 409)
        survey = _load_survey(cursor, cycle["survey_id"], cycle_id=cycle_id)
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
            target = _load_evaluator_target(cursor, target_id)
            if not target:
                raise ApiError("Target not found.", 404)
            existing = fetch_one(
                cursor,
                "SELECT id FROM participation WHERE user_id = %s AND cycle_id = %s AND target_id = %s",
                (user["id"], cycle_id, target_id),
            )
            if existing:
                raise ApiError("You have already submitted this evaluation.", 409)
            survey = _load_survey(
                cursor,
                cycle["survey_id"],
                include_scoring=True,
                cycle_id=cycle_id,
            )
            if survey["status"] != "published":
                raise ApiError("This survey is not available.", 409)
            cursor.execute(
                "INSERT IGNORE INTO cycle_targets (cycle_id, target_id) VALUES (%s, %s)",
                (cycle_id, target_id),
            )
            questions = [
                question
                for section in survey["sections"]
                for question in section["questions"]
            ]
            questions_by_id = {question["id"]: question for question in questions}
            tallies, comments, individual_answers = validate_questions(questions, payload.get("answers"))
            score_data = calculate_response_scores(survey["sections"], individual_answers)
            submission_token = str(uuid.uuid4())
            stage = "participation"
            cursor.execute(
                "INSERT INTO participation "
                "(submission_token, user_id, cycle_id, target_id) "
                "VALUES (%s, %s, %s, %s)",
                (submission_token, user["id"], cycle_id, target_id),
            )
            response_id = str(uuid.uuid4())
            cursor.execute(
                "INSERT INTO evaluator_response_scores "
                "(response_id, score_link_token, cycle_id, target_id, total_score, mean_score, "
                "section_count, section_scores) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    response_id,
                    submission_token,
                    cycle_id,
                    target_id,
                    score_data["total_score"],
                    score_data["mean_score"],
                    score_data["section_count"],
                    json.dumps(
                        [
                            {
                                "section_id": section["section_id"],
                                "title": section["title"],
                                "score": float(section["score"]),
                            }
                            for section in score_data["section_scores"]
                        ],
                        ensure_ascii=False,
                    ),
                ),
            )
            stage = "answers"
            if individual_answers:
                answer_contributions = [
                    (
                        question_id,
                        answer_value,
                        score_data["question_scores"].get(question_id),
                    )
                    for question_id, answer_value in individual_answers
                ]
                cursor.executemany(
                    "INSERT INTO evaluator_answers "
                    "(submission_token, response_id, cycle_id, target_id, question_id, "
                    "selected_option_id, answer_value, score) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    [
                        (
                            submission_token,
                            response_id,
                            cycle_id,
                            target_id,
                            question_id,
                            answer_value
                            if questions_by_id[question_id]["type"] == "single_choice"
                            else None,
                            json.dumps(answer_value, ensure_ascii=False),
                            question_score,
                        )
                        for question_id, answer_value, question_score in answer_contributions
                    ],
                )
            for question_id, option_key in tallies:
                cursor.execute(
                    "INSERT INTO answer_tallies "
                    "(cycle_id, target_id, question_id, option_key, cnt) "
                    "VALUES (%s, %s, %s, %s, 1) "
                    "ON DUPLICATE KEY UPDATE cnt = cnt + 1",
                    (cycle_id, target_id, question_id, str(option_key)),
                )
            cursor.execute(
                "INSERT INTO response_counts (cycle_id, target_id, total_submissions) "
                "VALUES (%s, %s, 1) ON DUPLICATE KEY UPDATE total_submissions = total_submissions + 1",
                (cycle_id, target_id),
            )
            for question_id, body in comments:
                cursor.execute(
                    "INSERT INTO comments "
                    "(submission_token, cycle_id, target_id, question_id, comment_text) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (submission_token, cycle_id, target_id, question_id, body),
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
