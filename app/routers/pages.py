"""HTML page routes and the server-side CDN proxy."""
from fastapi import APIRouter
from fastapi.responses import FileResponse, RedirectResponse, Response

from app.core.config import STATIC_DIR
from app.services.cdn import fetch_cdn_resource

router = APIRouter()


@router.get("/")
async def read_index():
    """Redirect the root URL to the login page (default entry)."""
    return RedirectResponse(url="/login")


@router.get("/form")
async def questionnaire():
    """Serve the questionnaire form page"""
    return FileResponse(str(STATIC_DIR / "index.html"))


@router.get("/signup")
async def signup_page():
    """Serve the signup page"""
    return FileResponse(str(STATIC_DIR / "signup.html"))


@router.get("/login")
async def login_page():
    """Serve the login page"""
    return FileResponse(str(STATIC_DIR / "login.html"))


@router.get("/dashboard")
async def dashboard_page():
    """Serve the dashboard page (user or admin)"""
    return FileResponse(str(STATIC_DIR / "dashboard.html"))


@router.get("/health-check/{check_id}")
async def health_check_page(check_id: str):
    """Serve the health check report page (data fetched client-side)."""
    return FileResponse(str(STATIC_DIR / "health-check.html"))


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
