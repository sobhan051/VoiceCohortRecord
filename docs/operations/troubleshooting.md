# Troubleshooting

## Startup

| Symptom | Likely cause | Fix |
|---|---|---|
| `sqlalchemy.exc.ArgumentError: Could not parse ...` or crash on import | `DATABASE_URL` unset/empty | Set `.env` → restart. `DATABASE_URL` is read at import time (`app/core/config.py:21` → `app/db/session.py:6`). |
| `psycopg2.OperationalError: connection refused / timeout` | Wrong host/port, firewall, missing `?sslmode=require` | `psql "$DATABASE_URL" -c "select 1"` to test. For Neon/Supabase add `?sslmode=require` (or `&sslmode=require`). |
| `FATAL: password authentication failed` | Bad user/pass, special chars not URL-encoded | URL-encode `@`, `:`, `/` in password, or use `urllib.parse.quote_plus`. |
| `ModuleNotFoundError: No module named 'google.genai'` | `google-genai` not installed or venv not active | `pip install google-genai` (import is `google.genai`, package is `google-genai`). |
| `ffmpeg not found; using original audio` in logs | ffmpeg not on `PATH` nor `FFMPEG_PATH` | Install ffmpeg or set `FFMPEG_PATH=C:\…\ffmpeg.exe`; restart. Pipeline still works with fallback, just less robust. |
| Port already in use | Another `uvicorn` on `:8000` | `lsof -i :8000` / `netstat -ano | findstr 8000`, kill, or `PORT=8001 python main.py`. |

---

## Database

| Symptom | Fix |
|---|---|
| Empty form — spinner forever, `GET /get-form-structure` returns `[]` | No seeded data. Seed via Admin API (`POST /api/admin/forms|sections|questions`) or restore `backup-22-08-2026.sql`: `psql "$DATABASE_URL" < backup-22-08-2026.sql`. |
| `duplicate key value violates unique constraint "questions_v_code_key"` | `v_code` must be globally unique. Check existing `SELECT v_code FROM questions;` before insert. |
| `relation "users" does not exist` | Tables not created. Ensure DB is reachable before first `create_all` (`app/main.py:21`). Check logs for silent engine failure. |
| Slow queries on dashboard | `GET /api/dashboard` (user) does `COUNT` per submission + per form. Add indexes on `responses.submission_id`, `sections.form_id`, `questions.section_id` if scaling. |
| Orphan `Response` after `DELETE /questions/{id}` | No DB cascade — `Response`s remain. Clean manually: `DELETE FROM responses WHERE question_id = ?;` or keep the question. |
| `api_logs` growing unbounded | No retention. Add cron: `DELETE FROM api_logs WHERE created_at < now() - interval '30 days';` |

---

## Gemini AI

| Symptom | Fix |
|---|---|
| `429 RESOURCE_EXHAUSTED` / `key #N out of quota; trying next key` | Quota per key exhausted. Add more keys to `GEMINI_API_KEYS` (comma-separated), or wait. Check quota in AI Studio → **Usage**. |
| `503 UNAVAILABLE` / `500 INTERNAL` / `model X overloaded; switching to Y` | Model temporarily overloaded. The code already rotates keys (`GENAI_RETRY_BACKOFF_SECONDS=1.5`) and fails over to `GEMINI_FALLBACK_MODELS`. If it persists, try a different primary: `GENAI_FALLBACK_MODELS=gemini-2.5-flash,gemini-2.0-flash`. |
| `TimeoutException` / `Server disconnected` | Network/proxy flakiness. Treated as transient and retried (`ai_engine.py:92`). Raise `GENAI_TIMEOUT_MS` (default `60000`) if behind slow proxy. Check `GENAI_PROXY` is correct and reachable. |
| Empty `data` / all `null` from `/process-voice` | Model couldn't extract. Check server logs `=== RAW RESPONSE ===` — if transcript is empty, audio was silent/too quiet. Re-record louder, closer to mic. If transcript is good but data null, question `response_type`/`coding_options` may mismatch speech. Review `manual_prompt` for that question. |
| `N/A` vs `null` confusion | `N/A` = logically inapplicable (gateway says "no"); `null` = not mentioned. If gateway not spoken, dependent must be `null`, not `N/A` (`ai_engine.py:605`). Adjust phrasing to say the gateway explicitly. |
| `confidence` always `1` | Model may be overconfident. Check `confidence_reasons` — if empty strings, it's confident. If fields were hard to hear, prompt engineering may need tuning (`ai_engine.py:618`). |
| No `ApiLog` rows | Logging is not automatic on every path — check `ai_engine` only logs when called; successful no-op paths may skip. |

### Proxy issues

```env
GENAI_PROXY=http://127.0.0.1:1080   # also checked: HTTP_PROXY, HTTPS_PROXY
```

- Test: `curl -x $GENAI_PROXY https://generativelanguage.googleapis.com` should connect.
- Both `ai_engine._build_client()` (`httpx.HTTPTransport`) and `cdn.fetch_cdn_resource()` (`httpx.AsyncHTTPTransport`) use it. If CDN proxy fails, Tailwind/Vazirmatn won't load when using `/cdn/*` paths — check `WARNING: Failed to fetch CDN resource …` in logs.

---

