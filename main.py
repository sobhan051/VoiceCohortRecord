from fastapi import FastAPI, UploadFile, File, Form, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
from datetime import datetime, timedelta
import os
import shutil
import uuid
import httpx

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

    try:
        async with httpx.AsyncClient(
            transport=transport,
            follow_redirects=True,       # let httpx handle redirects automatically
            timeout=10.0                 # 10-second timeout
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content = resp.text
        _cdn_cache[url] = content
        return content
    except Exception as e:
        print(f"WARNING: Failed to fetch CDN resource {url}: {e}")
        # Return empty/fallback content so the page doesn't break
        if url.endswith('.css') or 'vazirmatn' in url:
            return '/* CDN fetch failed */'
        elif url.endswith('.js') or 'tailwindcss' in url:
            return '/* CDN fetch failed */'
        return ''


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
            "depends_on_vcode": s.depends_on_vcode,
            "depends_on_value": s.depends_on_value,
            "questions": qs
        })
    return result

@app.post("/check-section-anomalies")
async def check_section_anomalies(
    payload: dict,   # expects { "section_key": "...", "answers": {...} }
    db: Session = Depends(database.get_db)
):
    section_key = payload.get("section_key")
    answers = payload.get("answers", {})

    if not section_key:
        return {"error": "section_key is required"}

    # Find the section
    section = db.query(models.Section).filter(
        models.Section.section_key == section_key
    ).first()
    if not section:
        return {"error": "Section not found"}

    # Get questions for that section
    questions = db.query(models.Question).filter(
        models.Question.section_id == section.section_id
    ).all()

    # Build metadata for only those questions
    questions_meta = [
        {
            "v_code": q.v_code,
            "question_text_fa": q.question_text_fa,
            "response_type": q.response_type,
            "unit": q.unit,
            "coding_options": q.coding_options,
        }
        for q in questions
    ]

    # Filter answers to only include the section’s v_codes + perhaps gender (A4) for cross‑consistency
    relevant_vcodes = {q.v_code for q in questions}
    # Add gender if present (to catch male + pregnancy)
    if "A4" in answers:
        relevant_vcodes.add("A4")

    filtered_answers = {v: answers[v] for v in relevant_vcodes if v in answers}

    try:
        warnings = ai_engine.PromptGenerator.check_anomalies(filtered_answers, questions_meta)
        return {"warnings": warnings}
    except Exception as e:
        print(f"Per‑section anomaly check error: {e}")
        return {"error": str(e)}

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

    # 2. Build list of all sections for AI context
    all_sections = (
        db.query(models.Section.section_key, models.Section.name_fa)
        .order_by(models.Section.sort_order)
        .all()
    )
    sections_list = [{"section_key": s.section_key, "name_fa": s.name_fa} for s in all_sections]

    questions = db.query(models.Question).filter(
        models.Question.section_id == section.section_id
    ).all()

    # 3. Save audio to disk
    file_extension = audio.filename.split('.')[-1]
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)

    try:
        result = ai_engine.PromptGenerator.process_audio(file_path, questions, sections_list)

        extracted_data = result.get('data', {})
        transcript_text = result.get('transcript', '')

        # 4. Save responses
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

        # Return data plus additional AI insights
        return {
            "data": extracted_data,
            "confidence": result.get("confidence", {}),
            "confidence_reasons": result.get("confidence_reasons", {}),
            "skip_sections": result.get("skip_sections", []),
        }

    except Exception as e:
        print(f"CRITICAL ERROR: {str(e)}")
        return {"error": str(e)}

    finally:
        # 5. Clean up uploaded file
        try:
            os.remove(file_path)
        except OSError:
            pass



## admin panel 

@app.get("/admin")
async def admin_panel():
    """Serve admin panel HTML"""
    return FileResponse('static/admin.html')

@app.get("/api/admin/stats")
async def admin_stats(db: Session = Depends(database.get_db)):
    """Get dashboard statistics"""
    # Total submissions
    total_submissions = db.query(models.Submission).count()
    
    # Submissions by status
    completed = db.query(models.Submission).filter(models.Submission.status == 'completed').count()
    draft = db.query(models.Submission).filter(models.Submission.status == 'draft').count()
    
    # Total users
    total_users = db.query(models.User).count()
    
    # Recent submissions (last 7 days)
    week_ago = datetime.now() - timedelta(days=7)
    recent_submissions = db.query(models.Submission).filter(
        models.Submission.created_at >= week_ago
    ).count()
    
    # AI API calls
    total_api_calls = db.query(models.ApiLog).count()
    
    # Average confidence (if stored)
    avg_confidence = db.query(func.avg(models.Response.ai_confidence)).scalar() or 0
    
    return {
        "total_submissions": total_submissions,
        "completed_submissions": completed,
        "draft_submissions": draft,
        "total_users": total_users,
        "recent_submissions": recent_submissions,
        "total_api_calls": total_api_calls,
        "avg_confidence": round(float(avg_confidence), 2)
    }

