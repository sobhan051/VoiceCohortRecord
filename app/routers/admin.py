"""Admin panel JSON API.

NOTE: these routes have no authentication and expose patient PII. Do not
expose this service publicly without adding access control.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from app import models
from app.db.session import get_db
from app.services.visibility import parse_rules


def _int(val):
    try:
        return int(val)
    except (ValueError, TypeError):
        return None

router = APIRouter(prefix="/api/admin")


@router.get("/stats")
async def admin_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics"""
    # Total submissions
    total_submissions = db.query(models.Submission).count()

    # Submissions by status
    completed = db.query(models.Submission).filter(models.Submission.status == 'completed').count()
    draft = db.query(models.Submission).filter(models.Submission.status == 'draft').count()

    # Total users
    total_users = db.query(models.User).count()

    # Recent submissions (last 7 days)
    week_ago = datetime.now() - timedelta(days=7)
    recent_submissions = db.query(models.Submission).filter(
        models.Submission.created_at >= week_ago
    ).count()

    # AI API calls
    total_api_calls = db.query(models.ApiLog).count()

    # Average confidence (if stored)
    avg_confidence = db.query(func.avg(models.Response.ai_confidence)).scalar() or 0

    return {
        "total_submissions": total_submissions,
        "completed_submissions": completed,
        "draft_submissions": draft,
        "total_users": total_users,
        "recent_submissions": recent_submissions,
        "total_api_calls": total_api_calls,
        "avg_confidence": round(float(avg_confidence), 2)
    }


@router.get("/submissions")
async def admin_submissions(
    limit: int = 50,
    offset: int = 0,
    status: str = None,
    db: Session = Depends(get_db)
):
    """Get submissions list for admin panel"""
    query = db.query(models.Submission)

    if status:
        query = query.filter(models.Submission.status == status)

    submissions = query.order_by(desc(models.Submission.created_at)).offset(offset).limit(limit).all()

    result = []
    for sub in submissions:
        # Get user info
        user = db.query(models.User).filter(models.User.user_id == sub.user_id).first()

        # Get form info
        form = None
        if sub.form_id:
            try:
                form = db.query(models.Form).filter(models.Form.form_id == int(sub.form_id)).first()
            except (ValueError, TypeError):
                pass

        result.append({
            "submission_id": str(sub.submission_id),
            "form_id": str(sub.form_id) if sub.form_id else None,
            "form_name": form.form_name if form else "نامشخص",
            "user_name": f"{user.first_name or ''} {user.last_name or ''}" if user else "Unknown",
            "national_code": user.national_code if user else "N/A",
            "status": sub.status,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
            "token_used": sub.token_used,
        })

    return result


