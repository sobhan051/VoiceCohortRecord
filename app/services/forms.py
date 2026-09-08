"""Form sequence gating: "fully complete" means every applicable required
question has an answer in the user's latest submission for that form.

- Optional questions (is_required=false) never block completion.
- "N/A" counts as answered (it is a stored logical answer).
- Sections whose depends_on rule is unmet are excluded (depends_on_vcode may
  point to a parent question in ANOTHER form — cross-form answers are merged
  into the evaluation set), and question
  visibility_rules are evaluated with the shared visibility evaluator.
- Half-way submissions count: status is irrelevant, the answers are.
"""
from sqlalchemy import and_, desc

from app import models
from app.services.visibility import _effective_answer, is_applicable


def _section_applicable(section, answers):
    """Section-level depends_on rule against the answer set.

    ``answers`` includes cross-form answers (parent questions recorded in
    another form of the same user), so a section whose depends_on_vcode lives
    in a different form still evaluates correctly.
    """
    if section.depends_on_vcode:
        val = _effective_answer(section.depends_on_vcode, answers)
        expected = str(section.depends_on_value or "").strip()
        actual = str(val or "").strip()
        if actual == "":
            return False
        # Multi-select parents store "1,3" — pass if ANY selected code matches.
        if "," in actual:
            selected = [v.strip() for v in actual.split(",") if v.strip()]
            if expected not in selected:
                return False
        elif actual != expected:
            return False
    return True


def get_form_completion(db, user_id: int, form_id: int):
    """How complete is this user's latest submission for the form.

    Returns:
      required_total / answered       — applicable REQUIRED questions (the
                                        completion gate; optional never blocks)
      applicable_total / applicable_answered — ALL applicable questions
                                        (required + optional) — matches what
                                        the user sees in the form UI, used for
                                        display
      fully_completed, has_submission
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
        .order_by(models.Question.sort_order)
        .all()
    )

    if not questions:
        return {
            "required_total": 0, "answered": 0,
            "applicable_total": 0, "applicable_answered": 0,
            "fully_completed": True, "has_submission": submission is not None,
        }

    # Seed the answer set with CROSS-FORM answers (the user's responses in
    # other forms) so section depends_on rules and question visibility_rules
    # referencing a parent question in another form evaluate correctly. The
    # current form's own answers are overlaid afterwards and take precedence.
    other_rows = (
        db.query(models.Response)
        .join(models.Submission, models.Response.submission_id == models.Submission.submission_id)
        .filter(
            models.Submission.user_id == user_id,
            models.Submission.form_id != form_id,
        )
        .order_by(models.Response.processed_at.asc(), models.Response.response_id.asc())
        .all()
    )
    answers = {}
    for r in other_rows:
        val = (r.extracted_value or "").strip()
        if not val:
            continue
        key = f"{r.v_code}_{r.group_index}" if r.group_index is not None else r.v_code
        answers[key] = val

    if submission:
        rows = db.query(models.Response).filter(
            models.Response.submission_id == submission.submission_id
        ).all()
        for r in rows:
            val = (r.extracted_value or "").strip()
            if not val:
                continue
            # Keep both BASE and BASE_i keys; grouping collapse happens in
            # _effective_answer / is_applicable.
            key = f"{r.v_code}_{r.group_index}" if r.group_index is not None else r.v_code
            answers[key] = val

    required = 0
    answered_required = 0
    applicable = 0
    answered_applicable = 0
    for q in questions:
        section = next((s for s in sections if s.section_id == q.section_id), None)
        if section and not _section_applicable(section, answers):
            continue
        if not is_applicable(getattr(q, "visibility_rules", None), answers):
            continue
        has = _has_answer(q.v_code, answers)
        applicable += 1
        if has:
            answered_applicable += 1
        if q.is_required:
            required += 1
            if has:
                answered_required += 1

    return {
        "required_total": required,
        "answered": answered_required,
        "applicable_total": applicable,
        "applicable_answered": answered_applicable,
        "fully_completed": required > 0 and answered_required >= required,
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
