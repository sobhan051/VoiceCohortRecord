"""FastAPI application factory and wiring.

Single process serving both the JSON API and the static frontend.
"""
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app import models
from app.core.config import STATIC_DIR, UPLOAD_DIR
from app.db.base import Base
from app.db.session import engine
from app.routers import admin, pages, questionnaire


def create_app() -> FastAPI:
    app = FastAPI(title="Voice Cohort Record")

    # Tables are created on startup; there are no migrations.
    Base.metadata.create_all(bind=engine)

    # Ensure the temporary upload directory exists.
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    app.include_router(pages.router)
    app.include_router(questionnaire.router)
    app.include_router(admin.router)

    return app


app = create_app()