@router.get("/submission/{submission_id}")
async def admin_submission_detail(
    submission_id: str,
    db: Session = Depends(get_db)
):
    """Get detailed submission data"""

    try:
        sub_id = int(submission_id)
    except (ValueError, TypeError):
        return {"error": "Invalid submission ID"}

    submission = db.query(models.Submission).filter(
        models.Submission.submission_id == sub_id
    ).first()

    if not submission:
        return {"error": "Submission not found"}

    # Get user
    user = db.query(models.User).filter(models.User.user_id == submission.user_id).first()

    # Get form info
    form = None
    if submission.form_id:
        try:
            form = db.query(models.Form).filter(models.Form.form_id == int(submission.form_id)).first()
        except (ValueError, TypeError):
            pass

    # Get all responses
    responses = db.query(models.Response).filter(
        models.Response.submission_id == sub_id
    ).all()

    # Get questions for context
    responses_data = []
    for resp in responses:
        question = db.query(models.Question).filter(
            models.Question.question_id == resp.question_id
        ).first()

        responses_data.append({
            "response_id": str(resp.response_id),
            "v_code": resp.v_code,
            "question_text": question.question_text_fa if question else "Unknown",
            "extracted_value": resp.extracted_value,
            "transcript": resp.transcript[:200] + "..." if resp.transcript and len(resp.transcript) > 200 else resp.transcript,
            "is_voice": resp.is_voice,
            "ai_confidence": resp.ai_confidence,
            "processed_at": resp.processed_at.isoformat() if resp.processed_at else None
        })

    # Cross-form answers: pull every response the user has saved across ALL
    # of their submissions so visibility rules that depend on a parent living
    # in a different form (e.g. A4 gender in form 1 -> deactive_options on K1
    # in form 2) still evaluate correctly in admin view.
    cross_form_answers = {}
    if user:
        other_responses = db.query(models.Response).join(
            models.Submission,
            models.Response.submission_id == models.Submission.submission_id,
        ).filter(
            models.Submission.user_id == user.user_id,
        ).order_by(
            models.Response.processed_at.asc(),
            models.Response.response_id.asc(),
        ).all()
        for r in other_responses:
            if r.extracted_value is None or r.extracted_value == "":
                continue
            key = f"{r.v_code}_{r.group_index}" if r.group_index is not None else r.v_code
            cross_form_answers[key] = r.extracted_value

    return {
        "submission_id": str(submission.submission_id),
        "form_id": str(submission.form_id) if submission.form_id else None,
        "form_name": form.form_name if form else "نامشخص",
        "status": submission.status,
        "created_at": submission.created_at.isoformat() if submission.created_at else None,
        "updated_at": submission.updated_at.isoformat() if submission.updated_at else None,
        "user": {
            "user_id": str(user.user_id) if user else None,
            "first_name": user.first_name if user else None,
            "last_name": user.last_name if user else None,
            "national_code": user.national_code if user else None,
            "phone_number": user.phone_number if user else None
        } if user else None,
        "responses": responses_data,
        "cross_form_answers": cross_form_answers,
    }


@router.get("/users")
async def admin_users(db: Session = Depends(get_db)):
    """Get all users"""
    users = db.query(models.User).order_by(models.User.created_at.desc()).all()

    result = []
    for user in users:
        # Count submissions for this user
        submission_count = db.query(models.Submission).filter(
            models.Submission.user_id == user.user_id
        ).count()

        result.append({
            "user_id": str(user.user_id),
            "first_name": user.first_name,
            "last_name": user.last_name,
            "national_code": user.national_code,
            "phone_number": user.phone_number,
            "role": user.role,
            "submission_count": submission_count,
            "created_at": user.created_at.isoformat() if user.created_at else None
        })

    return result


