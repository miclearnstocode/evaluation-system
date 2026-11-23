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
        "SELECT tc.id, tc.target_type, tc.campus_id, tc.is_central, "
        "NULL AS office_head_name, tc.name AS target_name, c.name AS campus_name "
        "FROM target_catalog tc LEFT JOIN campuses c ON c.id = tc.campus_id "
        "WHERE tc.id = %s",
        (target_id,),
    )


def _has_evaluator_membership(cursor: Any, user_id: int, target_id: int) -> bool:
    return fetch_one(
        cursor,
        "SELECT 1 FROM user_office_assignments "
        "WHERE user_id = %s AND target_id = %s AND assignment_role = 'member'",
        (user_id, target_id),
    ) is not None


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
            "SELECT tc.id AS target_id, tc.target_type, tc.campus_id, tc.is_central, "
            "NULL AS office_head_name, tc.name AS target_name, c.name AS campus_name "
            "FROM user_office_assignments ua "
            "JOIN target_catalog tc ON tc.id = ua.target_id "
            "LEFT JOIN campuses c ON c.id = tc.campus_id "
            "WHERE ua.user_id = %s AND ua.assignment_role = 'member' "
            "ORDER BY tc.name",
            (user["id"],),
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
                    "SELECT 1 FROM participation p "
                    "WHERE p.user_id = %s AND p.cycle_id = %s AND p.target_id = %s",
                    (user["id"], cycle["cycle_id"], target["target_id"]),
                )
                items.append(
                    {
                        "cycle_id": cycle["cycle_id"],
                        "target_id": target["target_id"],
                        "target_type": target["target_type"],
                        "target_name": target["target_name"],
                        "office_head_name": target["office_head_name"],
                        "campus_name": target["campus_name"],
                        "is_central": target["is_central"],
                        "submitted": previous is not None,
                    }
                )
        if not open_cycles:
            items = [
                {
                    "cycle_id": None,
                    "target_id": target["target_id"],
                    "target_type": target["target_type"],
                    "target_name": target["target_name"],
                    "office_head_name": target["office_head_name"],
                    "campus_name": target["campus_name"],
                    "is_central": target["is_central"],
                    "submitted": False,
                }
                for target in targets
            ]
        cursor.close()
    return jsonify(items=items)


@bp.get("/api/evaluator/submissions")
@require_role("evaluator")
def evaluator_submission():
    cycle_id = _positive_id(request.args.get("cycle_id"), "cycle_id")
    target_id = _positive_id(request.args.get("target_id"), "target_id")
    user = request_user()
    with connection("submit") as conn:
        cursor = conn.cursor(dictionary=True)
        submission = fetch_one(
            cursor,
            "SELECT p.submission_token, c.title AS cycle_name, s.title AS survey_title "
            "FROM participation p "
            "JOIN eval_cycles c ON c.id = p.cycle_id "
            "JOIN surveys s ON s.id = c.survey_id "
            "WHERE p.user_id = %s AND p.cycle_id = %s AND p.target_id = %s",
            (user["id"], cycle_id, target_id),
        )
        if not submission:
            raise ApiError("Evaluation not found.", 404)
        score_record = fetch_one(
            cursor,
            "SELECT total_score, mean_score, section_count, section_scores "
            "FROM evaluator_response_scores "
            "WHERE score_link_token = %s AND cycle_id = %s AND target_id = %s",
            (submission["submission_token"], cycle_id, target_id),
        )
        target = _load_evaluator_target(cursor, target_id)
        if not target:
            raise ApiError("Evaluation not found.", 404)
        scores = None
        if score_record:
            section_scores = score_record["section_scores"]
            if isinstance(section_scores, (str, bytes, bytearray)):
                section_scores = json.loads(section_scores)
            scores = {
                "total_score": float(score_record["total_score"]),
                "mean_score": float(score_record["mean_score"]),
                "section_count": score_record["section_count"],
                "section_scores": [
                    {
                        "section_id": section["section_id"],
                        "title": section["title"],
                        "score": float(section["score"]),
                    }
                    for section in section_scores
                ],
            }
        answers = fetch_all(
            cursor,
            "SELECT ea.question_id, ea.answer_value, q.prompt AS question, "
            "q.question_type AS question_type, q.section_id, sec.title AS section_title, "
            "sec.sort_order AS section_sort_order, q.sort_order AS question_sort_order "
            "FROM evaluator_answers ea "
            "JOIN questions q ON q.id = ea.question_id "
            "JOIN sections sec ON sec.id = q.section_id "
            "WHERE ea.submission_token = %s "
            "ORDER BY sec.sort_order, sec.id, q.sort_order, q.id",
            (submission["submission_token"],),
        )
        choice_question_ids = sorted(
            {
                answer["question_id"]
                for answer in answers
                if answer["question_type"] in {"single_choice", "multi_choice"}
            }
        )
        option_labels = {}
        if choice_question_ids:
            placeholders = ", ".join(["%s"] * len(choice_question_ids))
            options = fetch_all(
                cursor,
                "SELECT id, question_id, option_text FROM question_options "
                f"WHERE question_id IN ({placeholders})",
                tuple(choice_question_ids),
            )
            option_labels = {
                (option["question_id"], option["id"]): option["option_text"]
                for option in options
            }

        sections = []
        sections_by_id = {}
        for answer in answers:
            value = answer["answer_value"]
            if isinstance(value, (str, bytes, bytearray)):
                value = json.loads(value)
            question_type = answer["question_type"]
            question_id = answer["question_id"]
            if question_type == "single_choice":
                value = option_labels.get((question_id, value), str(value))
            elif question_type == "multi_choice":
                value = [
                    option_labels.get((question_id, option_id), str(option_id))
                    for option_id in value
                ]
            elif question_type == "yes_no":
                value = "Yes" if value else "No"

            section = sections_by_id.get(answer["section_id"])
            if section is None:
                section = {
                    "id": answer["section_id"],
                    "title": answer["section_title"],
                    "answers": [],
                }
                sections_by_id[answer["section_id"]] = section
                sections.append(section)
            section["answers"].append(
                {
                    "question_id": question_id,
                    "question": answer["question"],
                    "answer": value,
                }
            )
        cursor.close()
    return jsonify(
        cycle_id=cycle_id,
        cycle_name=submission["cycle_name"],
        target_id=target_id,
        target_name=target["target_name"],
        campus_name=target["campus_name"],
        is_central=target["is_central"],
        survey_title=submission["survey_title"],
        scores=scores,
        sections=sections,
    )


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
        if not _has_evaluator_membership(cursor, user["id"], target_id):
            raise ApiError("You can evaluate only offices/units selected in your membership.", 403)
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
            target = _load_evaluator_target(cursor, target_id)
            if not target:
                raise ApiError("Target not found.", 404)
            if not _has_evaluator_membership(cursor, user["id"], target_id):
                raise ApiError("You can evaluate only offices/units selected in your membership.", 403)
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
    return jsonify(
        status="submitted",
        total_score=float(score_data["total_score"]),
        mean_score=float(score_data["mean_score"]),
        section_scores=[
            {
                "section_id": section["section_id"],
                "title": section["title"],
                "score": float(section["score"]),
            }
            for section in score_data["section_scores"]
        ],
        question_scores={
            str(question_id): float(score) if score is not None else None
            for question_id, score in score_data["question_scores"].items()
        },
    ), 201
