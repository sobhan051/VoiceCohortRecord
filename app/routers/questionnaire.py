"""Questionnaire flow: form structure, voice processing, anomaly checks,
and submission lifecycle."""
import os
import shutil
import uuid
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import and_, desc
from sqlalchemy.orm import Session

from app import models
from app.core.config import UPLOAD_DIR
from app.db.session import get_db
from app.services.ai_engine import PromptGenerator
from app.services.responses import upsert_response

router = APIRouter()


@router.get("/get-form-structure")
async def get_form(db: Session = Depends(get_db)):
    sections = db.query(models.Section).order_by(models.Section.sort_order).all()
    result = []
    for s in sections:
        qs = db.query(models.Question).filter(
            models.Question.section_id == s.section_id
        ).order_by(models.Question.sort_order).all()
        result.append({
            "section_key": s.section_key,
            "name_fa": s.name_fa,
            "depends_on_vcode": s.depends_on_vcode,
            "depends_on_value": s.depends_on_value,
            "questions": qs
        })
    return result


@router.post("/check-section-anomalies")
async def check_section_anomalies(
    payload: dict,   # expects { "section_key": "...", "answers": {...} }
    db: Session = Depends(get_db)
):
    section_key = payload.get("section_key")
    answers = payload.get("answers", {})
    confidence_reasons = payload.get("confidence_reasons", None)

    if not section_key:
        return {"error": "section_key is required"}

    # Find the section
    section = db.query(models.Section).filter(
        models.Section.section_key == section_key
    ).first()
    if not section:
        return {"error": "Section not found"}

    # Get questions for that section
    questions = db.query(models.Question).filter(
        models.Question.section_id == section.section_id
    ).all()

    # Build metadata for only those questions
    questions_meta = [
        {
            "v_code": q.v_code,
            "question_text_fa": q.question_text_fa,
            "response_type": q.response_type,
            "unit": q.unit,
            "coding_options": q.coding_options,
        }
        for q in questions
    ]

    # Filter answers to only include the section’s v_codes + perhaps gender (A4) for cross‑consistency
    relevant_vcodes = {q.v_code for q in questions}
    # Add gender if present (to catch male + pregnancy)
    if "A4" in answers:
        relevant_vcodes.add("A4")

    filtered_answers = {v: answers[v] for v in relevant_vcodes if v in answers}

    try:
        warnings = PromptGenerator.check_anomalies(filtered_answers, questions_meta, confidence_reasons)
        return {"warnings": warnings}
    except Exception as e:
        print(f"Per‑section anomaly check error: {e}")
        return {"error": str(e)}


@router.post("/start-submission")
async def start_submission(
    payload: dict,   # { "user_id": "..." }  OR  { "user": { first_name, last_name, national_code, phone_number } }
    db: Session = Depends(get_db)
):
    """Create (or reuse) a respondent and open a draft submission for them.

    Returns the submission_id the questionnaire then attaches every answer to.
    """
    user = None

    # Path 1: an existing user was selected by id
    user_id = payload.get("user_id")
    if user_id:
        try:
            user = db.query(models.User).filter(models.User.user_id == UUID(user_id)).first()
        except (ValueError, AttributeError):
            return {"error": "شناسه کاربر نامعتبر است"}
        if not user:
            return {"error": "کاربر یافت نشد"}

    # Path 2: inline user data — reuse by national_code (unique) or create
    if user is None:
        info = payload.get("user") or {}
        national_code = (info.get("national_code") or "").strip()
        if not national_code:
            return {"error": "کد ملی الزامی است"}

        user = db.query(models.User).filter(
            models.User.national_code == national_code
        ).first()
        if user is None:
            user = models.User(
                first_name=info.get("first_name"),
                last_name=info.get("last_name"),
                national_code=national_code,
                phone_number=info.get("phone_number"),
                role=info.get("role", 1),
            )
            db.add(user)
            db.flush()  # populate user_id without ending the transaction

    # Resolve the form this submission belongs to. The questionnaire UI doesn't
    # track a form, so accept an optional form_id and otherwise fall back to the
    # first available form. submissions.form_id is NOT NULL in the database.
    form = None
    form_id = payload.get("form_id")
    if form_id:
        try:
            form = db.query(models.Form).filter(models.Form.form_id == UUID(form_id)).first()
        except (ValueError, AttributeError):
            return {"error": "شناسه فرم نامعتبر است"}
        if not form:
            return {"error": "فرم یافت نشد"}
    if form is None:
        form = db.query(models.Form).order_by(models.Form.form_name).first()
    if form is None:
        return {"error": "هیچ فرمی تعریف نشده است"}

    # Reuse an open draft for this user if one exists, otherwise create one
    submission = db.query(models.Submission).filter(
        and_(
            models.Submission.user_id == user.user_id,
            models.Submission.status == "draft",
        )
    ).order_by(desc(models.Submission.created_at)).first()

    if submission is None:
        submission = models.Submission(
            user_id=user.user_id, form_id=form.form_id, status="draft"
        )
        db.add(submission)

    db.commit()
    db.refresh(submission)

    return {
        "submission_id": str(submission.submission_id),
        "user_id": str(user.user_id),
        "user_name": f"{user.first_name or ''} {user.last_name or ''}".strip(),
        "national_code": user.national_code,
        "status": submission.status,
    }


