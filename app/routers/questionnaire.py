"""Questionnaire flow: form structure, voice processing, anomaly checks,
and submission lifecycle."""
import os
import shutil
import uuid
from datetime import datetime

from app.services.audio_processor import process_audio_file
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
async def get_form(form_id: str = None, db: Session = Depends(get_db)):
    query = db.query(models.Section)
    if form_id:
        try:
            fid = int(form_id)
            query = query.filter(models.Section.form_id == fid)
        except ValueError:
            pass
    sections = query.order_by(models.Section.sort_order).all()
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
    submission_id = payload.get("submission_id", None)

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
    # if "A4" in answers:
    #     relevant_vcodes.add("A4")

    filtered_answers = {v: answers[v] for v in relevant_vcodes if v in answers}

    # Pull the verbatim transcript of this section's recording from the stored
    # responses so the checker can confirm suspicious readings and catch
    # values that were spoken but not extracted.
    transcript = None
    if submission_id:
        try:
            saved = db.query(models.Response).filter(
                and_(
                    models.Response.submission_id == int(submission_id),
                    models.Response.transcript.isnot(None),
                )
            ).limit(1).first()
            if saved and saved.transcript:
                transcript = saved.transcript
        except (ValueError, AttributeError):
            pass

    try:
        warnings = PromptGenerator.check_anomalies(
            filtered_answers, questions_meta, confidence_reasons, transcript
        )
        return {"warnings": warnings}
    except Exception as e:
        print(f"Per‑section anomaly check error: {e}")
        return {"error": str(e)}


