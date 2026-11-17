from __future__ import annotations

from typing import Any

from database import fetch_one


def derive_evaluator_group(position_role: str, office_categories: list[str]) -> str:
    if position_role == "teaching_faculty":
        return "faculty"
    if position_role == "student_leader":
        return "student_leader"
    if position_role == "non_teaching_staff" and office_categories:
        return "campus_staff" if all(category == "campus_head" for category in office_categories) else "office_staff"
    raise ValueError("Position/Role and Office/Unit must be a valid combination.")


def unit_category(cursor: Any, unit_code: str | None) -> str | None:
    if not unit_code:
        return None
    unit = fetch_one(
        cursor,
        "SELECT category FROM registration_units WHERE code = %s AND active = 1",
        (unit_code,),
    )
    return unit["category"] if unit else None
