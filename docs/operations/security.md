# Security

!!! danger "Read this before exposing publicly"
    As shipped, this service is **not safe to expose on the public internet**. The gaps below are load-bearing — fix them before any production route.

## Current posture (as coded)

| Area | Status | File |
|---|---|---|
| **Authentication** | National-code-only, no password, no session/token | `app/models.py:8`, `app/routers/auth.py:19` |
| **Authorization** | None on `/api/admin/*` — any caller can list/delete PII | `app/routers/admin.py:1` |
| **Transport** | No TLS in app — relies on proxy/load balancer | `main.py:16` |
| **PII** | `national_code`, `phone_number`, transcripts, answers in DB | `app/models.py` |
| **Uploads** | Written to `uploads/` then deleted on success | `questionnaire.py:452` |
| **Secrets** | Env-driven (`DATABASE_URL`, `GEMINI_API_KEYS`) | `app/core/config.py:21` |
| **Rate limiting** | None | — |
| **Input validation** | Minimal — regex on signup, `int()` try/except elsewhere | `auth.py:29` |

### What the code says

```python
# app/routers/admin.py:1
"""Admin panel JSON API.
NOTE: these routes have no authentication and expose patient PII.
Do not expose this service publicly without adding access control."""
```

The dashboard only **hides** admin UI client-side by `role` (`static/dashboard.js`); the API does not enforce it.

---

## Checklist before public exposure

### 1. Add authentication

- Add `password_hash` to `User` (e.g. `bcrypt`), require it in `POST /api/signup` + `POST /api/login`.
- Issue a proper session: HTTP-only secure cookie or JWT with short expiry + refresh.
- Hash with `passlib[bcrypt]` or `argon2-cffi`; never store plaintext.

### 2. Gate admin routes

```python
# app/routers/admin.py — add dependency
from fastapi import Depends, HTTPException, Header

def require_admin(user_id: str = Header(None), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.user_id == int(user_id)).first()
    if not user or user.role != 2:
        raise HTTPException(403, "Admin required")
    return user

@router.get("/stats", dependencies=[Depends(require_admin)])
async def admin_stats(...): ...
```

Or centralize via `APIRouter(dependencies=[Depends(require_admin)])`. Prefer cookie/JWT-based identity over a header that the client can spoof.

### 3. TLS

- Terminate TLS at a reverse proxy (Nginx, Caddy, Cloudflare, PaaS). `localhost` is a secure context for mic, but any LAN/public host needs `https://` or `getUserMedia` is blocked.
- Set `Secure` + `HttpOnly` + `SameSite=Lax` on session cookies.

### 4. Harden the database

- Least-privilege DB user (no superuser). `GRANT` only needed tables.
- `?sslmode=require` for Neon/Supabase.
- Encrypt at rest (provider default) + regular `pg_dump` backups stored encrypted.
- Treat dumps/backups as PII — restrict access, redact `national_code` in exports if possible.

### 5. Validate & sanitize inputs

- National code: already `^\d{10}$` on signup, but login skips format check — align them.
- `phone_number`: already `^09\d{9}$` if present — good.
- `v_code`: globally unique — enforce `UNIQUE` at DB level (already) and return `409` not `500` on duplicate.
- Section/question payloads: validate `response_type` against an allowlist, `coding_options` as JSON object, `sort_order` as int.
- Audio upload: already validates MIME (`questionnaire.py:413`) but also limit `audio.size` (e.g. 20 MB) to prevent abuse.

### 6. Rate limiting & abuse

- Gemini calls cost money — rate-limit `POST /process-voice` per IP/user (e.g. `slowapi` or Nginx `limit_req`).
- Limit `POST /api/signup` to prevent enumeration.
- Set `client_max_body_size` on the proxy to cap uploads.

### 7. CORS & headers

- Currently no CORS middleware — add `CORSMiddleware` with an explicit allowlist, not `allow_origins=["*"]`.
- Security headers via proxy or `BaseHTTPMiddleware`:
  - `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
  - Content Security Policy that allows `cdn.jsdelivr.net` / `cdn.tailwindcss.com` if not proxied.

### 8. Logging & audit

- `ApiLog` records prompts + responses — includes PII/transcripts. Restrict `GET /api/admin/api-logs` to admin and truncate/redact in logs.
- Add an audit table for admin actions (`DELETE /user/{id}`, `DELETE /submissions/{id}`) with actor + timestamp.
- Never log `DATABASE_URL` or API keys (they can leak via error traces).

### 9. File handling

- `uploads/` files are removed on success (`questionnaire.py:502`) but **not** on error paths that raise before cleanup — add a `finally` or periodic reaper for orphan files.
- Validate file extension vs actual MIME — don't trust `audio.content_type` alone.
- Run the Uvicorn worker as non-root inside Docker (add `USER appuser`).

---

## PII handling

Data in the DB that is PII under most regimes:

- `users.national_code`, `users.phone_number`, `users.first_name/last_name`
- `responses.transcript` (verbatim speech may contain sensitive health info)
- `responses.extracted_value` (health answers)
- `api_logs.prompt_sent` / `response_received` (may repeat PII)

**Guidance**:

- Minimize retention — purge `api_logs` after a window (e.g. 30 days) or store only hashes for debugging.
- Exports (`GET /api/admin/export/submissions`) include `national_code` — gate and log access.
- Backups: encrypt, limit retention, test restore.

---

## Known non-issues (by design)

| Item | Why it's acceptable |
|---|---|
| `GEMINI_API_KEYS` in env | Standard for API keys; not in code. Use secret store on PaaS. |
| `uploads/` on local disk | Ephemeral by design; not user-visible. Cleaned on success. |
| Verbose `print()` logs | Useful on HF Spaces / Docker; disable or raise level in prod if they leak PII. |

---

## Roadmap (from README)

- [ ] CSV export (JSON exists) — ensure CSV redaction options.
- [ ] Passwords / proper sessions for login.
- [ ] Authorization checks for admin endpoints.

Track in `FIXES.md` and GitHub issues; block any public launch on the two auth items.
