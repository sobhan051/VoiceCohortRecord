"""Authentication and dashboard endpoints.

Simple login via national_code (no password — the User model has none).
Dashboard data differs per role (1=user, 2=admin).
"""
import re
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app import models
from app.db.session import get_db

router = APIRouter(prefix="/api")


@router.post("/signup")
async def signup(payload: dict, db: Session = Depends(get_db)):
    """Create a new user account. Fields: first_name, last_name,
    national_code (required, 10 digits), phone_number (11 digits)."""
    first_name = (payload.get("first_name") or "").strip()
    last_name = (payload.get("last_name") or "").strip()
    national_code = (payload.get("national_code") or "").strip()
    phone_number = (payload.get("phone_number") or "").strip()

    if not national_code:
        return {"error": "کد ملی الزامی است"}
    if not re.fullmatch(r"\d{10}", national_code):
        return {"error": "کد ملی باید ۱۰ رقم باشد"}
    if phone_number and not re.fullmatch(r"09\d{9}", phone_number):
        return {"error": "شماره تماس باید با ۰۹ شروع شده و ۱۱ رقم باشد"}

    existing = db.query(models.User).filter(
        models.User.national_code == national_code
    ).first()
    if existing:
        return {"error": "کاربری با این کد ملی قبلاً ثبت شده است"}

    user = models.User(
        first_name=first_name or None,
        last_name=last_name or None,
        national_code=national_code,
        phone_number=phone_number or None,
        role=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "user": {
            "user_id": str(user.user_id),
            "first_name": user.first_name,
            "last_name": user.last_name,
            "national_code": user.national_code,
            "phone_number": user.phone_number,
            "role": user.role,
        },
    }


@router.post("/login")
async def login(payload: dict, db: Session = Depends(get_db)):
    """Log in by national_code. Returns user info and role."""
    national_code = (payload.get("national_code") or "").strip()
    if not national_code:
        return {"error": "کد ملی الزامی است"}

    user = db.query(models.User).filter(
        models.User.national_code == national_code
    ).first()
    if not user:
        return {"error": "کاربری با این کد ملی یافت نشد"}

    return {
        "success": True,
        "user": {
            "user_id": str(user.user_id),
            "first_name": user.first_name,
            "last_name": user.last_name,
            "national_code": user.national_code,
            "phone_number": user.phone_number,
            "role": user.role,
        },
    }


@router.get("/dashboard")
async def dashboard(user_id: str, db: Session = Depends(get_db)):
    """Get dashboard data for a user. Returns role-specific data."""
    try:
        uid = UUID(user_id)
    except ValueError:
        return {"error": "شناسه کاربر نامعتبر است"}

    user = db.query(models.User).filter(models.User.user_id == uid).first()
    if not user:
        return {"error": "کاربر یافت نشد"}

    data = {
        "user": {
            "user_id": str(user.user_id),
            "first_name": user.first_name,
            "last_name": user.last_name,
            "national_code": user.national_code,
            "phone_number": user.phone_number,
            "role": user.role,
        }
    }

    if user.role == 2:
        # --- Admin dashboard ---
        total_submissions = db.query(models.Submission).count()
        completed = db.query(models.Submission).filter(
            models.Submission.status == "completed"
        ).count()
        draft = db.query(models.Submission).filter(
            models.Submission.status == "draft"
        ).count()
        total_users = db.query(models.User).count()
        total_api_calls = db.query(models.ApiLog).count()
        avg_confidence = db.query(func.avg(models.Response.ai_confidence)).scalar() or 0

        data["dashboard_type"] = "admin"
        data["stats"] = {
            "total_submissions": total_submissions,
            "completed_submissions": completed,
            "draft_submissions": draft,
            "total_users": total_users,
            "total_api_calls": total_api_calls,
            "avg_confidence": round(float(avg_confidence), 2),
        }

        # Forms available
        forms = db.query(models.Form).all()
        data["forms"] = [
            {
                "form_id": str(f.form_id),
                "form_name": f.form_name,
                "category": f.category,
            }
            for f in forms
        ]

    else:
        # --- Regular user dashboard ---
        submissions = (
            db.query(models.Submission)
            .filter(models.Submission.user_id == uid)
            .order_by(desc(models.Submission.updated_at))
            .all()
        )

        forms = {f.form_id: f for f in db.query(models.Form).all()}

        completed_count = 0
        draft_count = 0
        submissions_list = []
        for sub in submissions:
            form = forms.get(sub.form_id)
            response_count = db.query(models.Response).filter(
                models.Response.submission_id == sub.submission_id
            ).count()

            # Count total questions in this form (across all sections)
            total_questions = db.query(func.count(models.Question.question_id)).join(
                models.Section,
                models.Question.section_id == models.Section.section_id,
            ).filter(
                models.Section.form_id == sub.form_id
            ).scalar() or 0

            submissions_list.append({
                "submission_id": str(sub.submission_id),
                "form_name": form.form_name if form else "نامشخص",
                "status": sub.status,
                "created_at": sub.created_at.isoformat() if sub.created_at else None,
                "updated_at": sub.updated_at.isoformat() if sub.updated_at else None,
                "response_count": response_count,
                "total_questions": total_questions,
            })
            if sub.status == "completed":
                completed_count += 1
            else:
                draft_count += 1

        # Forms open to fill (forms the user hasn't started yet)
        open_forms = []
        for f_id, f in forms.items():
            if not any(str(s.form_id) == str(f_id) for s in submissions):
                open_forms.append({
                    "form_id": str(f.form_id),
                    "form_name": f.form_name,
                    "category": f.category,
                })

        data["dashboard_type"] = "user"
        data["stats"] = {
            "total_submissions": len(submissions),
            "completed_submissions": completed_count,
            "draft_submissions": draft_count,
        }
        data["submissions"] = submissions_list
        data["open_forms"] = open_forms

    return data
