from __future__ import annotations

import logging
import os
import re
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Iterator
import mysql.connector
from dotenv import load_dotenv
from flask import Flask, current_app, jsonify, request, session
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

if __package__:
    from .database import connect as _connect, connection, fetch_all, fetch_one
    from .eligibility import (
        _cycle_user_eligible,
        _load_cycle_target,
        _load_rules,
        _registration_policy_allows,
        is_eligible,
        rule_matches,
    )
else:
    from database import connect as _connect, connection, fetch_all, fetch_one
    from eligibility import (
        _cycle_user_eligible,
        _load_cycle_target,
        _load_rules,
        _registration_policy_allows,
        is_eligible,
        rule_matches,
    )

env_file = ".env.production" if os.getenv("APP_ENV") == "production" else ".env"
load_dotenv(Path(__file__).with_name(env_file))

QUESTION_TYPES = {"scale", "rating", "single_choice", "multi_choice", "yes_no", "text"}
IDENTIFYING_QUESTION = re.compile(
    r"\b(name|e-?mail|student\s*id|identification\s*(number|no\.?)?|"
    r"id\s*number|date\s*of\s*birth|birthdate|birthday|upload|file\s*attachment)\b",
    re.IGNORECASE,
)
CAPSU_EMAIL = re.compile(r"^[^@\s]+@capsu\.edu\.ph$", re.IGNORECASE)


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


