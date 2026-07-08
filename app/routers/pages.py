"""HTML page routes and the server-side CDN proxy."""
from fastapi import APIRouter
from fastapi.responses import FileResponse, Response

from app.core.config import STATIC_DIR
from app.services.cdn import fetch_cdn_resource

router = APIRouter()


@router.get("/")
async def read_index():
    """Serve the dashboard page (login + role-based dashboard)"""
    return FileResponse(str(STATIC_DIR / "dashboard.html"))


@router.get("/form")
async def questionnaire():
    """Serve the questionnaire form page"""
    return FileResponse(str(STATIC_DIR / "index.html"))


@router.get("/cdn/tailwindcss")
async def tailwind_css():
    """Proxy cdn.tailwindcss.com through the server."""
    content = await fetch_cdn_resource("https://cdn.tailwindcss.com")
    return Response(content, media_type="application/javascript")


@router.get("/cdn/vazirmatn")
async def vazirmatn_css():
    """Proxy Vazirmatn font CSS from jsdelivr."""
    content = await fetch_cdn_resource(
        "https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
    )
    return Response(content, media_type="text/css")
