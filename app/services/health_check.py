"""Background health-check generation service.

This module centralizes:
- eligibility checking (all required forms completed)
- latest-answer deduplication
- non-blocking health report generation
"""

from __future__ import annotations

import json
import re
import threading
from datetime import datetime
from typing import Optional

from fastapi import BackgroundTasks
from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError

from app import models
from app.core import config as app_config
from app.db.session import SessionLocal

from app.services.ai_engine import PromptGenerator

# Optional email support — do not crash the health check if email module is missing.
try:
    from app.services.email import send_health_email
except Exception:
    send_health_email = None


_lock = threading.Lock()
_queued_user_ids = set()


def _normalize_vcode(v_code: Optional[str]) -> str:
    """
    Normalize grouped v_codes:
      D1_1 -> D1
      D1_2 -> D1
      D1   -> D1
    """
    v = (v_code or "").strip()
    return re.sub(r"_\d+$", "", v)


def _canonical_group_index(group_index) -> int:
    """
    Treat None as 0 for deduplication purposes.

    In this app:
      - first grouped item may be stored as group_index=0
      - old rows may have group_index=None
    They should be considered the same item.
    """
    try:
        if group_index is None:
            return 0
        return int(group_index)
    except Exception:
        return 0


def _response_dedupe_key(r):
    """
    Deduplicate by question_id if possible.
    This protects against old malformed rows like:
      - v_code=D1_1, group_index=1
      - v_code=D1,   group_index=1
    """
    group_index = _canonical_group_index(r.group_index)

    if r.question_id:
        return (r.question_id, group_index)

    return (_normalize_vcode(r.v_code), group_index)


def _ts(value: Optional[datetime]) -> float:
    try:
        return value.timestamp() if value else 0.0
    except Exception:
        return 0.0


def _required_form_count(db):
    total_forms = db.query(models.Form).count()

    try:
        required = int(getattr(app_config, "REQUIRED_FORM_COUNT", 0) or 0)
    except Exception:
        required = 0

    if required <= 0:
        required = total_forms

    return total_forms, required


def _completed_form_ids(db, user_id: int):
    rows = (
        db.query(models.Submission.form_id)
        .filter(
            models.Submission.user_id == user_id,
            models.Submission.status == "completed",
        )
        .distinct()
        .all()
    )
    return {r[0] for r in rows}


def get_health_eligibility(db, user_id: int):
    total_forms, required_forms = _required_form_count(db)
    completed_forms = _completed_form_ids(db, user_id)

    eligible = (
        total_forms > 0
        and required_forms > 0
        and len(completed_forms) >= required_forms
    )

    return {
        "eligible": eligible,
        "total_forms": total_forms,
        "required_forms": required_forms,
        "completed_forms": len(completed_forms),
    }


def is_health_check_eligible(db, user_id: int) -> bool:
    return get_health_eligibility(db, user_id)["eligible"]


# Questionnaire v_codes holding the demographics (form 1 / identity section).
SEX_VCODE = "A4"      # Categorical {"1": "مرد", "2": "زن"}
BIRTH_VCODE = "A5"    # Date, Shamsi (e.g. "1385" or "1385/05/14")


def _latest_answer(db, user_id: int, v_code: str):
    """Latest extracted_value for a v_code across the user's completed submissions."""
    row = (
        db.query(models.Response)
        .join(models.Submission, models.Response.submission_id == models.Submission.submission_id)
        .filter(
            models.Submission.user_id == user_id,
            models.Submission.status == "completed",
            models.Response.v_code == v_code,
        )
        .order_by(
            desc(models.Response.processed_at),
            desc(models.Response.response_id),
        )
        .first()
    )
    return (row.extracted_value or "").strip() if row else ""


def get_user_demographics(db, user_id: int):
    """Derive sex/age/birth date from the questionnaire answers (A4/A5).

    User table columns are no longer set at signup — demographics live in the
    questionnaire, so read them from responses. Tolerant to text values.
    """
    sex = None
    age = None
    birth_date_shamsi = None

    raw_sex = _latest_answer(db, user_id, SEX_VCODE)
    if raw_sex in ("1", "male", "مرد"):
        sex = "male"
    elif raw_sex in ("2", "female", "زن"):
        sex = "female"

    raw_birth = _latest_answer(db, user_id, BIRTH_VCODE)
    if raw_birth:
        try:
            from app.services.shamsi import parse_shamsi, calc_age, gregorian_to_shamsi_str
            g = parse_shamsi(raw_birth)
            if g:
                age = calc_age(g)
                birth_date_shamsi = gregorian_to_shamsi_str(g)
        except Exception:
            pass

    return {"sex": sex, "age": age, "birth_date_shamsi": birth_date_shamsi}


def _latest_completed_submission_ids(db, user_id: int):
    """
    Return latest completed submission_id per form.
    This avoids using old reopened/duplicate submissions.
    """
    submissions = (
        db.query(models.Submission)
        .filter(
            models.Submission.user_id == user_id,
            models.Submission.status == "completed",
        )
        .order_by(
            desc(models.Submission.updated_at),
            desc(models.Submission.created_at),
            desc(models.Submission.submission_id),
        )
        .all()
    )

    seen_forms = set()
    submission_ids = []

    for s in submissions:
        if s.form_id in seen_forms:
            continue
        seen_forms.add(s.form_id)
        submission_ids.append(s.submission_id)

    return submission_ids


def _latest_unique_responses(db, submission_ids):
    """
    Keep only the latest response for each logical answer.

    Logical answer key:
      (question_id or normalized v_code, normalized group_index)
    """
    if not submission_ids:
        return []

    rows = (
        db.query(models.Response)
        .filter(models.Response.submission_id.in_(submission_ids))
        .all()
    )

    latest = {}

    for r in rows:
        key = _response_dedupe_key(r)
        current = latest.get(key)

        if current is None:
            latest[key] = r
            continue

        if (_ts(r.processed_at), r.response_id or 0) > (
            _ts(current.processed_at),
            current.response_id or 0,
        ):
            latest[key] = r

    return list(latest.values())