class SuppressSubmissionAccessLog(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "/api/evaluator/submit" not in record.getMessage()


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_questions(
    questions: list[dict[str, Any]],
    answers: Any,
) -> tuple[list[tuple[int, int]], list[tuple[int, str]], list[tuple[int, Any]]]:
    if not isinstance(answers, dict):
        raise ApiError("Answers must be an object keyed by question ID.")

    question_ids = {str(question["id"]) for question in questions}
    if any(str(key) not in question_ids for key in answers):
        raise ApiError("The submission contains an unknown question.")

    tallies: list[tuple[int, int]] = []
    comments: list[tuple[int, str]] = []
    individual_answers: list[tuple[int, Any]] = []

    for question in questions:
        question_id = int(question["id"])
        question_type = question["type"]
        raw_value = answers.get(str(question_id), answers.get(question_id))
        options = {int(option["id"]) for option in question.get("options", [])}

        if question_type == "text":
            if raw_value is None or raw_value == "":
                if question["required"]:
                    raise ApiError("A required comment is missing.")
                continue
            if not isinstance(raw_value, str) or len(raw_value.strip()) > 5000:
                raise ApiError("Comments must be text of at most 5,000 characters.")
            if raw_value.strip():
                comments.append((question_id, raw_value.strip()))
                individual_answers.append((question_id, raw_value.strip()))
            elif question["required"]:
                raise ApiError("A required comment is missing.")
            continue

        if raw_value is None or raw_value == "":
            if question["required"]:
                raise ApiError("A required answer is missing.")
            continue

        if question_type in {"scale", "rating"}:
            if not _is_int(raw_value):
                raise ApiError("Scale answers must be whole numbers.")
            minimum = int(question.get("scale_min") or 1)
            maximum = int(question.get("scale_max") or 5)
            if not minimum <= raw_value <= maximum:
                raise ApiError("A scale answer is outside the allowed range.")
            tallies.append((question_id, raw_value))
            individual_answers.append((question_id, raw_value))
        elif question_type == "yes_no":
            if not isinstance(raw_value, bool) and (not _is_int(raw_value) or raw_value not in (0, 1)):
                raise ApiError("Yes-or-no answers must be true or false.")
            normalized_value = int(raw_value)
            tallies.append((question_id, normalized_value))
            individual_answers.append((question_id, normalized_value))
        elif question_type == "single_choice":
            if not _is_int(raw_value) or raw_value not in options:
                raise ApiError("Choose a valid option.")
            tallies.append((question_id, raw_value))
            individual_answers.append((question_id, raw_value))
        elif question_type == "multi_choice":
            if (
                not isinstance(raw_value, list)
                or any(not _is_int(value) for value in raw_value)
                or len(set(raw_value)) != len(raw_value)
                or any(value not in options for value in raw_value)
            ):
                raise ApiError("Choose valid, non-duplicate options.")
            if question["required"] and not raw_value:
                raise ApiError("A required answer is missing.")
            tallies.extend((question_id, value) for value in raw_value)
            if raw_value:
                individual_answers.append((question_id, raw_value))
        else:
            raise ApiError("This survey contains an unsupported question type.", 500)

    return tallies, comments, individual_answers


def validate_survey_payload(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list) or not payload:
        raise ApiError("A survey must contain at least one section.")
    normalized: list[dict[str, Any]] = []
    for section in payload:
        if not isinstance(section, dict):
            raise ApiError("Each section must be an object.")
        title = str(section.get("title", "")).strip()
        questions = section.get("questions")
        if not title or len(title) > 200 or not isinstance(questions, list):
            raise ApiError("Each section needs a title and a question list.")
        clean_questions = []
        for item in questions:
            if not isinstance(item, dict):
                raise ApiError("Each question must be an object.")
            text = str(item.get("text", "")).strip()
            question_type = item.get("type")
            if not text or len(text) > 500 or question_type not in QUESTION_TYPES:
                raise ApiError("Each question needs valid text and a supported type.")
            if IDENTIFYING_QUESTION.search(text):
                raise ApiError("Surveys cannot ask for identifying information.")
            options = item.get("options", [])
            score_weight = _score_config_value(item.get("score_weight", 1), "Question weight")
            if question_type in {"single_choice", "multi_choice"}:
                if not isinstance(options, list) or not options:
                    raise ApiError("Choice questions need distinct, non-empty options.")
                clean_options = []
                option_labels = set()
                for option in options:
                    option_id = None
                    if isinstance(option, str):
                        label, points = option, 1
                    elif isinstance(option, dict) and isinstance(option.get("label"), str):
                        label, points = option["label"], option.get("points", 1)
                        option_id = option.get("id")
                    else:
                        raise ApiError("Choice questions need distinct, non-empty options.")
                    label = label.strip()
                    if not label or len(label) > 200 or label in option_labels:
                        raise ApiError("Choice questions need distinct, non-empty options.")
                    option_labels.add(label)
                    clean_options.append(
                        {
                            "id": option_id if isinstance(option_id, int) and option_id > 0 else None,
                            "label": label,
                            "points": _score_config_value(points, "Choice points"),
                        }
                    )
                options = clean_options
            else:
                options = []
            minimum = item.get("scale_min", 1)
            maximum = item.get("scale_max", 5)
            if question_type in {"scale", "rating"} and (
                not _is_int(minimum) or not _is_int(maximum) or minimum >= maximum
            ):
                raise ApiError("Scale questions need a valid minimum and maximum.")
            clean_questions.append(
                {
                    "id": item.get("id") if isinstance(item.get("id"), int) and item["id"] > 0 else None,
                    "text": text,
                    "type": question_type,
                    "required": bool(item.get("required", False)),
                    "options": options,
                    "score_weight": score_weight,
                    "scale_min": minimum if question_type in {"scale", "rating"} else None,
                    "scale_max": maximum if question_type in {"scale", "rating"} else None,
                    "min_label": item.get("min_label"),
                    "max_label": item.get("max_label"),
                }
            )
        normalized.append({
            "id": section.get("id") if isinstance(section.get("id"), int) and section["id"] > 0 else None,
            "title": title,
            "questions": clean_questions,
        })
    if not any(section["questions"] for section in normalized):
        raise ApiError("A survey must contain at least one question.")
    return normalized


def _score_config_value(value: Any, field: str) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ApiError(f"{field} must be a non-negative number with at most two decimal places.")
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        raise ApiError(f"{field} must be a non-negative number with at most two decimal places.") from None
    if not number.is_finite() or number < 0 or number > Decimal("10000"):
        raise ApiError(f"{field} must be between 0 and 10000.")
    try:
        rounded = number.quantize(Decimal("0.01"))
    except InvalidOperation:
        raise ApiError(f"{field} must be a non-negative number with at most two decimal places.") from None
    if rounded != number:
        raise ApiError(f"{field} must have at most two decimal places.")
    return rounded


def _current_user() -> dict[str, Any] | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    with connection("admin") as conn:
        cursor = conn.cursor(dictionary=True)
        user = fetch_one(
            cursor,
            "SELECT id, email, role, campus_id, position_role, is_central_staff, active "
            "FROM users WHERE id = %s",
            (user_id,),
        )
        cursor.close()
    if not user or not user["active"]:
        session.clear()
        return None
    return user


def require_role(role: str | None = None):
    def decorator(handler):
        @wraps(handler)
        def wrapped(*args, **kwargs):
            user = _current_user()
            if user is None:
                raise ApiError("Sign in is required.", 401)
            if role and user["role"] != role:
                raise ApiError("You do not have permission to access this resource.", 403)
            request.environ["evaluation.user"] = user
            return handler(*args, **kwargs)

        return wrapped

    return decorator


def request_user() -> dict[str, Any]:
    user = request.environ.get("evaluation.user")
    if not user:
        raise ApiError("Sign in is required.", 401)
    return user


def _json_body() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError("A JSON object is required.")
    return payload


def _positive_id(value: Any, field: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(f"{field} must be a positive integer.") from None
    if number <= 0:
        raise ApiError(f"{field} must be a positive integer.")
    return number


def _bool_value(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        raise ApiError(f"{field} must be true or false.")
    return value


def _cycle_is_open(cycle: dict[str, Any]) -> bool:
    now = _utcnow_naive()
    return cycle["status"] == "open" and cycle["opens_at"] <= now < cycle["closes_at"]


def _cycle_is_closed(cycle: dict[str, Any]) -> bool:
    return cycle["status"] == "closed" and cycle["closes_at"] <= _utcnow_naive()


def _load_survey(
    cursor: Any,
    survey_id: int,
    include_scoring: bool = False,
) -> dict[str, Any]:
    survey = fetch_one(cursor, "SELECT id, title, description, status FROM surveys WHERE id = %s", (survey_id,))
    if not survey:
        raise ApiError("Survey not found.", 404)
    sections = fetch_all(
        cursor,
        "SELECT s.id, s.title, s.sort_order FROM sections s "
        "WHERE s.survey_id = %s AND EXISTS ("
        "SELECT 1 FROM questions q WHERE q.section_id = s.id AND q.is_archived = 0"
        ") ORDER BY s.sort_order, s.id",
        (survey_id,),
    )
    for section in sections:
        score_column = ", weight AS score_weight" if include_scoring else ""
        questions = fetch_all(
            cursor,
            "SELECT id, question_type AS type, prompt AS question_text, is_required AS required, "
            "sort_order, scale_min, scale_max, min_label, max_label"
            f"{score_column} "
            "FROM questions WHERE section_id = %s AND is_archived = 0 ORDER BY sort_order, id",
            (section["id"],),
        )
        for question in questions:
            question["required"] = bool(question["required"])
            points_column = ", points" if include_scoring else ""
            question["options"] = fetch_all(
                cursor,
                "SELECT id, option_text AS label, option_key, sort_order"
                f"{points_column} FROM question_options WHERE question_id = %s ORDER BY sort_order, id",
                (question["id"],),
            )
        section["questions"] = questions
    survey["sections"] = sections
    return survey


def _insert_survey_content(cursor: Any, survey_id: int, sections: list[dict[str, Any]]) -> None:
    for section_order, section in enumerate(sections):
        cursor.execute(
            "INSERT INTO sections (survey_id, title, sort_order) VALUES (%s, %s, %s)",
            (survey_id, section["title"], section_order),
        )
        section_id = cursor.lastrowid
        for question_order, question in enumerate(section["questions"]):
            cursor.execute(
                "INSERT INTO questions "
                "(survey_id, section_id, question_type, prompt, is_required, sort_order, scale_min, scale_max, "
                "weight, min_label, max_label) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    survey_id,
                    section_id,
                    question["type"],
                    question["text"],
                    question["required"],
                    question_order,
                    question["scale_min"],
                    question["scale_max"],
                    question["score_weight"],
                    question["min_label"],
                    question["max_label"],
                ),
            )
            question_id = cursor.lastrowid
            for option_order, option in enumerate(question["options"]):
                cursor.execute(
                    "INSERT INTO question_options "
                    "(question_id, option_key, option_text, sort_order, points) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (question_id, str(option_order + 1), option["label"], option_order, option["points"]),
                )


def _update_survey_content(cursor: Any, survey_id: int, sections: list[dict[str, Any]]) -> None:
    kept_question_ids: set[int] = set()

    for section_order, section in enumerate(sections):
        section_id = section.get("id")
        if section_id:
            existing_section = fetch_one(
                cursor,
                "SELECT id FROM sections WHERE id = %s AND survey_id = %s",
                (section_id, survey_id),
            )
        else:
            existing_section = None

        if existing_section:
            section_id = existing_section["id"]
            cursor.execute(
                "UPDATE sections SET title = %s, sort_order = %s WHERE id = %s",
                (section["title"], section_order, section_id),
            )
        else:
            cursor.execute(
                "INSERT INTO sections (survey_id, title, sort_order) VALUES (%s, %s, %s)",
                (survey_id, section["title"], section_order),
            )
            section_id = cursor.lastrowid

        for question_order, question in enumerate(section["questions"]):
            question_id = question.get("id")
            if question_id:
                existing_question = fetch_one(
                    cursor,
                    "SELECT id FROM questions WHERE id = %s AND survey_id = %s",
                    (question_id, survey_id),
                )
            else:
                existing_question = None

            if existing_question:
                question_id = existing_question["id"]
                cursor.execute(
                    "UPDATE questions SET section_id = %s, question_type = %s, prompt = %s, "
                    "is_required = %s, sort_order = %s, scale_min = %s, scale_max = %s, "
                    "weight = %s, min_label = %s, max_label = %s, is_archived = 0 "
                    "WHERE id = %s",
                    (
                        section_id,
                        question["type"],
                        question["text"],
                        question["required"],
                        question_order,
                        question["scale_min"],
                        question["scale_max"],
                        question["score_weight"],
                        question["min_label"],
                        question["max_label"],
                        question_id,
                    ),
                )
            else:
                cursor.execute(
                    "INSERT INTO questions "
                    "(survey_id, section_id, question_type, prompt, is_required, sort_order, scale_min, scale_max, "
                    "weight, min_label, max_label) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        survey_id,
                        section_id,
                        question["type"],
                        question["text"],
                        question["required"],
                        question_order,
                        question["scale_min"],
                        question["scale_max"],
                        question["score_weight"],
                        question["min_label"],
                        question["max_label"],
                    ),
                )
                question_id = cursor.lastrowid

            kept_question_ids.add(question_id)

            existing_options = fetch_all(
                cursor,
                "SELECT id FROM question_options WHERE question_id = %s",
                (question_id,),
            )
            existing_option_ids = {option["id"] for option in existing_options}
            kept_option_ids: set[int] = set()

            for option_order, option in enumerate(question["options"]):
                option_id = option.get("id")
                if option_id in existing_option_ids:
                    cursor.execute(
                        "UPDATE question_options SET option_key = %s, option_text = %s, "
                        "sort_order = %s, points = %s WHERE id = %s",
                        (
                            str(option_order + 1),
                            option["label"],
                            option_order,
                            option["points"],
                            option_id,
                        ),
                    )
                    kept_option_ids.add(option_id)
                else:
                    cursor.execute(
                        "INSERT INTO question_options "
                        "(question_id, option_key, option_text, sort_order, points) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        (
                            question_id,
                            str(option_order + 1),
                            option["label"],
                            option_order,
                            option["points"],
                        ),
                    )

            removed_option_ids = existing_option_ids - kept_option_ids
            for option_id in removed_option_ids:
                cursor.execute("DELETE FROM question_options WHERE id = %s", (option_id,))

    cursor.execute(
        "UPDATE questions SET is_archived = 1 "
        "WHERE survey_id = %s AND is_archived = 0"
        + ("" if not kept_question_ids else " AND id NOT IN (" + ",".join(["%s"] * len(kept_question_ids)) + ")"),
        (survey_id, *kept_question_ids) if kept_question_ids else (survey_id,),
    )


