"""Database engine, session factory, and the FastAPI ``get_db`` dependency."""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import DATABASE_URL

def _int_env(name, default):
    """Read an integer env knob, falling back to ``default`` when unset/invalid."""
    try:
        return int(os.getenv(name, "") or default)
    except (TypeError, ValueError):
        return default


# Connection pool sized for concurrent field workers. The defaults (5 + 10)
# exhaust quickly once several users hit the AI-backed endpoints at once, and
# each then blocks on ``pool_timeout`` until a connection frees up. PostgreSQL
# can handle far more than these limits; overflow connections are simply
# opened on demand and closed again when idle.
engine = create_engine(
    DATABASE_URL,
    pool_size=_int_env("DB_POOL_SIZE", 20),
    max_overflow=_int_env("DB_MAX_OVERFLOW", 40),
    pool_timeout=_int_env("DB_POOL_TIMEOUT", 30),
    # Drop connections older than 30 minutes so proxies/firewalls (and PG
    # itself) never hand back a silently dead socket mid-request.
    pool_recycle=_int_env("DB_POOL_RECYCLE", 1800),
    # Transparently test/reconnect on stale pooled connections (e.g. after a
    # database restart or a dropped idle connection) instead of erroring.
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