def _build_health_payload(db, user_id: int):
    """
    Build deduplicated QA lines + latest transcripts for the health LLM.
    """
    submission_ids = _latest_completed_submission_ids(db, user_id)
    if not submission_ids:
        return None

    responses = _latest_unique_responses(db, submission_ids)
    if not responses:
        return None

    questions = db.query(models.Question).all()
    q_by_id = {q.question_id: q for q in questions}
    q_by_vcode = {q.v_code: q for q in questions}

    sections = db.query(models.Section).all()
    section_by_id = {s.section_id: s for s in sections}

    items = []

    for r in responses:
        raw_vcode = r.v_code or ""
        normalized_vcode = _normalize_vcode(raw_vcode)

        # Tolerant question lookup:
        # 1. by question_id
        # 2. by exact v_code
        # 3. by normalized v_code (D1_1 -> D1)
        q = (
            q_by_id.get(r.question_id)
            or q_by_vcode.get(raw_vcode)
            or q_by_vcode.get(normalized_vcode)
        )

        if not q:
            continue

        value = str(r.extracted_value or "").strip()

        # Skip empty answers.
        if not value:
            continue

        # N/A means logically not applicable; do not send it to health check.
        if value.upper() == "N/A":
            continue

        meta = {
            "v_code": q.v_code,
            "question_text_fa": q.question_text_fa or q.v_code,
            "response_type": q.response_type or "",
            "unit": q.unit or "",
            "coding_options": q.coding_options,
        }

        line = PromptGenerator._build_field_line(meta, value)

        group_index = _canonical_group_index(r.group_index)

        # Add a small hint for repeated/grouped items.
        # Only do this for actual grouped rows or rows that came from grouped keys.
        if r.group_index is not None or raw_vcode != normalized_vcode:
            line += f" [repeated item {group_index + 1}]"

        section = section_by_id.get(q.section_id)
        section_key = section.section_key if section else normalized_vcode

        items.append(
            {
                "section_sort": section.sort_order
                if section and section.sort_order is not None
                else 9999,
                "question_sort": q.sort_order if q.sort_order is not None else 0,
                "group_index": group_index,
                "response_id": r.response_id or 0,
                "line": line,
                "section_key": section_key,
                "transcript": r.transcript,
                "ts": _ts(r.processed_at),
            }
        )

    if not items:
        return None

    # Sort answers by form order so the LLM sees a coherent questionnaire.
    items.sort(
        key=lambda x: (
            x["section_sort"],
            x["question_sort"],
            x["group_index"],
            x["response_id"],
        )
    )

    qa_lines = [item["line"] for item in items]

    user = (
        db.query(models.User)
        .filter(models.User.user_id == user_id)
        .first()
    )

    if not user:
        return None

    demo = get_user_demographics(db, user_id)
    uinfo = {
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "sex": demo["sex"],
        "age": demo["age"],
        "birth_date_shamsi": demo["birth_date_shamsi"],
    }

    return uinfo, qa_lines


def generate_user_health_check_background(user_id: int):
    """
    Background worker: generates and stores the AI health check.
    Must use its own DB session.
    """
    db = SessionLocal()

    try:
        existing = (
            db.query(models.HealthCheck)
            .filter(models.HealthCheck.user_id == user_id)
            .first()
        )
        if existing:
            return

        if not is_health_check_eligible(db, user_id):
            return

        payload = _build_health_payload(db, user_id)
        if not payload:
            return

        uinfo, qa_lines = payload

        hc_data = PromptGenerator.generate_health_check(uinfo, qa_lines)

        summary = (hc_data.get("summary") or "").strip()
        report = hc_data.get("report")
        full_report = json.dumps(report, ensure_ascii=False) if report else ""

        if not summary and not full_report:
            return

        hc = models.HealthCheck(
            user_id=user_id,
            summary=summary or "چکاپ با موفقیت ایجاد شد.",
            full_report=full_report or summary or "چکاپ در دسترس نیست.",
            model_name=hc_data.get("model"),
            prompt_sent=hc_data.get("prompt"),
        )

        db.add(hc)
        db.commit()
        db.refresh(hc)

        user = (
            db.query(models.User)
            .filter(models.User.user_id == user_id)
            .first()
        )

        if user and user.email and send_health_email is not None:
            try:
                base_url = str(getattr(app_config, "APP_BASE_URL", "")).rstrip("/")
                link = f"{base_url}/health-check/{hc.check_id}"
                send_health_email(user.email, hc.summary, link)
            except Exception as mail_err:
                print(f"[health-check] email failed for user {user_id}: {mail_err}")

    except IntegrityError:
        db.rollback()
        print(f"[health-check] duplicate health check prevented for user {user_id}")
    except Exception as e:
        db.rollback()
        print(f"[health-check] background generation failed for user {user_id}: {e}")
    finally:
        db.close()


def queue_user_health_check(background_tasks: BackgroundTasks, user_id: int) -> bool:
    """
    Queue a user health check only once at a time (per process).
    Returns True if queued, False if already queued.
    """
    with _lock:
        if user_id in _queued_user_ids:
            return False
        _queued_user_ids.add(user_id)

    def _task():
        try:
            generate_user_health_check_background(user_id)
        finally:
            with _lock:
                _queued_user_ids.discard(user_id)

    try:
        background_tasks.add_task(_task)
    except Exception:
        with _lock:
            _queued_user_ids.discard(user_id)
        raise

    return True