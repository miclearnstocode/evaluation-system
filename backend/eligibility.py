from __future__ import annotations

from typing import Any

from database import fetch_all, fetch_one
from registration import unit_category


def rule_matches(rule: dict[str, Any], user: dict[str, Any], target: dict[str, Any]) -> bool:
    checks = (
        ("evaluator_is_central", bool(user.get("is_central_staff"))),
        ("evaluator_group", user.get("evaluator_group")),
        ("target_is_central", bool(target.get("is_central"))),
        ("same_campus", user.get("campus_id") == target.get("campus_id")),
    )
    return all(rule.get(field) is None or rule[field] == actual for field, actual in checks)


def is_eligible(user: dict[str, Any], target: dict[str, Any], rules: list[dict[str, Any]]) -> bool:
    matching = [rule for rule in rules if rule_matches(rule, user, target)]
    return any(rule["effect"] == "allow" for rule in matching) and not any(
        rule["effect"] == "deny" for rule in matching
    )


def _load_rules(cursor: Any, cycle_id: int) -> list[dict[str, Any]]:
    return fetch_all(
        cursor,
        "SELECT evaluator_is_central, evaluator_group, target_is_central, same_campus, effect "
        "FROM eligibility_rules WHERE cycle_id = %s",
        (cycle_id,),
    )


def _cycle_user_eligible(
    cursor: Any,
    cycle_id: int,
    user: dict[str, Any],
    target: dict[str, Any],
    rules: list[dict[str, Any]] | None = None,
) -> bool:
    return is_eligible(user, target, rules if rules is not None else _load_rules(cursor, cycle_id)) and (
        _registration_policy_allows(cursor, user, target)
    )


def _registration_policy_allows(cursor: Any, user: dict[str, Any], target: dict[str, Any]) -> bool:
    group = user.get("evaluator_group")
    target_office_id = target.get("target_office_id")
    target_unit = target.get("office_unit_code")
    if not group or not target_office_id or not target_unit:
        return False

    office_unit_code = user.get("office_unit_code")
    base_office = (
        fetch_one(cursor, "SELECT id, unit_code FROM offices WHERE unit_code = %s", (office_unit_code,))
        if office_unit_code
        else None
    )
    memberships = fetch_all(
        cursor,
        "SELECT o.id AS office_id, o.unit_code FROM office_memberships om "
        "JOIN offices o ON o.id = om.office_id "
        "WHERE om.user_id = %s AND o.active = 1",
        (user["id"],),
    )
    head = fetch_one(
        cursor,
        "SELECT hc.office_id, hc.administrator_id, hc.reports_to_vp_office_id, o.unit_code "
        "FROM office_head_claims hc JOIN offices o ON o.id = hc.office_id WHERE hc.user_id = %s",
        (user["id"],),
    )
    member_offices = {
        (row["office_id"], row["unit_code"])
        for row in memberships
        if row["unit_code"]
    }
    own_offices = set(member_offices)
    if base_office:
        own_offices.add((base_office["id"], base_office["unit_code"]))
    if head:
        own_offices.add((head["office_id"], head["unit_code"]))

    office_access = member_offices if group == "office_staff" else own_offices
    target_office = (target_office_id, target_unit)
    target_administrator_id = target.get("target_administrator_id")
    if target["target_type"] == "office" and target_office in office_access:
        return not head or target_office != (head["office_id"], head["unit_code"])
    if head and target_administrator_id == head["administrator_id"]:
        return False
    if target_administrator_id:
        supervisor = fetch_one(
            cursor,
            "SELECT hc.administrator_id FROM supervisor_claims sc "
            "JOIN office_head_claims hc ON hc.user_id = sc.head_user_id "
            "WHERE sc.supervisor_user_id = %s",
            (user["id"],),
        )
        if supervisor and supervisor["administrator_id"] == target_administrator_id:
            return True
    if target_office in member_offices:
        return True

    if group == "office_staff":
        return False

    target_category = unit_category(cursor, target_unit)
    if target_category == "vp":
        if group == "student_leader":
            return True
        if head and unit_category(cursor, head["unit_code"]) == "campus_head":
            return True
        if head and head["reports_to_vp_office_id"] == target_office_id:
            return True
        return False

    if target_category == "campus_head":
        if group in {"faculty", "student_leader"} and user.get("campus_id") == target.get("campus_id"):
            return True
        return group == "campus_staff" and target_office in own_offices

    if target_category == "director":
        if group == "faculty" and target_unit == "RESEARCH_OFFICE":
            return True
        if group == "office_staff" and target_office in own_offices:
            return True
    return False


def _load_cycle_target(cursor: Any, cycle_id: int, target_id: int) -> dict[str, Any] | None:
    return fetch_one(
        cursor,
        "SELECT t.id, t.target_type, t.campus_id, t.is_central, "
        "COALESCE(t.office_id, a.office_id) AS target_office_id, "
        "t.administrator_id AS target_administrator_id, "
        "o.unit_code AS office_unit_code, "
        "CASE WHEN t.target_type = 'office' THEN o.name "
        "ELSE CONCAT(c.name, ' — ', o.name, ' (', a.name, ')') END AS target_name "
        "FROM cycle_targets ct JOIN targets t ON t.id = ct.target_id "
        "LEFT JOIN administrators a ON a.id = t.administrator_id "
        "LEFT JOIN offices o ON o.id = COALESCE(t.office_id, a.office_id) "
        "JOIN campuses c ON c.id = t.campus_id AND c.active = 1 "
        "WHERE ct.cycle_id = %s AND t.id = %s "
        "AND (t.target_type = 'office' AND o.active = 1 OR "
        "t.target_type = 'administrator' AND a.active = 1)",
        (cycle_id, target_id),
    )
