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

# The google-genai client reads GOOGLE_API_KEY / GEMINI_API_KEY from the env
# directly; we don't pass it explicitly.

# Default Gemini models per call type.
AUDIO_MODEL = "gemini-2.5-flash-lite"
ANOMALY_MODEL = "gemini-2.5-flash"

# Outbound HTTP timeout for Gemini calls (milliseconds).
GENAI_TIMEOUT_MS = 60_000


def get_proxy_url():
    """Optional outbound proxy honored by both the Gemini client and CDN proxy."""
    return os.getenv("GENAI_PROXY") or os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")
