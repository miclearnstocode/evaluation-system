from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any


_CENT = Decimal("0.01")


def _rounded(value: Decimal) -> Decimal:
    return value.quantize(_CENT, rounding=ROUND_HALF_UP)


def calculate_response_scores(
    sections: list[dict[str, Any]],
    individual_answers: list[tuple[int, Any]],
) -> dict[str, Any]:
    answers_by_question = dict(individual_answers)
    question_scores: dict[int, Decimal | None] = {}
    section_scores = []

    for section in sections:
        section_total = Decimal("0")
        for question in section["questions"]:
            question_id = question["id"]
            if question_id not in answers_by_question:
                continue
            answer = answers_by_question[question_id]
            question_type = question["type"]
            if question_type == "text":
                question_scores[question_id] = None
                continue

            if question_type in {"scale", "rating", "yes_no"}:
                score = Decimal(str(answer)) * Decimal(str(question.get("score_weight", 1)))
            else:
                points_by_option = {
                    option["id"]: Decimal(str(option.get("points", 1)))
                    for option in question["options"]
                }
                if question_type == "single_choice":
                    score = points_by_option[answer]
                else:
                    score = sum(
                        (points_by_option[option_id] for option_id in answer),
                        Decimal("0"),
                    )

            score = _rounded(score)
            question_scores[question_id] = score
            section_total += score

        section_scores.append(
            {
                "section_id": section["id"],
                "title": section["title"],
                "score": _rounded(section_total),
            }
        )

    total_score = _rounded(sum((item["score"] for item in section_scores), Decimal("0")))
    section_count = len(section_scores)
    mean_score = (
        _rounded(total_score / Decimal(section_count))
        if section_count
        else Decimal("0.00")
    )
    return {
        "question_scores": question_scores,
        "section_scores": section_scores,
        "total_score": total_score,
        "mean_score": mean_score,
        "section_count": section_count,
    }
