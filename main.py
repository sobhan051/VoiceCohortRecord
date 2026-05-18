from fastapi import FastAPI, UploadFile, File, Form, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
import os
import shutil
import uuid
import httpx  # <-- NEW

# Local imports
import database
import models
import ai_engine

app = FastAPI()

models.Base.metadata.create_all(bind=database.engine)

app.mount("/static", StaticFiles(directory="static"), name="static")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ------------------------------------------------------------------------------
# Simple in‑memory cache for CDN resources
_cdn_cache = {}

async def _fetch_cdn_resource(url: str):
    if url in _cdn_cache:
        return _cdn_cache[url]

    proxy_url = os.getenv("GENAI_PROXY") or os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")
    transport = httpx.AsyncHTTPTransport(proxy=proxy_url) if proxy_url else None

    async with httpx.AsyncClient(transport=transport, follow_redirects=False) as client:
        resp = await client.get(url)
        # Manually follow relative redirects (e.g., Location: /3.4.17)
        while resp.status_code in (301, 302, 303, 307, 308):
            redirect_url = resp.headers.get('Location', '')
            if not redirect_url.startswith('http'):
                # Relative URL – resolve against the original base
                from urllib.parse import urljoin
                redirect_url = urljoin(url, redirect_url)
            resp = await client.get(redirect_url)

    resp.raise_for_status()
    content = resp.text
    _cdn_cache[url] = content
    return content

@app.get("/cdn/tailwindcss")
async def tailwind_css():
    """Proxy cdn.tailwindcss.com through the server."""
    content = await _fetch_cdn_resource("https://cdn.tailwindcss.com")
    return Response(content, media_type="application/javascript")


@app.get("/cdn/vazirmatn")
async def vazirmatn_css():
    """Proxy Vazirmatn font CSS from jsdelivr."""
    content = await _fetch_cdn_resource(
        "https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
    )
    return Response(content, media_type="text/css")
# ------------------------------------------------------------------------------

@app.get("/")
async def read_index():
    return FileResponse('static/index.html')

@app.get("/get-form-structure")
async def get_form(db: Session = Depends(database.get_db)):
    sections = db.query(models.Section).order_by(models.Section.sort_order).all()
    result = []
    for s in sections:
        qs = db.query(models.Question).filter(
            models.Question.section_id == s.section_id
        ).order_by(models.Question.sort_order).all()
        result.append({
            "section_key": s.section_key,
            "name_fa": s.name_fa,
            "questions": qs
        })
    return result

@app.post("/process-voice")
async def process_voice(
    section_key: str = Form(...),
    audio: UploadFile = File(...),
    db: Session = Depends(database.get_db)
):
    # 1. Find section & questions
    section = db.query(models.Section).filter(
        models.Section.section_key == section_key
    ).first()
    if not section:
        return {"error": "سکشن مورد نظر یافت نشد"}

    questions = db.query(models.Question).filter(
        models.Question.section_id == section.section_id
    ).all()

    # 2. Save audio to disk
    file_extension = audio.filename.split('.')[-1]
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)

    try:
        result = ai_engine.PromptGenerator.process_audio(file_path, questions)

        extracted_data = result.get('data', {})
        transcript_text = result.get('transcript', '')

        # 3. Save responses (submission_id is now optional)
        for v_code, val in extracted_data.items():
            if val is None:
                continue
            q = db.query(models.Question).filter(
                models.Question.v_code == v_code
            ).first()
            if q:
                new_response = models.Response(
                    question_id=q.question_id,
                    v_code=v_code,
                    extracted_value=str(val),
                    transcript=transcript_text,
                    is_voice=True
                )
                db.add(new_response)

        db.commit()
        return result

    except Exception as e:
        print(f"CRITICAL ERROR: {str(e)}")
        return {"error": str(e)}

    finally:
        # 4. Clean up uploaded file to save space
        try:
            os.remove(file_path)
        except OSError:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)