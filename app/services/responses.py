"""Helpers for persisting questionnaire answers."""
from sqlalchemy import and_

from app import models


def upsert_response(db, submission_id, question, v_code, value,
                    transcript=None, is_voice=True, confidence=None):
    """Insert or update the single Response row for (submission, v_code).

    Re-recording or editing a field overwrites its row instead of stacking
    duplicate rows, so the submission always holds one answer per question.
    """
    resp = None
    if submission_id is not None:
        resp = db.query(models.Response).filter(
            and_(
                models.Response.submission_id == submission_id,
                models.Response.v_code == v_code,
            )
        ).first()

    if resp is None:
        resp = models.Response(
            submission_id=submission_id,
            question_id=question.question_id if question else None,
            v_code=v_code,
        )
        db.add(resp)

    resp.extracted_value = None if value is None else str(value)
    resp.is_voice = is_voice
    if transcript is not None:
        resp.transcript = transcript
    if confidence is not None:
        resp.ai_confidence = confidence
    return resp