@router.post("/user")
async def admin_create_user(
    user_data: dict,
    db: Session = Depends(get_db)
):
    """Create a new user"""
    try:
        new_user = models.User(
            first_name=user_data.get("first_name"),
            last_name=user_data.get("last_name"),
            national_code=user_data.get("national_code"),
            phone_number=user_data.get("phone_number"),
            role=user_data.get("role", 1)
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        return {
            "success": True,
            "user_id": str(new_user.user_id),
            "message": "User created successfully"
        }
    except Exception as e:
        return {"error": str(e)}


@router.delete("/user/{user_id}")
async def admin_delete_user(
    user_id: str,
    db: Session = Depends(get_db)
):
    """Delete a user"""

    try:
        uid = int(user_id)
        user = db.query(models.User).filter(models.User.user_id == uid).first()

        if not user:
            return {"error": "User not found"}

        db.delete(user)
        db.commit()

        return {"success": True, "message": "User deleted successfully"}
    except Exception as e:
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# Forms CRUD
# ---------------------------------------------------------------------------


@router.get("/forms")
async def admin_forms(db: Session = Depends(get_db)):
    """List all forms"""
    forms = db.query(models.Form).order_by(models.Form.sort_order, models.Form.form_id).all()
    return [
        {
            "form_id": str(f.form_id),
            "form_name": f.form_name,
            "category": f.category,
            "sort_order": f.sort_order,
        }
        for f in forms
    ]


@router.post("/forms")
async def admin_create_form(payload: dict, db: Session = Depends(get_db)):
    """Create a form"""
    try:
        f = models.Form(
            form_name=payload.get("form_name"),
            category=payload.get("category"),
            sort_order=payload.get("sort_order", 0),
        )
        db.add(f)
        db.commit()
        db.refresh(f)
        return {"success": True, "form_id": str(f.form_id)}
    except Exception as e:
        return {"error": str(e)}


@router.put("/forms/{form_id}")
async def admin_update_form(form_id: str, payload: dict, db: Session = Depends(get_db)):
    """Update a form"""
    uid = _int(form_id)
    if not uid:
        return {"error": "Invalid form ID"}
    f = db.query(models.Form).filter(models.Form.form_id == uid).first()
    if not f:
        return {"error": "Form not found"}
    if "form_name" in payload:
        f.form_name = payload["form_name"]
    if "category" in payload:
        f.category = payload["category"]
    if "sort_order" in payload:
        f.sort_order = payload["sort_order"]
    db.commit()
    return {"success": True}


@router.delete("/forms/{form_id}")
async def admin_delete_form(form_id: str, db: Session = Depends(get_db)):
    """Delete a form and its sections and questions"""
    uid = _int(form_id)
    if not uid:
        return {"error": "Invalid form ID"}
    f = db.query(models.Form).filter(models.Form.form_id == uid).first()
    if not f:
        return {"error": "Form not found"}
    # Cascade delete: sections -> questions
    sections = db.query(models.Section).filter(models.Section.form_id == uid).all()
    for s in sections:
        db.query(models.Question).filter(models.Question.section_id == s.section_id).delete()
        db.delete(s)
    db.delete(f)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Sections CRUD (scoped under a form)
# ---------------------------------------------------------------------------


@router.get("/forms/{form_id}/sections")
async def admin_form_sections(form_id: str, db: Session = Depends(get_db)):
    """Get all sections for a form"""
    uid = _int(form_id)
    if not uid:
        return {"error": "Invalid form ID"}
    sections = db.query(models.Section).filter(
        models.Section.form_id == uid
    ).order_by(models.Section.sort_order).all()
    return [
        {
            "section_id": str(s.section_id),
            "form_id": str(s.form_id),
            "section_key": s.section_key,
            "name_fa": s.name_fa,
            "sort_order": s.sort_order,
            "depends_on_vcode": s.depends_on_vcode,
            "depends_on_value": s.depends_on_value,
            "skip_if_vcode": s.skip_if_vcode,
            "skip_if_value": s.skip_if_value,
        }
        for s in sections
    ]


@router.post("/sections")
async def admin_create_section(payload: dict, db: Session = Depends(get_db)):
    """Create a section"""
    try:
        s = models.Section(
            form_id=_int(payload.get("form_id")),
            section_key=payload.get("section_key"),
            name_fa=payload.get("name_fa"),
            sort_order=payload.get("sort_order", 0),
            depends_on_vcode=payload.get("depends_on_vcode"),
            depends_on_value=payload.get("depends_on_value"),
            skip_if_vcode=payload.get("skip_if_vcode"),
            skip_if_value=payload.get("skip_if_value"),
        )
        db.add(s)
        db.commit()
        db.refresh(s)
        return {"success": True, "section_id": str(s.section_id)}
    except Exception as e:
        return {"error": str(e)}


@router.put("/sections/{section_id}")
async def admin_update_section(section_id: str, payload: dict, db: Session = Depends(get_db)):
    """Update a section"""
    uid = _int(section_id)
    if not uid:
        return {"error": "Invalid section ID"}
    s = db.query(models.Section).filter(models.Section.section_id == uid).first()
    if not s:
        return {"error": "Section not found"}
    for field in ("section_key", "name_fa", "sort_order",
                  "depends_on_vcode", "depends_on_value",
                  "skip_if_vcode", "skip_if_value"):
        if field in payload:
            setattr(s, field, payload[field])
    if "form_id" in payload:
        s.form_id = _int(payload["form_id"])
    db.commit()
    return {"success": True}


@router.delete("/sections/{section_id}")
async def admin_delete_section(section_id: str, db: Session = Depends(get_db)):
    """Delete a section and its questions"""
    uid = _int(section_id)
    if not uid:
        return {"error": "Invalid section ID"}
    s = db.query(models.Section).filter(models.Section.section_id == uid).first()
    if not s:
        return {"error": "Section not found"}
    db.query(models.Question).filter(models.Question.section_id == uid).delete()
    db.delete(s)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Questions CRUD (scoped under a section)
# ---------------------------------------------------------------------------


@router.get("/sections/{section_id}/questions")
async def admin_section_questions(section_id: str, db: Session = Depends(get_db)):
    """Get all questions for a section"""
    uid = _int(section_id)
    if not uid:
        return {"error": "Invalid section ID"}
    questions = db.query(models.Question).filter(
        models.Question.section_id == uid
    ).order_by(models.Question.sort_order).all()
    return [
        {
            "question_id": str(q.question_id),
            "section_id": str(q.section_id),
            "v_code": q.v_code,
            "variable_name": q.variable_name,
            "question_text_fa": q.question_text_fa,
            "response_type": q.response_type,
            "coding_options": q.coding_options,
            "unit": q.unit,
            "manual_prompt": q.manual_prompt,
            "sort_order": q.sort_order,
            "group_pair": q.group_pair,
            "visibility_rules": q.visibility_rules,
        }
        for q in questions
    ]


@router.post("/questions")
async def admin_create_question(payload: dict, db: Session = Depends(get_db)):
    """Create a question"""
    try:
        q = models.Question(
            section_id=_int(payload.get("section_id")),
            v_code=payload.get("v_code"),
            variable_name=payload.get("variable_name"),
            question_text_fa=payload.get("question_text_fa"),
            response_type=payload.get("response_type"),
            coding_options=payload.get("coding_options"),
            unit=payload.get("unit"),
            manual_prompt=payload.get("manual_prompt"),
            sort_order=payload.get("sort_order", 0),
            group_pair=payload.get("group_pair"),
            visibility_rules=parse_rules(payload.get("visibility_rules")),
        )
        db.add(q)
        db.commit()
        db.refresh(q)
        return {"success": True, "question_id": str(q.question_id)}
    except Exception as e:
        return {"error": str(e)}


@router.put("/questions/{question_id}")
async def admin_update_question(question_id: str, payload: dict, db: Session = Depends(get_db)):
    """Update a question"""
    uid = _int(question_id)
    if not uid:
        return {"error": "Invalid question ID"}
    q = db.query(models.Question).filter(models.Question.question_id == uid).first()
    if not q:
        return {"error": "Question not found"}
    for field in ("v_code", "variable_name", "question_text_fa", "response_type",
                  "coding_options", "unit", "manual_prompt", "sort_order", "group_pair"):
        if field in payload:
            setattr(q, field, payload[field])
    if "visibility_rules" in payload:
        q.visibility_rules = parse_rules(payload["visibility_rules"])
    if "section_id" in payload:
        q.section_id = _int(payload["section_id"])
    db.commit()
    return {"success": True}


@router.delete("/questions/{question_id}")
async def admin_delete_question(question_id: str, db: Session = Depends(get_db)):
    """Delete a question"""
    uid = _int(question_id)
    if not uid:
        return {"error": "Invalid question ID"}
    q = db.query(models.Question).filter(models.Question.question_id == uid).first()
    if not q:
        return {"error": "Question not found"}
    db.delete(q)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Users – add update
# ---------------------------------------------------------------------------


@router.put("/users/{user_id}")
async def admin_update_user(user_id: str, payload: dict, db: Session = Depends(get_db)):
    """Update a user"""
    uid = _int(user_id)
    if not uid:
        return {"error": "Invalid user ID"}
    u = db.query(models.User).filter(models.User.user_id == uid).first()
    if not u:
        return {"error": "User not found"}
    for field in ("first_name", "last_name", "national_code", "phone_number", "role"):
        if field in payload:
            setattr(u, field, payload[field])
    db.commit()
    return {"success": True}


@router.delete("/submissions/{submission_id}")
async def admin_delete_submission(submission_id: str, db: Session = Depends(get_db)):
    """Delete a submission and its responses"""
    uid = _int(submission_id)
    if not uid:
        return {"error": "Invalid submission ID"}
    sub = db.query(models.Submission).filter(models.Submission.submission_id == uid).first()
    if not sub:
        return {"error": "Submission not found"}
    # Delete associated responses first
    db.query(models.Response).filter(models.Response.submission_id == uid).delete()
    # Delete associated API logs
    db.query(models.ApiLog).filter(models.ApiLog.submission_id == uid).delete()
    db.delete(sub)
    db.commit()
    return {"success": True}


@router.post("/submissions/{submission_id}/reset-tokens")
async def admin_reset_submission_tokens(submission_id: str, db: Session = Depends(get_db)):
    """Reset the accumulated token usage of a submission back to zero"""
    uid = _int(submission_id)
    if not uid:
        return {"error": "Invalid submission ID"}
    sub = db.query(models.Submission).filter(models.Submission.submission_id == uid).first()
    if not sub:
        return {"error": "Submission not found"}
    sub.token_used = "0,0"
    db.commit()
    return {"success": True, "token_used": sub.token_used}


@router.delete("/responses/{response_id}")
async def admin_delete_response(response_id: str, db: Session = Depends(get_db)):
    """Delete a single response"""
    uid = _int(response_id)
    if not uid:
        return {"error": "Invalid response ID"}
    r = db.query(models.Response).filter(models.Response.response_id == uid).first()
    if not r:
        return {"error": "Response not found"}
    db.delete(r)
    db.commit()
    return {"success": True}


@router.get("/api-logs")
async def admin_api_logs(
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get API call logs"""
    logs = db.query(models.ApiLog).order_by(desc(models.ApiLog.created_at)).limit(limit).all()

    result = []
    for log in logs:
        result.append({
            "log_id": str(log.log_id),
            "submission_id": str(log.submission_id) if log.submission_id else None,
            "section_key": log.section_key,
            "model_name": log.model_name,
            "tokens_used": log.tokens_used,
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "prompt_preview": log.prompt_sent[:100] + "..." if log.prompt_sent and len(log.prompt_sent) > 100 else log.prompt_sent,
            "response_preview": log.response_received[:100] + "..." if log.response_received and len(log.response_received) > 100 else log.response_received
        })

    return result


@router.get("/export/submissions")
async def admin_export_submissions(
    format: str = "json",
    db: Session = Depends(get_db)
):
    """Export all submissions data"""
    submissions = db.query(models.Submission).all()

    export_data = []
    for sub in submissions:
        user = db.query(models.User).filter(models.User.user_id == sub.user_id).first()
        responses = db.query(models.Response).filter(
            models.Response.submission_id == sub.submission_id
        ).all()

        sub_data = {
            "submission_id": str(sub.submission_id),
            "user": {
                "first_name": user.first_name if user else None,
                "last_name": user.last_name if user else None,
                "national_code": user.national_code if user else None
            },
            "status": sub.status,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
            "responses": [
                {
                    "v_code": r.v_code,
                    "extracted_value": r.extracted_value,
                    "is_voice": r.is_voice
                }
                for r in responses
            ]
        }
        export_data.append(sub_data)

    if format == "json":
        return JSONResponse(content=export_data)
    else:
        # For CSV, you'd need to implement
        return {"message": "CSV export coming soon"}