@router.post("/check-final-anomalies")
async def check_final_anomalies(
    payload: dict,   # { "submission_id": "...", "answers": {...}, "confidence_reasons": {...} }
    db: Session = Depends(get_db)
):
    """Form-level cross-section sanity pass, run at submit time.

    Gathers every answered field for the submission (grouping them by section,
    with the question context + option-code meanings) plus the verbatim
    transcripts of every recorded section, then asks the model to flag
    contradictions or unsafe combinations that span sections.
    """
    submission_id = payload.get("submission_id")
    answers = payload.get("answers", {}) or {}
    confidence_reasons = payload.get("confidence_reasons", {}) or {}
    if not submission_id:
        return {"error": "submission_id الزامی است"}
    try:
        sub_id = int(submission_id)
    except (ValueError, TypeError):
        return {"error": "شناسه ثبت نامعتبر است"}

    submission = db.query(models.Submission).filter(
        models.Submission.submission_id == sub_id
    ).first()
    if not submission:
        return {"error": "ثبت مورد نظر یافت نشد"}

    # Question + section metadata so we can group by section and decode options.
    questions_by_id = {q.question_id: q for q in db.query(models.Question).all()}
    sections_by_id = {s.section_id: s for s in db.query(models.Section).all()}

    # v_code -> question, and v_code -> section_key (via question.section_id).
    vcode_to_question = {q.v_code: q for q in questions_by_id.values()}
    vcode_to_section = {
        vc: sections_by_id[q.section_id].section_key
        for vc, q in vcode_to_question.items()
        if q.section_id in sections_by_id
    }

    # Group the current answer set by section for the model.
    all_questions_meta = {}
    for vc, val in answers.items():
        if val is None or val == "":
            continue
        q = vcode_to_question.get(vc)
        if not q:
            continue
        sk = vcode_to_section.get(vc, "سایر")
        all_questions_meta.setdefault(sk, []).append({
            "v_code": q.v_code,
            "question_text_fa": q.question_text_fa,
            "response_type": q.response_type,
            "unit": q.unit,
            "coding_options": q.coding_options,
        })

    # Verbatim transcripts are stored on Response rows; grab the latest per section.
    transcripts = {}
    saved = db.query(models.Response).filter(
        models.Response.submission_id == sub_id
    ).all()
    for r in saved:
        if not r.transcript:
            continue
        sk = vcode_to_section.get(r.v_code)
        if sk:
            transcripts.setdefault(sk, r.transcript)

    try:
        warnings = PromptGenerator.check_final_anomalies(
            answers, all_questions_meta, transcripts, confidence_reasons
        )
        return {"warnings": warnings}
    except Exception as e:
        print(f"Final anomaly check error: {e}")
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
            user = db.query(models.User).filter(models.User.user_id == int(user_id)).first()
        except (ValueError, AttributeError, TypeError):
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
            form = db.query(models.Form).filter(models.Form.form_id == int(form_id)).first()
        except (ValueError, AttributeError, TypeError):
            return {"error": "شناسه فرم نامعتبر است"}
        if not form:
            return {"error": "فرم یافت نشد"}
    if form is None:
        form = db.query(models.Form).order_by(models.Form.form_name).first()
    if form is None:
        return {"error": "هیچ فرمی تعریف نشده است"}

    # Progressive resume: reuse this patient's most recent submission for the
    # form regardless of status, so a returning patient continues where they
    # left off instead of starting an empty questionnaire. A completed
    # submission is reopened to "draft" so the remaining sections can be filled.
    submission = db.query(models.Submission).filter(
        and_(
            models.Submission.user_id == user.user_id,
            models.Submission.form_id == form.form_id,
        )
    ).order_by(desc(models.Submission.created_at)).first()

    if submission is None:
        submission = models.Submission(
            user_id=user.user_id, form_id=form.form_id, status="draft"
        )
        db.add(submission)
    elif submission.status != "draft":
        submission.status = "draft"

    db.commit()
    db.refresh(submission)

    # Load any answers already saved for this submission so the UI can prefill
    # the answered fields and mark their sections as done. Map each v_code to
    # its section_key (via the question) for section-level progress.
    saved_responses = db.query(models.Response).filter(
        models.Response.submission_id == submission.submission_id
    ).all()

    section_key_by_qid = {}
    if saved_responses:
        section_by_id = {s.section_id: s.section_key for s in db.query(models.Section).all()}
        for q in db.query(models.Question).all():
            section_key_by_qid[q.question_id] = section_by_id.get(q.section_id)

    answers = {}
    confidence = {}
    answered_sections = set()
    for r in saved_responses:
        if r.extracted_value is None:
            continue
        answers[r.v_code] = r.extracted_value
        if r.ai_confidence is not None:
            confidence[r.v_code] = r.ai_confidence
        sk = section_key_by_qid.get(r.question_id)
        if sk:
            answered_sections.add(sk)

    return {
        "submission_id": str(submission.submission_id),
        "user_id": str(user.user_id),
        "user_name": f"{user.first_name or ''} {user.last_name or ''}".strip(),
        "national_code": user.national_code,
        "status": submission.status,
        "answers": answers,
        "confidence": confidence,
        "answered_sections": sorted(answered_sections),
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
        sub_id = int(submission_id)
    except (ValueError, TypeError):
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
    audio_format: str = Form(None),
    bitrate: str = Form(None),       
    db: Session = Depends(get_db)
):
    # Log the incoming format for debugging
    print(f"📥 Received audio: {audio.filename}")
    print(f"   Content-Type: {audio.content_type}")
    print(f"   Format: {audio_format}")
    print(f"   Bitrate: {bitrate}")
    print(f"   Size: {audio.size / 1024:.2f} KB")
    
    # Supported audio formats
    SUPPORTED_MIME_TYPES = {
        'audio/webm': 'webm',
        'audio/mp4': 'm4a',
        'audio/ogg': 'ogg',
        'audio/wav': 'wav',
        'audio/mpeg': 'mp3',
    }
    
    if audio.content_type not in SUPPORTED_MIME_TYPES:
        return {"error": f"فرمت صوتی پشتیبانی نمی‌شود. فرمت‌های مجاز: WebM, M4A, OGG, WAV"}
    
    # Find section & questions
    section = db.query(models.Section).filter(
        models.Section.section_key == section_key
    ).first()
    if not section:
        return {"error": "سکشن مورد نظر یافت نشد"}

    # Resolve the target submission
    sub_id = None
    if submission_id:
        try:
            sub_id = int(submission_id)
        except (ValueError, TypeError):
            return {"error": "شناسه ثبت نامعتبر است"}
        if not db.query(models.Submission).filter(
            models.Submission.submission_id == sub_id
        ).first():
            return {"error": "ثبت مورد نظر یافت نشد"}

    questions = db.query(models.Question).filter(
        models.Question.section_id == section.section_id
    ).all()

    # Save audio with original extension
    ext = SUPPORTED_MIME_TYPES[audio.content_type]
    unique_filename = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)

    # Server-side: trim silence + normalize loudness via ffmpeg, then archive
    # both the original and processed clips for testing. (Cleanup + opus->wav
    # switch can be added once testing is done.)
    processed_path = process_audio_file(file_path)

    try:
        result = PromptGenerator.process_audio(processed_path, questions)

        extracted_data = result.get('data', {})
        transcript_text = result.get('transcript', '')
        confidence_map = result.get('confidence', {}) or {}

        # Save responses
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

        return {
            "data": extracted_data,
            "confidence": result.get("confidence", {}),
            "confidence_reasons": result.get("confidence_reasons", {}),
        }

    except Exception as e:
        print(f"CRITICAL ERROR: {str(e)}")
        return {"error": str(e)}

    # Archive for testing: original + processed clips are kept in UPLOAD_DIR.
    # Re-enable cleanup here once testing is complete.