@app.get("/api/admin/submissions")
async def admin_submissions(
    limit: int = 50,
    offset: int = 0,
    status: str = None,
    db: Session = Depends(database.get_db)
):
    """Get submissions list for admin panel"""
    query = db.query(models.Submission)
    
    if status:
        query = query.filter(models.Submission.status == status)
    
    submissions = query.order_by(desc(models.Submission.created_at)).offset(offset).limit(limit).all()
    
    result = []
    for sub in submissions:
        # Get user info
        user = db.query(models.User).filter(models.User.user_id == sub.user_id).first()
        
        # Count responses
        response_count = db.query(models.Response).filter(
            models.Response.submission_id == sub.submission_id
        ).count()
        
        result.append({
            "submission_id": str(sub.submission_id),
            "user_name": f"{user.first_name or ''} {user.last_name or ''}" if user else "Unknown",
            "national_code": user.national_code if user else "N/A",
            "status": sub.status,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
            "response_count": response_count
        })
    
    return result

@app.get("/api/admin/submission/{submission_id}")
async def admin_submission_detail(
    submission_id: str,
    db: Session = Depends(database.get_db)
):
    """Get detailed submission data"""
    from uuid import UUID
    
    try:
        sub_id = UUID(submission_id)
    except:
        return {"error": "Invalid submission ID"}
    
    submission = db.query(models.Submission).filter(
        models.Submission.submission_id == sub_id
    ).first()
    
    if not submission:
        return {"error": "Submission not found"}
    
    # Get user
    user = db.query(models.User).filter(models.User.user_id == submission.user_id).first()
    
    # Get all responses
    responses = db.query(models.Response).filter(
        models.Response.submission_id == sub_id
    ).all()
    
    # Get questions for context
    responses_data = []
    for resp in responses:
        question = db.query(models.Question).filter(
            models.Question.question_id == resp.question_id
        ).first()
        
        responses_data.append({
            "v_code": resp.v_code,
            "question_text": question.question_text_fa if question else "Unknown",
            "extracted_value": resp.extracted_value,
            "transcript": resp.transcript[:200] + "..." if resp.transcript and len(resp.transcript) > 200 else resp.transcript,
            "is_voice": resp.is_voice,
            "ai_confidence": resp.ai_confidence,
            "processed_at": resp.processed_at.isoformat() if resp.processed_at else None
        })
    
    return {
        "submission_id": str(submission.submission_id),
        "status": submission.status,
        "created_at": submission.created_at.isoformat() if submission.created_at else None,
        "updated_at": submission.updated_at.isoformat() if submission.updated_at else None,
        "user": {
            "user_id": str(user.user_id) if user else None,
            "first_name": user.first_name if user else None,
            "last_name": user.last_name if user else None,
            "national_code": user.national_code if user else None,
            "phone_number": user.phone_number if user else None
        } if user else None,
        "responses": responses_data
    }

@app.get("/api/admin/users")
async def admin_users(db: Session = Depends(database.get_db)):
    """Get all users"""
    users = db.query(models.User).order_by(models.User.created_at.desc()).all()
    
    result = []
    for user in users:
        # Count submissions for this user
        submission_count = db.query(models.Submission).filter(
            models.Submission.user_id == user.user_id
        ).count()
        
        result.append({
            "user_id": str(user.user_id),
            "first_name": user.first_name,
            "last_name": user.last_name,
            "national_code": user.national_code,
            "phone_number": user.phone_number,
            "role": user.role,
            "submission_count": submission_count,
            "created_at": user.created_at.isoformat() if user.created_at else None
        })
    
    return result

