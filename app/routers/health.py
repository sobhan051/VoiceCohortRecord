"""Health check view + admin trigger."""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app import models
from app.core.config import APP_BASE_URL
from app.db.session import get_db
from app.services.shamsi import calc_age, gregorian_to_shamsi_str

router = APIRouter(prefix="/api")


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
        "full_report": hc.full_report,
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
        "full_report": hc.full_report,
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
async def admin_trigger_health(user_id: str, db: Session = Depends(get_db)):
    try:
        uid = int(user_id)
    except (ValueError, TypeError):
        return {"error": "شناسه نامعتبر"}
    user = db.query(models.User).filter(models.User.user_id == uid).first()
    if not user:
        return {"error": "کاربر یافت نشد"}
    existing = db.query(models.HealthCheck).filter(models.HealthCheck.user_id == uid).first()
    if existing:
        return {"error": "چکاپ قبلاً ایجاد شده و بازنویسی نمی‌شود", "check_id": str(existing.check_id)}
    total_forms = db.query(models.Form).count()
    if not total_forms:
        return {"error": "هیچ فرمی تعریف نشده"}
    completed = db.query(models.Submission).filter(models.Submission.user_id == uid, models.Submission.status == "completed").count()
    if completed < total_forms:
        return {"error": f"کاربر فقط {completed} از {total_forms} فرم را تکمیل کرده است"}
    # same generation as questionnaire trigger
    from app.core import config as _cfg
    from app.services.ai_engine import PromptGenerator
    from app.services.email import send_health_email
    subs = db.query(models.Submission).filter(models.Submission.user_id == uid, models.Submission.status == "completed").all()
    sub_ids = [s.submission_id for s in subs]
    responses = db.query(models.Response).filter(models.Response.submission_id.in_(sub_ids)).all() if sub_ids else []
    q_by_id = {q.question_id: q for q in db.query(models.Question).all()}
    sections_by_id = {s.section_id: s for s in db.query(models.Section).all()}
    qa_lines = []
    transcripts = {}
    for r in responses:
        q = q_by_id.get(r.question_id) or db.query(models.Question).filter(models.Question.v_code == r.v_code).first()
        if not q:
            continue
        qa_lines.append(PromptGenerator._build_field_line(
            {"v_code": r.v_code, "question_text_fa": q.question_text_fa or r.v_code,
             "response_type": q.response_type or "", "unit": q.unit or "", "coding_options": q.coding_options},
            r.extracted_value or ""
        ))
        if r.transcript:
            sk = sections_by_id.get(q.section_id).section_key if q.section_id in sections_by_id else r.v_code
            transcripts.setdefault(sk, r.transcript)
    uinfo = {"first_name": user.first_name, "last_name": user.last_name, "sex": user.sex,
             "age": calc_age(user.birth_date) if user.birth_date else None,
             "birth_date_shamsi": gregorian_to_shamsi_str(user.birth_date) if user.birth_date else None}
    if not qa_lines:
        return {"error": "پاسخی برای تحلیل یافت نشد"}
    hc_data = PromptGenerator.generate_health_check(uinfo, qa_lines, transcripts)
    hc = models.HealthCheck(user_id=uid, summary=hc_data["summary"] or "چکاپ ایجاد شد.", full_report=hc_data["full_report"] or hc_data["summary"],
                            model_name=hc_data.get("model"), prompt_sent=hc_data.get("prompt"))
    db.add(hc)
    db.commit()
    db.refresh(hc)
    if user.email:
        link = f"{_cfg.APP_BASE_URL.rstrip('/')}/health-check/{hc.check_id}"
        send_health_email(user.email, hc.summary, link)
    return {"success": True, "check_id": str(hc.check_id)}


# HTML page for full report
@router.get("/health-check-page/{check_id}", response_class=HTMLResponse)
async def health_page(check_id: str, db: Session = Depends(get_db)):
    try:
        cid = int(check_id)
    except:
        return HTMLResponse("<h1>شناسه نامعتبر</h1>", status_code=400)
    hc = db.query(models.HealthCheck).filter(models.HealthCheck.check_id == cid).first()
    if not hc:
        return HTMLResponse("<h1>چکاپ یافت نشد</h1>", status_code=404)
    user = db.query(models.User).filter(models.User.user_id == hc.user_id).first()
    age = calc_age(user.birth_date) if user and user.birth_date else "—"
    sex_fa = {"male": "مرد", "female": "زن"}.get(user.sex if user else "", "—")
    # simple markdown -> html (headings + paragraphs)
    import html as _html
    md = hc.full_report or ""
    lines = []
    for line in md.split("\n"):
        s = line.strip()
        if s.startswith("### "):
            lines.append(f"<h3 style='font-weight:700;margin-top:1.2em'>{_html.escape(s[4:])}</h3>")
        elif s.startswith("## "):
            lines.append(f"<h2 style='font-size:1.2em;font-weight:800;margin-top:1.4em;color:#1e40af'>{_html.escape(s[3:])}</h2>")
        elif s.startswith("# "):
            lines.append(f"<h1 style='font-size:1.4em;font-weight:800;color:#1e3a8a'>{_html.escape(s[2:])}</h1>")
        elif s.startswith("- ") or s.startswith("• "):
            lines.append(f"<li style='margin-right:1.2em'>{_html.escape(s[2:])}</li>")
        elif s.startswith("* ") :
            lines.append(f"<li style='margin-right:1.2em'>{_html.escape(s[2:])}</li>")
        elif s == "":
            lines.append("<br/>")
        else:
            lines.append(f"<p style='line-height:1.9'>{_html.escape(s)}</p>")
    body = "\n".join(lines)
    return HTMLResponse(f"""<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>چکاپ سلامت — VCR</title><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fontsource/vazirmatn@5.2.8/400.min.css" rel="stylesheet">
    <style>body{{font-family:Vazirmatn,sans-serif}}</style></head>
    <body class="bg-gray-50 text-gray-800"><header class="bg-white shadow-sm border-b sticky top-0 z-10"><div class="max-w-3xl mx-auto px-4 py-3 flex justify-between items-center"><a href="/dashboard" class="text-blue-600 font-bold">بازگشت به داشبورد</a><span class="text-sm text-gray-500">چکاپ #{hc.check_id}</span></div></header>
    <main class="max-w-3xl mx-auto px-4 py-8"><div class="bg-white rounded-3xl shadow-sm border p-6 md:p-8">
    <div class="flex flex-wrap gap-2 text-xs text-gray-500 mb-4"><span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-full">{sex_fa}</span><span class="bg-gray-100 px-3 py-1 rounded-full">{age} سال</span><span class="bg-gray-100 px-3 py-1 rounded-full">{hc.created_at.date() if hc.created_at else ""}</span></div>
    <div class="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6"><p class="font-bold text-blue-900 mb-1">خلاصه</p><p style="line-height:1.9">{_html.escape(hc.summary)}</p></div>
    <article class="prose max-w-none">{body}</article>
    <div class="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-900">این چکاپ توسط هوش مصنوعی تهیه شده و جایگزین نظر پزشک نیست. در صورت نگرانی به پزشک مراجعه کنید.</div>
    <button onclick="window.print()" class="mt-6 w-full bg-gray-900 text-white py-3 rounded-2xl">چاپ / ذخیره PDF</button>
    </div></main></body></html>""")
