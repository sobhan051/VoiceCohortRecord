"""Health check view + admin trigger."""
import json

from fastapi import APIRouter, Depends
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app import models
from app.core.config import APP_BASE_URL
from app.db.session import get_db
from app.services.shamsi import calc_age, gregorian_to_shamsi_str

router = APIRouter(prefix="/api")


def _parse_report(raw):
    """Structured report JSON (new rows) or None (legacy markdown rows)."""
    if not raw or not raw.strip().startswith("{"):
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


@router.get("/health-check/by-user/{user_id}")
async def health_by_user(user_id: str, db: Session = Depends(get_db)):
    try:
        uid = int(user_id)
    except (ValueError, TypeError):
        return {"error": "شناسه نامعتبر"}
    hc = db.query(models.HealthCheck).filter(models.HealthCheck.user_id == uid).first()
    if not hc:
        return {"exists": False}
    user = db.query(models.User).filter(models.User.user_id == uid).first()
    return {
        "exists": True,
        "check_id": str(hc.check_id),
        "summary": hc.summary,
        "report": _parse_report(hc.full_report),
        "created_at": hc.created_at.isoformat() if hc.created_at else None,
        "user_age": calc_age(user.birth_date) if user and user.birth_date else None,
        "user_sex": user.sex if user else None,
        "link": f"{APP_BASE_URL.rstrip('/')}/health-check/{hc.check_id}",
    }


@router.get("/health-check/{check_id}")
async def health_by_id(check_id: str, db: Session = Depends(get_db)):
    try:
        cid = int(check_id)
    except (ValueError, TypeError):
        return {"error": "شناسه نامعتبر"}
    hc = db.query(models.HealthCheck).filter(models.HealthCheck.check_id == cid).first()
    if not hc:
        return {"error": "چکاپ یافت نشد"}
    user = db.query(models.User).filter(models.User.user_id == hc.user_id).first()
    return {
        "check_id": str(hc.check_id),
        "user_id": str(hc.user_id),
        "summary": hc.summary,
        "report": _parse_report(hc.full_report),
        "full_report": None if _parse_report(hc.full_report) else hc.full_report,
        "created_at": hc.created_at.isoformat() if hc.created_at else None,
        "user": {
            "first_name": user.first_name if user else None,
            "last_name": user.last_name if user else None,
            "sex": user.sex if user else None,
            "birth_date": gregorian_to_shamsi_str(user.birth_date) if user and user.birth_date else None,
            "age": calc_age(user.birth_date) if user and user.birth_date else None,
        } if user else None,
    }


@router.post("/admin/health-check/{user_id}")
async def admin_trigger_health(
    user_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    try:
        uid = int(user_id)
    except (ValueError, TypeError):
        return {"error": "شناسه نامعتبر"}

    user = db.query(models.User).filter(models.User.user_id == uid).first()
    if not user:
        return {"error": "کاربر یافت نشد"}

    existing = (
        db.query(models.HealthCheck)
        .filter(models.HealthCheck.user_id == uid)
        .first()
    )
    if existing:
        return {
            "error": "چکاپ قبلاً ایجاد شده و بازنویسی نمی‌شود",
            "check_id": str(existing.check_id),
        }

    from app.services.health_check import get_health_eligibility, queue_user_health_check

    eligibility = get_health_eligibility(db, uid)

    if not eligibility["eligible"]:
        return {
            "error": f"کاربر {eligibility['completed_forms']} از {eligibility['required_forms']} فرم را تکمیل کرده است"
        }

    queued = queue_user_health_check(background_tasks, uid)

    if not queued:
        return {
            "success": False,
            "error": "چکاپ هم‌اکنون در صف تولید است",
        }

    return {
        "success": True,
        "status": "queued",
    }