@router.post("/complete-submission")
async def complete_submission(
    payload: dict,   # { "submission_id": "...", "answers": {v_code: value}, "confidence": {v_code: 0..1} }
    db: Session = Depends(get_db)
):
    """Persist the final answer set (including manually typed fields) and mark
    the submission completed."""
    submission_id = payload.get("submission_id")
    if not submission_id:
        return {"error": "submission_id الزامی است"}
    try:
        sub_id = UUID(submission_id)
    except ValueError:
        return {"error": "شناسه ثبت نامعتبر است"}

    submission = db.query(models.Submission).filter(
        models.Submission.submission_id == sub_id
    ).first()
    if not submission:
        return {"error": "ثبت مورد نظر یافت نشد"}

    answers = payload.get("answers", {}) or {}
    confidence = payload.get("confidence", {}) or {}

    # Cache questions by v_code so manual-only fields still link to their question
    questions = {q.v_code: q for q in db.query(models.Question).all()}

    saved = 0
    for v_code, value in answers.items():
        if value is None or value == "":
            continue
        q = questions.get(v_code)
        existing = db.query(models.Response).filter(
            and_(
                models.Response.submission_id == sub_id,
                models.Response.v_code == v_code,
            )
        ).first()
        # Don't downgrade a voice answer to manual unless the value actually changed
        is_voice = bool(existing.is_voice) if existing and str(existing.extracted_value) == str(value) else False
        upsert_response(
            db, sub_id, q, v_code, value,
            is_voice=is_voice,
            confidence=confidence.get(v_code),
        )
        saved += 1

    submission.status = "completed"
    submission.updated_at = datetime.now()
    db.commit()

    return {"success": True, "submission_id": str(sub_id), "saved": saved}


@router.post("/process-voice")
async def process_voice(
    section_key: str = Form(...),
    audio: UploadFile = File(...),
    submission_id: str = Form(None),
    db: Session = Depends(get_db)
):
    # 1. Find section & questions
    section = db.query(models.Section).filter(
        models.Section.section_key == section_key
    ).first()
    if not section:
        return {"error": "سکشن مورد نظر یافت نشد"}

    # Resolve the target submission (optional, but expected from the UI)
    sub_id = None
    if submission_id:
        try:
            sub_id = UUID(submission_id)
        except ValueError:
            return {"error": "شناسه ثبت نامعتبر است"}
        if not db.query(models.Submission).filter(
            models.Submission.submission_id == sub_id
        ).first():
            return {"error": "ثبت مورد نظر یافت نشد"}

    questions = db.query(models.Question).filter(
        models.Question.section_id == section.section_id
    ).all()

    # 2. Save audio to disk
    file_extension = audio.filename.split('.')[-1]
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)

    try:
        result = PromptGenerator.process_audio(file_path, questions)

        extracted_data = result.get('data', {})
        transcript_text = result.get('transcript', '')
        confidence_map = result.get('confidence', {}) or {}

        # 3. Save responses (one row per question, upserted)
        for v_code, val in extracted_data.items():
            if val is None:
                continue
            q = db.query(models.Question).filter(
                models.Question.v_code == v_code
            ).first()
            if q:
                upsert_response(
                    db, sub_id, q, v_code, val,
                    transcript=transcript_text,
                    is_voice=True,
                    confidence=confidence_map.get(v_code),
                )

        db.commit()

        # Return data plus additional AI insights
        return {
            "data": extracted_data,
            "confidence": result.get("confidence", {}),
            "confidence_reasons": result.get("confidence_reasons", {}),
        }

    except Exception as e:
        print(f"CRITICAL ERROR: {str(e)}")
        return {"error": str(e)}

    finally:
        # 4. Clean up uploaded file
        try:
            os.remove(file_path)
        except OSError:
            pass
