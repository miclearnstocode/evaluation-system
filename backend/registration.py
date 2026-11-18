from __future__ import annotations

def derive_evaluator_group(position_role: str, office_categories: list[str]) -> str:
    if position_role == "teaching_faculty":
        return "faculty"
    if position_role == "student_leader":
        return "student_leader"
    if position_role == "non_teaching_staff" and office_categories:
        campus_types = {"campus_administrator", "satellite_college_director"}
        return "campus_staff" if all(category in campus_types for category in office_categories) else "office_staff"
    raise ValueError("Position/Role and Office/Unit must be a valid combination.")