@app.post("/api/admin/user")
async def admin_create_user(
    user_data: dict,
    db: Session = Depends(database.get_db)
):
    """Create a new user"""
    try:
        new_user = models.User(
            first_name=user_data.get("first_name"),
            last_name=user_data.get("last_name"),
            national_code=user_data.get("national_code"),
            phone_number=user_data.get("phone_number"),
            role=user_data.get("role", 1)
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        return {
            "success": True,
            "user_id": str(new_user.user_id),
            "message": "User created successfully"
        }
    except Exception as e:
        return {"error": str(e)}

@app.delete("/api/admin/user/{user_id}")
async def admin_delete_user(
    user_id: str,
    db: Session = Depends(database.get_db)
):
    """Delete a user"""
    from uuid import UUID
    
    try:
        uid = UUID(user_id)
        user = db.query(models.User).filter(models.User.user_id == uid).first()
        
        if not user:
            return {"error": "User not found"}
        
        db.delete(user)
        db.commit()
        
        return {"success": True, "message": "User deleted successfully"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/admin/questions")
async def admin_questions(db: Session = Depends(database.get_db)):
    """Get all questions organized by section"""
    sections = db.query(models.Section).order_by(models.Section.sort_order).all()
    
    result = []
    for section in sections:
        questions = db.query(models.Question).filter(
            models.Question.section_id == section.section_id
        ).order_by(models.Question.sort_order).all()
        
        result.append({
            "section_id": str(section.section_id),
            "section_key": section.section_key,
            "section_name": section.name_fa,
            "questions": [
                {
                    "question_id": str(q.question_id),
                    "v_code": q.v_code,
                    "question_text_fa": q.question_text_fa,
                    "response_type": q.response_type,
                    "coding_options": q.coding_options,
                    "unit": q.unit,
                    "sort_order": q.sort_order
                }
                for q in questions
            ]
        })
    
    return result

@app.put("/api/admin/question/{question_id}")
async def admin_update_question(
    question_id: str,
    question_data: dict,
    db: Session = Depends(database.get_db)
):
    """Update a question"""
    from uuid import UUID
    
    try:
        qid = UUID(question_id)
        question = db.query(models.Question).filter(models.Question.question_id == qid).first()
        
        if not question:
            return {"error": "Question not found"}
        
        # Update fields
        if "question_text_fa" in question_data:
            question.question_text_fa = question_data["question_text_fa"]
        if "response_type" in question_data:
            question.response_type = question_data["response_type"]
        if "coding_options" in question_data:
            question.coding_options = question_data["coding_options"]
        if "unit" in question_data:
            question.unit = question_data["unit"]
        if "sort_order" in question_data:
            question.sort_order = question_data["sort_order"]
        
        db.commit()
        
        return {"success": True, "message": "Question updated successfully"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/admin/api-logs")
async def admin_api_logs(
    limit: int = 100,
    db: Session = Depends(database.get_db)
):
    """Get API call logs"""
    logs = db.query(models.ApiLog).order_by(desc(models.ApiLog.created_at)).limit(limit).all()
    
    result = []
    for log in logs:
        result.append({
            "log_id": str(log.log_id),
            "submission_id": str(log.submission_id) if log.submission_id else None,
            "section_key": log.section_key,
            "model_name": log.model_name,
            "tokens_used": log.tokens_used,
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "prompt_preview": log.prompt_sent[:100] + "..." if log.prompt_sent and len(log.prompt_sent) > 100 else log.prompt_sent,
            "response_preview": log.response_received[:100] + "..." if log.response_received and len(log.response_received) > 100 else log.response_received
        })
    
    return result

@app.get("/api/admin/export/submissions")
async def admin_export_submissions(
    format: str = "json",
    db: Session = Depends(database.get_db)
):
    """Export all submissions data"""
    submissions = db.query(models.Submission).all()
    
    export_data = []
    for sub in submissions:
        user = db.query(models.User).filter(models.User.user_id == sub.user_id).first()
        responses = db.query(models.Response).filter(
            models.Response.submission_id == sub.submission_id
        ).all()
        
        sub_data = {
            "submission_id": str(sub.submission_id),
            "user": {
                "first_name": user.first_name if user else None,
                "last_name": user.last_name if user else None,
                "national_code": user.national_code if user else None
            },
            "status": sub.status,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
            "responses": [
                {
                    "v_code": r.v_code,
                    "extracted_value": r.extracted_value,
                    "is_voice": r.is_voice
                }
                for r in responses
            ]
        }
        export_data.append(sub_data)
    
    if format == "json":
        from fastapi.responses import JSONResponse
        return JSONResponse(content=export_data)
    else:
        # For CSV, you'd need to implement
        return {"message": "CSV export coming soon"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)