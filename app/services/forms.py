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


def get_cross_form_answers(db, user_id: int, exclude_submission_id=None):
    """Every saved answer of this user outside one submission.

    Used as read-only context for dependency evaluation when a
    ``depends_on_vcode`` / ``visibility_rules`` parent lives in another
    form the user filled previously. Keys use indexed form
    (``BASE`` or ``BASE_N``); latest response wins. Never persisted.
    """
    q = (
        db.query(models.Response)
        .join(models.Submission,
              models.Response.submission_id == models.Submission.submission_id)
        .filter(models.Submission.user_id == user_id)
    )
    if exclude_submission_id is not None:
        q = q.filter(models.Submission.submission_id != exclude_submission_id)
    rows = q.order_by(
        models.Response.processed_at.asc(),
        models.Response.response_id.asc(),
    ).all()
    out = {}
    for r in rows:
        if r.extracted_value is None or r.extracted_value == "":
            continue
        key = f"{r.v_code}_{r.group_index}" if r.group_index is not None else r.v_code
        out[key] = r.extracted_value
    return out


def _effective_section_value(v_code, answers):
    """Answer for a section parent, collapsing grouped BASE_0/BASE_1."""
    direct = answers.get(v_code)
    if direct not in (None, ""):
        return str(direct)
    prefix = v_code + "_"
    entries = [(int(k[len(prefix):]), str(v))
               for k, v in answers.items()
               if k.startswith(prefix) and k[len(prefix):].isdigit()
               and v not in (None, "")]
    if not entries:
        return None
    entries.sort(key=lambda e: e[0])
    return ",".join(v for _, v in entries)


def _section_value_matches(parent_value, expected):
    """Single expected value vs a possibly multi-select parent.

    Same semantics as visibility._rule_ok: an N/A / missing parent never
    matches; a comma-joined parent matches when ANY selected code equals
    the expected value. Keeps single-value behaviour as exact match.
    """
    if parent_value is None:
        return False
    parent_value = str(parent_value).strip()
    if parent_value == "" or parent_value.upper() == "N/A":
        return False
    expected = str(expected).strip()
    if "," in parent_value:
        selected = [v.strip() for v in parent_value.split(",") if v.strip()]
        return expected in selected
    return parent_value == expected


def _section_applicable(section, answers):
    """Section-level depends_on / skip_if rules against the answer set."""
    if section.depends_on_vcode:
        val = _effective_section_value(section.depends_on_vcode, answers)
        if not _section_value_matches(val, section.depends_on_value):
            return False
    if section.skip_if_vcode:
        val = _effective_section_value(section.skip_if_vcode, answers)
        # skip_if fires only on an explicit match; missing/N/A never skips.
        if _section_value_matches(val, section.skip_if_value):
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

    answers = {}
    if submission:
        rows = db.query(models.Response).filter(
            models.Response.submission_id == submission.submission_id
        ).all()
        for r in rows:
            val = (r.extracted_value or "").strip()
            if not val:
                continue
            # Keep indexed keys (BASE_N); grouping collapse happens in is_applicable.
            key = f"{r.v_code}_{r.group_index}" if r.group_index is not None else r.v_code
            answers[key] = val

    # Visibility context: current answers win over older forms. Counting
    # below still uses ``answers`` (current form only); applicability uses
    # the merged set so cross-form parents resolve.
    visible_answers = dict(get_cross_form_answers(
        db, user_id, exclude_submission_id=submission.submission_id if submission else None))
    visible_answers.update(answers)

    required = 0
    answered_required = 0
    applicable = 0
    answered_applicable = 0
    for q in questions:
        section = next((s for s in sections if s.section_id == q.section_id), None)
        if section and not _section_applicable(section, visible_answers):
            continue
        if not is_applicable(getattr(q, "visibility_rules", None), visible_answers):
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
