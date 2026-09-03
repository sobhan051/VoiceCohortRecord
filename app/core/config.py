"""Central configuration: env loading, filesystem paths, and proxy resolution.

Importing this module performs the single ``load_dotenv()`` for the whole app,
so any module that needs settings just imports from here.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env once, as early as possible.
load_dotenv()

# Project root (two levels up from app/core/config.py).
BASE_DIR = Path(__file__).resolve().parents[2]

STATIC_DIR = BASE_DIR / "static"
UPLOAD_DIR = BASE_DIR / "uploads"

# PostgreSQL DSN. database session creation crashes if this is unset.
DATABASE_URL = os.getenv("DATABASE_URL")

# Default Gemini models per call type.
AUDIO_MODEL = "gemini-3-flash-preview"
ANOMALY_MODEL = "gemini-3-flash-preview"
HEALTH_MODEL = os.getenv("GEMINI_HEALTH_MODEL", "gemini-3.1-flash-lite")

# Brevo email
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
BREVO_SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL")
BREVO_SENDER_NAME = os.getenv("BREVO_SENDER_NAME", "VCR")
def _clean_env_url(value):
    """Normalize a URL from the environment.

    Values pasted into deployment dashboards often arrive wrapped in quotes
    (\"https://...\") or padded with whitespace — both silently corrupt the
    email links built from APP_BASE_URL. Strip them once, here.
    """
    return (value or "").strip().strip('"').strip("'").strip()


# Public base URL used in email links. If this is missing/wrong when a health
# check is generated, the emailed link points at the wrong host forever (the
# target is stored inside the Brevo tracking URL at send time).
APP_BASE_URL = _clean_env_url(os.getenv("APP_BASE_URL")) or "http://127.0.0.1:8000"
MAIL_ENABLED = os.getenv("MAIL_ENABLED", "true").lower() not in ("0", "false", "no", "off")

# Models tried (in order) when the primary model returns transient overload
# ("high demand", 503/500). Full chain per call: [primary] + FALLBACK_MODELS.
FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",")
    if m.strip()
]

# Outbound HTTP timeout for Gemini calls (milliseconds). Audio extraction over a
# proxy can take a while; too low a value times out a healthy request and forces
# the field worker to re-record. Tunable via env.
GENAI_TIMEOUT_MS = int(os.getenv("GENAI_TIMEOUT_MS", "90000"))

# Failover/retry tuning for quota ("RESOURCE_EXHAUSTED", 429) and transient
# overload ("UNAVAILABLE", 503 / "INTERNAL", 500) errors.
# Seconds to wait before retrying after a transient overload error.
GENAI_RETRY_BACKOFF_SECONDS = float(os.getenv("GENAI_RETRY_BACKOFF_SECONDS", "1.5"))
# Extra retries (beyond one shot per key) for transient overload, used only when
# at least one key still has quota left.
GENAI_OVERLOAD_RETRIES = int(os.getenv("GENAI_OVERLOAD_RETRIES", "1"))


def get_proxy_url():
    """Optional outbound proxy honored by both the Gemini client and CDN proxy."""
    return os.getenv("GENAI_PROXY") or os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")


def get_api_keys():
    """Return the ordered list of Gemini API keys for round-robin failover.

    Accepts a comma-separated list in ``GEMINI_API_KEYS`` (preferred) or in the
    singular ``GEMINI_API_KEY`` / ``GOOGLE_API_KEY`` (which may itself hold a
    comma-separated list). Order is preserved and duplicates removed. An empty
    list means "no explicit key" — the genai client then falls back to its own
    environment lookup.
    """
    raw = (
        os.getenv("GEMINI_API_KEYS")
        or os.getenv("GEMINI_API_KEY")
    )
    keys = []
    for part in raw.split(","):
        k = part.strip()
        if k and k not in keys:
            keys.append(k)
    return keys