def _audit(cursor: Any, user: dict[str, Any], action: str, entity: str, entity_id: Any = None) -> None:
    cursor.execute(
        "INSERT INTO admin_audit_log (admin_id, action, entity, entity_id, created_at) "
        "VALUES (%s, %s, %s, %s, %s)",
        (user["id"], action, entity, str(entity_id) if entity_id is not None else None, _utcnow_naive()),
    )


def _insert_default_rules(cursor: Any, cycle_id: int, allow_same_campus: bool) -> None:
    cursor.executemany(
        "INSERT INTO eligibility_rules "
        "(cycle_id, evaluator_is_central, require_target_central, require_same_campus, action) "
        "VALUES (%s, %s, %s, %s, %s)",
        [(cycle_id, None, None, None, "allow")],
    )


def _insert_all_cycle_targets(cursor: Any, cycle_id: int) -> int:
    cursor.execute(
        "INSERT INTO cycle_targets (cycle_id, target_id) "
        "SELECT %s, t.id FROM targets t "
        "LEFT JOIN campuses c ON c.id = t.campus_id "
        "WHERE t.active = 1 AND (t.campus_id IS NULL OR c.active = 1)",
        (cycle_id,),
    )
    if cursor.rowcount == 0:
        raise ApiError("Add at least one active evaluation target before creating a cycle.")
    return cursor.rowcount