## Audio

| Symptom | Fix |
|---|---|
| `فرمت صوتی پشتیبانی نمی‌شود` error from `/process-voice` | `Content-Type` not in `audio/webm, audio/mp4, audio/ogg, audio/wav, audio/mpeg` (`questionnaire.py:413`). Check `MediaRecorder` MIME (`app.js:getBestAudioMimeType`). Try forcing `webm` or `mp4`. |
| Recording never auto-stops | Silence detection threshold too high for noisy env. Lower `SILENCE_THRESHOLD` (`app.js:11`) from `0.01` to `0.005`, or increase `SILENCE_DURATION_MS`. |
| Recording cuts off too early | `SILENCE_DURATION_MS=3500` may be too short for slow speakers. Raise to `5000`, or raise `MIN_RECORDING_MS=3000` guard. |
| Volume meter stuck at red (too quiet) | `rms < 0.005` → red. Mic gain too low or browser permission issue. Check OS mic volume, use wired mic, speak closer. `0.005` threshold is in `app.js:829`. |
| `ffmpeg failed (…); using original audio` | Check `ffmpeg -version` works. If `TimeoutExpired`, recording too long (>120s) — `subprocess.run(..., timeout=120)`. Trim silence may fail on very noisy files — original is still sent to Gemini. |
| `proc_*.webm` size 0 bytes | `ffmpeg` produced no output → fallback. Usually source was all silence. Re-record with speech. |
| Audio retry modal never appears on failure | `lastAudioBySection[sectionKey]` must be held. If cleared early, no retry. Check `sendAudioToServer` logs; `pendingRetrySection` must be set (`app.js:1027`). `Esc` closes modal. |

---

## Frontend

| Symptom | Fix |
|---|---|
| Mic button does nothing | `navigator.mediaDevices.getUserMedia` blocked. Serve over `https://` or `http://localhost` (secure context). Check browser site permissions → allow mic. Check console for `Mic access denied`. |
| `نشست کاربری یافت نشد → redirect to /login` on `/form` | `localStorage.vcr_user` missing. Sign up / log in again. Clear stale entry: `localStorage.removeItem('vcr_user')`. |
| Patient card shows `N/A` but progress counts it as answered | Correct — `N/A` is tagged `data-na="1"` and counted as answered (`app.js:572`). If you want `N/A` to not count, edit that branch. |
| Warning badge wrong count | `updateSectionBadges()` counts distinct warned `v_code`s (`app.js:1114`). If you see duplicate warnings per field, they are stacked in `fieldWarnings[v_code]` — `totalWarnings` sums all. Check `confidence_reasons` for duplicates. |
| Tailwind not loading / unstyled page | Public CDN blocked (common behind filters). Switch `static/*.html` to proxied `/cdn/tailwindcss` + `/cdn/vazirmatn` (uncomment lines) and set `GENAI_PROXY`. Clear cache. |
| Progress panel hidden on desktop | Panel is `right: 0` for RTL; on `<1024px` it slides off until `toggleProgressPanel()` adds `.open`. Check `#progress-panel.open` transform (`index.html:143`). |
| `showToast` not appearing | Toast container `#toast-container` at `bottom-24 left-24` (`index.html:316`) may be off-screen on small viewports. Check CSS. Auto-dismisses after 5s. |

---

## Deployment

| Symptom | Fix |
|---|---|
| `PORT` ignored on PaaS | Ensure start command uses `$PORT`: `uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}` (Docker `CMD` already does). `main.py` also honors `PORT` for `python main.py`. |
| `DATABASE_URL` with special chars fails in Docker | Quote the `-e` value or use `--env-file .env`. URL-encode `:` `@` `/` in password. |
| HF Space build fails | Check Space logs → **Build** tab. Ensure `sdk: docker` + `app_port: 7860` in README front-matter, `Dockerfile` at root, `requirements.txt` valid. |
| Space app crashes on boot | Check Space → **Logs**. Common: `DATABASE_URL` unset, `psycopg2` SSL error (add `?sslmode=require`), out-of-memory (rare; Tailwind runtime is light). |
| `uploads/` permission denied in Docker | `os.makedirs(UPLOAD_DIR, exist_ok=True)` creates it at runtime (`app/main.py:24`). Ensure Docker user has write on `/app/uploads`. |
| File not found on `FileResponse` (`static/*.html`) | `STATIC_DIR = BASE_DIR / "static"` (`config.py:16`). Ensure `static/` is copied in Docker (`COPY . .`). Don't run from a different `WORKDIR`. |

---

## Quick diagnostics

```bash
# liveness
curl http://127.0.0.1:8000/get-form-structure | jq length

# Gemini key order
python -c "from app.core.config import get_api_keys; print(get_api_keys())"

# proxy resolution
python -c "from app.core.config import get_proxy_url; print(get_proxy_url())"

# ffmpeg
ffmpeg -version | head -1
python -c "from app.services.audio_processor import get_ffmpeg; print(get_ffmpeg())"

# DB
psql "$DATABASE_URL" -c "select count(*) from forms; select count(*) from sections; select count(*) from questions;"

# logs (Docker)
docker logs <container> --tail 200 | grep -E "ai_engine|audio_processor|CRITICAL|Received audio"
```
