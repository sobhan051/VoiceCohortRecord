"""Helpers for persisting questionnaire answers."""

from datetime import datetime

from sqlalchemy import and_, or_

from app import models


def _stored_v_code(question, v_code):
    """
    Always prefer the canonical question v_code.

    This is important for grouped questions:
    even if extraction returns D1_1, we store:
        v_code = D1
        group_index = 1
    """
    if question is not None and getattr(question, "v_code", None):
        return question.v_code
    return v_code


def upsert_response(
    db,
    submission_id,
    question,
    v_code,
    value,
    transcript=None,
    is_voice=True,
    confidence=None,
    group_index=None,
):
    """
    Insert or update the Response row for:
    (submission_id, canonical v_code, group_index)

    Also updates processed_at so "latest answer" logic works correctly.
    """
    stored_v_code = _stored_v_code(question, v_code)

    resp = None

    if submission_id is not None:
        filter_conditions = [
            models.Response.submission_id == submission_id,
            models.Response.v_code == stored_v_code,
        ]

        if group_index is not None:
            filter_conditions.append(models.Response.group_index == group_index)
        else:
            filter_conditions.append(models.Response.group_index.is_(None))

        resp = db.query(models.Response).filter(and_(*filter_conditions)).first()

    if resp is None:
        resp = models.Response(
            submission_id=submission_id,
            question_id=question.question_id if question else None,
            v_code=stored_v_code,
            group_index=group_index,
        )
        db.add(resp)
    else:
        # Keep the row consistent even if the caller passes a better question object.
        if question is not None:
            resp.question_id = question.question_id
        resp.v_code = stored_v_code
        resp.group_index = group_index

    resp.extracted_value = None if value is None else str(value)
    resp.is_voice = is_voice

    if transcript is not None:
        resp.transcript = transcript

    if confidence is not None:
        resp.ai_confidence = confidence

    # Very important:
    # this makes latest-answer deduplication work correctly.
    resp.processed_at = datetime.now()

    return resp


def delete_section_responses(db, submission_id, questions):
    """
    Delete previous answers for a section before saving a new voice extraction.

    This is the main fix for:
    - repeated section recordings
    - stale grouped medication rows
    - old transcripts lingering after re-record
    """
    if not submission_id or not questions:
        return 0

    question_ids = [q.question_id for q in questions if q.question_id]
    base_vcodes = [q.v_code for q in questions if q.v_code]

    conditions = []

    if question_ids:
        conditions.append(models.Response.question_id.in_(question_ids))

    if base_vcodes:
        for vc in base_vcodes:
            conditions.append(models.Response.v_code == vc)
            # Also clean old malformed grouped rows like D1_1 / D1_2
            conditions.append(models.Response.v_code.startswith(f"{vc}_"))

    if not conditions:
        return 0

    return (
        db.query(models.Response)
        .filter(
            models.Response.submission_id == submission_id,
            or_(*conditions),
        )
        .delete(synchronize_session=False)
    )