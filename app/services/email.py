"""Brevo email sender for health checkups."""
import requests

from app.core import config


def send_health_email(to_email: str, summary: str, link: str) -> dict | None:
    if not config.MAIL_ENABLED:
        print("[email] MAIL_ENABLED=false — skipping send")
        return None
    if not to_email:
        print("[email] no recipient — skipping")
        return None
    if not config.BREVO_API_KEY:
        print("[email] BREVO_API_KEY not set — skipping")
        return None
    html = f"""
    <div dir="rtl" style="font-family: Vazirmatn, Tahoma, sans-serif; line-height:1.8; color:#1f2937; max-width:600px; margin:auto;">
      <h2 style="color:#2563eb;">خلاصه چکاپ سلامت شما</h2>
      <p style="background:#f0f7ff; border-radius:12px; padding:16px; white-space:pre-wrap;">{summary}</p>
      <p style="margin-top:20px;">
        <a href="{link}" style="display:inline-block; background:#2563eb; color:#fff; padding:12px 28px; border-radius:12px; text-decoration:none; font-weight:bold;">مشاهده چکاپ کامل</a>
      </p>
      <p style="color:#9ca3af; font-size:12px; margin-top:24px;">این چکاپ توسط هوش مصنوعی تهیه شده و جایگزین نظر پزشک نیست.</p>
    </div>
    """
    try:
        r = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": config.BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json"},
            json={
                "sender": {"name": config.BREVO_SENDER_NAME, "email": config.BREVO_SENDER_EMAIL},
                "to": [{"email": to_email}],
                "subject": "خلاصه چکاپ سلامت شما — VCR",
                "htmlContent": html,
            },
            timeout=30,
        )
        print(f"[email] Brevo {r.status_code}: {r.text[:300]}")
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[email] failed: {e}")
        return None
