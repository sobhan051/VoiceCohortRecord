"""Helpers for persisting questionnaire answers."""
from sqlalchemy import and_

from app import models


def upsert_response(db, submission_id, question, v_code, value,
                    transcript=None, is_voice=True, confidence=None, group_index=None):
    """Insert or update the single Response row for (submission, v_code).

    Re-recording or editing a field overwrites its row instead of stacking
    duplicate rows, so the submission always holds one answer per question.
    """
    resp = None
    if submission_id is not None:
        filter_conditions = [
            models.Response.submission_id == submission_id,
            models.Response.v_code == v_code,
        ]
        if group_index is not None:
            filter_conditions.append(models.Response.group_index == group_index)
        else:
            filter_conditions.append(models.Response.group_index.is_(None))
        resp = db.query(models.Response).filter(
            and_(*filter_conditions)
        ).first()

    if resp is None:
        resp = models.Response(
            submission_id=submission_id,
            question_id=question.question_id if question else None,
            v_code=v_code,
            group_index=group_index,
        )
        db.add(resp)

    resp.extracted_value = None if value is None else str(value)
    resp.is_voice = is_voice
    if transcript is not None:
        resp.transcript = transcript
    if confidence is not None:
        resp.ai_confidence = confidence
    return resp
