from __future__ import annotations

from typing import Any

if __package__:
    from .database import fetch_all, fetch_one
else:
    from database import fetch_all, fetch_one


def rule_matches(rule: dict[str, Any], user: dict[str, Any], target: dict[str, Any]) -> bool:
    checks = (
        (rule.get("evaluator_is_central"), bool(user.get("is_central_staff"))),
        (
            rule.get("require_target_central", rule.get("target_is_central")),
            bool(target.get("is_central")),
        ),
        (
            rule.get("require_same_campus", rule.get("same_campus")),
            user.get("campus_id") == target.get("campus_id"),
        ),
    )
    return all(expected is None or expected == actual for expected, actual in checks)


def is_eligible(user: dict[str, Any], target: dict[str, Any], rules: list[dict[str, Any]]) -> bool:
    matching = [rule for rule in rules if rule_matches(rule, user, target)]
    return any(rule.get("action", rule.get("effect")) == "allow" for rule in matching) and not any(
        rule.get("action", rule.get("effect")) == "deny" for rule in matching
    )


def _load_rules(cursor: Any, cycle_id: int) -> list[dict[str, Any]]:
    return fetch_all(
        cursor,
        "SELECT evaluator_is_central, require_target_central, "
        "require_same_campus, action FROM eligibility_rules WHERE cycle_id = %s",
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
    if not user.get("id") or not target.get("id"):
        return True
    assignment = fetch_one(
        cursor,
        "SELECT id FROM user_office_assignments WHERE user_id = %s AND target_id = %s",
        (user["id"], target["id"]),
    )
    return assignment is None


def _load_cycle_target(cursor: Any, cycle_id: int, target_id: int) -> dict[str, Any] | None:
    return fetch_one(
        cursor,
        "SELECT t.id, t.target_type, tc.campus_id, t.is_central, tc.name AS target_name, "
        "c.name AS campus_name "
        "FROM cycle_targets ct JOIN targets t ON t.id = ct.target_id "
        "JOIN target_catalog tc ON tc.id = t.id "
        "LEFT JOIN campuses c ON c.id = tc.campus_id "
        "WHERE ct.cycle_id = %s AND t.id = %s AND t.active = 1 "
        "AND (tc.campus_id IS NULL OR c.active = 1)",
        (cycle_id, target_id),
    )
