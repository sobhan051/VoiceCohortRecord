"""Form sequence gating: "fully complete" means every applicable required
question has an answer in the user's latest submission for that form.

- Optional questions (is_required=false) never block completion.
- "N/A" counts as answered (it is a stored logical answer).
- Sections whose depends_on/skip_if rule is unmet are excluded, and question
  visibility_rules are evaluated with the shared visibility evaluator.
- Half-way submissions count: status is irrelevant, the answers are.
"""
from sqlalchemy import and_, desc

from app import models
from app.services.visibility import is_applicable


def _section_applicable(section, answers):
    """Section-level depends_on / skip_if rules against the answer set."""
    if section.depends_on_vcode:
        val = str(answers.get(section.depends_on_vcode, "") or "").strip()
        if val != str(section.depends_on_value).strip():
            return False
    if section.skip_if_vcode:
        val = str(answers.get(section.skip_if_vcode, "") or "").strip()
        if val == str(section.skip_if_value).strip():
            return False
    return True


def get_form_completion(db, user_id: int, form_id: int):
    """How complete is this user's latest submission for the form.

    Returns {required_total, answered, fully_completed, has_submission}.
    """
    submission = (
        db.query(models.Submission)
        .filter(
            models.Submission.user_id == user_id,
            models.Submission.form_id == form_id,
        )
        .order_by(desc(models.Submission.created_at), desc(models.Submission.submission_id))
        .first()
    )

    sections = (
        db.query(models.Section)
        .filter(models.Section.form_id == form_id)
        .order_by(models.Section.sort_order)
        .all()
    )
    questions = (
        db.query(models.Question)
        .join(models.Section, models.Question.section_id == models.Section.section_id)
        .filter(models.Section.form_id == form_id)
        .filter(models.Question.is_required.is_(True))
        .order_by(models.Question.sort_order)
        .all()
    )

    if not questions:
        return {"required_total": 0, "answered": 0, "fully_completed": True, "has_submission": submission is not None}

    answers = {}
    if submission:
        rows = db.query(models.Response).filter(
            models.Response.submission_id == submission.submission_id
        ).all()
        for r in rows:
            val = (r.extracted_value or "").strip()
            if not val:
                continue
            # Keep both BASE and BASE_i keys; grouping collapse happens in is_applicable.
            answers[r.v_code] = val

    required = 0
    answered = 0
    for q in questions:
        section = next((s for s in sections if s.section_id == q.section_id), None)
        if section and not _section_applicable(section, answers):
            continue
        if not is_applicable(getattr(q, "visibility_rules", None), answers):
            continue
        required += 1
        if _has_answer(q.v_code, answers):
            answered += 1

    return {
        "required_total": required,
        "answered": answered,
        "fully_completed": required > 0 and answered >= required,
        "has_submission": submission is not None,
    }


def _has_answer(v_code, answers):
    """BASE or any BASE_0/BASE_1/... entry present with a non-empty value."""
    if answers.get(v_code):
        return True
    prefix = v_code + "_"
    return any(k.startswith(prefix) and str(k[len(prefix):]).isdigit() for k in answers)


def is_form_fully_completed(db, user_id: int, form_id: int) -> bool:
    return get_form_completion(db, user_id, form_id)["fully_completed"]


def locked_by_earlier_forms(db, user_id: int, form_id: int):
    """Return list of earlier (lower sort_order) forms not fully completed."""
    form = db.query(models.Form).filter(models.Form.form_id == form_id).first()
    if not form:
        return []
    earlier = (
        db.query(models.Form)
        .filter(
            and_(models.Form.sort_order < form.sort_order),
            models.Form.form_id != form.form_id,
        )
        .order_by(models.Form.sort_order)
        .all()
    )
    return [f for f in earlier if not is_form_fully_completed(db, user_id, f.form_id)]


def fully_completed_form_count(db, user_id: int) -> int:
    """Number of forms this user has fully completed (strict definition)."""
    return sum(
        1 for f in db.query(models.Form).all()
        if is_form_fully_completed(db, user_id, f.form_id)
    )
