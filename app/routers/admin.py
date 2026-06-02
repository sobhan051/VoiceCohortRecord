"""Admin panel JSON API.

NOTE: these routes have no authentication and expose patient PII. Do not
expose this service publicly without adding access control.
"""
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from app import models
from app.db.session import get_db

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

        # Count responses
        response_count = db.query(models.Response).filter(
            models.Response.submission_id == sub.submission_id
        ).count()

        result.append({
            "submission_id": str(sub.submission_id),
            "user_name": f"{user.first_name or ''} {user.last_name or ''}" if user else "Unknown",
            "national_code": user.national_code if user else "N/A",
            "status": sub.status,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
            "response_count": response_count
        })

    return result


@router.get("/submission/{submission_id}")
async def admin_submission_detail(
    submission_id: str,
    db: Session = Depends(get_db)
):
    """Get detailed submission data"""

    try:
        sub_id = UUID(submission_id)
    except:
        return {"error": "Invalid submission ID"}

    submission = db.query(models.Submission).filter(
        models.Submission.submission_id == sub_id
    ).first()

    if not submission:
        return {"error": "Submission not found"}

    # Get user
    user = db.query(models.User).filter(models.User.user_id == submission.user_id).first()

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
            "v_code": resp.v_code,
            "question_text": question.question_text_fa if question else "Unknown",
            "extracted_value": resp.extracted_value,
            "transcript": resp.transcript[:200] + "..." if resp.transcript and len(resp.transcript) > 200 else resp.transcript,
            "is_voice": resp.is_voice,
            "ai_confidence": resp.ai_confidence,
            "processed_at": resp.processed_at.isoformat() if resp.processed_at else None
        })

    return {
        "submission_id": str(submission.submission_id),
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
        "responses": responses_data
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
        uid = UUID(user_id)
        user = db.query(models.User).filter(models.User.user_id == uid).first()

        if not user:
            return {"error": "User not found"}

        db.delete(user)
        db.commit()

        return {"success": True, "message": "User deleted successfully"}
    except Exception as e:
        return {"error": str(e)}


@router.get("/questions")
async def admin_questions(db: Session = Depends(get_db)):
    """Get all questions organized by section"""
    sections = db.query(models.Section).order_by(models.Section.sort_order).all()

    result = []
    for section in sections:
        questions = db.query(models.Question).filter(
            models.Question.section_id == section.section_id
        ).order_by(models.Question.sort_order).all()

        result.append({
            "section_id": str(section.section_id),
            "section_key": section.section_key,
            "section_name": section.name_fa,
            "questions": [
                {
                    "question_id": str(q.question_id),
                    "v_code": q.v_code,
                    "question_text_fa": q.question_text_fa,
                    "response_type": q.response_type,
                    "coding_options": q.coding_options,
                    "unit": q.unit,
                    "sort_order": q.sort_order
                }
                for q in questions
            ]
        })

    return result


@router.put("/question/{question_id}")
async def admin_update_question(
    question_id: str,
    question_data: dict,
    db: Session = Depends(get_db)
):
    """Update a question"""

    try:
        qid = UUID(question_id)
        question = db.query(models.Question).filter(models.Question.question_id == qid).first()

        if not question:
            return {"error": "Question not found"}

        # Update fields
        if "question_text_fa" in question_data:
            question.question_text_fa = question_data["question_text_fa"]
        if "response_type" in question_data:
            question.response_type = question_data["response_type"]
        if "coding_options" in question_data:
            question.coding_options = question_data["coding_options"]
        if "unit" in question_data:
            question.unit = question_data["unit"]
        if "sort_order" in question_data:
            question.sort_order = question_data["sort_order"]

        db.commit()

        return {"success": True, "message": "Question updated successfully"}
    except Exception as e:
        return {"error": str(e)}


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
