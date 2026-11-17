from __future__ import annotations

import logging
import os
import re
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Iterator
import mysql.connector
from dotenv import load_dotenv
from flask import Flask, current_app, jsonify, request, session
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from registration import derive_evaluator_group
from database import connect as _connect, connection, fetch_all, fetch_one
from eligibility import (
    _cycle_user_eligible,
    _load_cycle_target,
    _load_rules,
    _registration_policy_allows,
    is_eligible,
    rule_matches,
)

load_dotenv(Path(__file__).with_name(".env"))

QUESTION_TYPES = {"scale", "rating", "single_choice", "multi_choice", "yes_no", "text"}
EVALUATOR_GROUPS = {"faculty", "student_leader", "campus_staff", "office_staff"}
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


def validate_questions(questions: list[dict[str, Any]], answers: Any) -> tuple[list[tuple[int, int]], list[tuple[int, str]]]:
    if not isinstance(answers, dict):
        raise ApiError("Answers must be an object keyed by question ID.")

    question_ids = {str(question["id"]) for question in questions}
    if any(str(key) not in question_ids for key in answers):
        raise ApiError("The submission contains an unknown question.")

    tallies: list[tuple[int, int]] = []
    comments: list[tuple[int, str]] = []

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
        elif question_type == "yes_no":
            if not isinstance(raw_value, bool) and (not _is_int(raw_value) or raw_value not in (0, 1)):
                raise ApiError("Yes-or-no answers must be true or false.")
            tallies.append((question_id, int(raw_value)))
        elif question_type == "single_choice":
            if not _is_int(raw_value) or raw_value not in options:
                raise ApiError("Choose a valid option.")
            tallies.append((question_id, raw_value))
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
        else:
            raise ApiError("This survey contains an unsupported question type.", 500)

    return tallies, comments


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
            if question_type in {"single_choice", "multi_choice"}:
                if (
                    not isinstance(options, list)
                    or not options
                    or any(not isinstance(option, str) or not option.strip() or len(option) > 200 for option in options)
                    or len({option.strip() for option in options}) != len(options)
                ):
                    raise ApiError("Choice questions need distinct, non-empty options.")
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
                    "text": text,
                    "type": question_type,
                    "required": bool(item.get("required", False)),
                    "options": [option.strip() for option in options],
                    "scale_min": minimum if question_type in {"scale", "rating"} else None,
                    "scale_max": maximum if question_type in {"scale", "rating"} else None,
                    "min_label": item.get("min_label"),
                    "max_label": item.get("max_label"),
                }
            )
        normalized.append({"title": title, "questions": clean_questions})
    if not any(section["questions"] for section in normalized):
        raise ApiError("A survey must contain at least one question.")
    return normalized


def _current_user() -> dict[str, Any] | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    with connection("admin") as conn:
        cursor = conn.cursor(dictionary=True)
        user = fetch_one(
            cursor,
            "SELECT id, email, role, campus_id, evaluator_group, position_role, office_unit_code, "
            "is_central_staff, active "
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


def _load_survey(cursor: Any, survey_id: int) -> dict[str, Any]:
    survey = fetch_one(cursor, "SELECT id, title, description, status FROM surveys WHERE id = %s", (survey_id,))
    if not survey:
        raise ApiError("Survey not found.", 404)
    sections = fetch_all(cursor, "SELECT id, title, sort_order FROM sections WHERE survey_id = %s ORDER BY sort_order, id", (survey_id,))
    for section in sections:
        questions = fetch_all(
            cursor,
            "SELECT id, type, question_text, required, sort_order, scale_min, scale_max, min_label, max_label "
            "FROM questions WHERE section_id = %s AND archived = 0 ORDER BY sort_order, id",
            (section["id"],),
        )
        for question in questions:
            question["options"] = fetch_all(
                cursor,
                "SELECT id, label, sort_order FROM question_options WHERE question_id = %s ORDER BY sort_order, id",
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
                "(survey_id, section_id, type, question_text, required, sort_order, scale_min, scale_max, min_label, max_label) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    survey_id,
                    section_id,
                    question["type"],
                    question["text"],
                    question["required"],
                    question_order,
                    question["scale_min"],
                    question["scale_max"],
                    question["min_label"],
                    question["max_label"],
                ),
            )
            question_id = cursor.lastrowid
            for option_order, label in enumerate(question["options"]):
                cursor.execute(
                    "INSERT INTO question_options (question_id, label, sort_order) VALUES (%s, %s, %s)",
                    (question_id, label, option_order),
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
        "(cycle_id, evaluator_is_central, evaluator_group, target_is_central, same_campus, effect) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        [(cycle_id, None, None, None, None, "allow")],
    )


def _insert_all_cycle_targets(cursor: Any, cycle_id: int) -> int:
    cursor.execute(
        "INSERT INTO cycle_targets (cycle_id, target_id) "
        "SELECT %s, t.id FROM targets t "
        "JOIN campuses c ON c.id = t.campus_id AND c.active = 1 "
        "LEFT JOIN offices o ON o.id = t.office_id "
        "LEFT JOIN administrators a ON a.id = t.administrator_id "
        "WHERE (t.target_type = 'office' AND o.active = 1 OR "
        "t.target_type = 'administrator' AND a.active = 1)",
        (cycle_id,),
    )
    if cursor.rowcount == 0:
        raise ApiError("Add at least one active office or administrator target before creating a cycle.")
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

__all__ = ['logging', 'os', 're', 'uuid', 'contextmanager', 'datetime', 'timedelta', 'timezone', 'wraps', 'Path', 'Any', 'Callable', 'Iterator', 'mysql', 'load_dotenv', 'Flask', 'current_app', 'jsonify', 'request', 'session', 'HTTPException', 'check_password_hash', 'generate_password_hash', 'derive_evaluator_group', 'QUESTION_TYPES', 'EVALUATOR_GROUPS', 'IDENTIFYING_QUESTION', 'CAPSU_EMAIL', 'ApiError', 'SuppressSubmissionAccessLog', '_utcnow_naive', '_is_int', 'validate_questions', 'rule_matches', 'is_eligible', 'validate_survey_payload', '_connect', 'connection', 'fetch_one', 'fetch_all', '_current_user', 'require_role', 'request_user', '_json_body', '_positive_id', '_bool_value', '_cycle_is_open', '_cycle_is_closed', '_load_rules', '_cycle_user_eligible', '_registration_policy_allows', '_load_cycle_target', '_load_survey', '_insert_survey_content', '_audit', '_insert_default_rules', '_insert_all_cycle_targets', '_date_value']