def _date_value(value: Any, field: str) -> datetime:
    if not isinstance(value, str):
        raise ApiError(f"{field} is required.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ApiError(f"{field} must be a valid ISO date/time.") from None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed

__all__ = ['logging', 'os', 're', 'uuid', 'contextmanager', 'datetime', 'timedelta', 'timezone', 'wraps', 'Path', 'Any', 'Callable', 'Iterator', 'mysql', 'load_dotenv', 'Flask', 'current_app', 'jsonify', 'request', 'session', 'HTTPException', 'check_password_hash', 'generate_password_hash', 'QUESTION_TYPES', 'IDENTIFYING_QUESTION', 'CAPSU_EMAIL', 'ApiError', 'SuppressSubmissionAccessLog', '_utcnow_naive', '_is_int', 'validate_questions', 'rule_matches', 'is_eligible', 'validate_survey_payload', '_connect', 'connection', 'fetch_one', 'fetch_all', '_current_user', 'require_role', 'request_user', '_json_body', '_positive_id', '_bool_value', '_cycle_is_open', '_cycle_is_closed', '_load_rules', '_cycle_user_eligible', '_registration_policy_allows', '_load_cycle_target', '_load_survey', '_insert_survey_content', '_update_survey_content', '_audit', '_insert_default_rules', '_insert_all_cycle_targets', '_date_value']
