# Installation

## Prerequisites

| Requirement | Version / Notes |
|---|---|
| Python | 3.10+ (tested on 3.10) |
| PostgreSQL | 14+ recommended. Supabase / Neon both work |
| ffmpeg | Optional but strongly recommended — on `PATH` or via `FFMPEG_PATH` |
| Gemini API key | At least one, from [Google AI Studio](https://aistudio.google.com/) |

> **No ffmpeg?** The app still runs — `process_audio_file()` falls back to the original upload (`app/services/audio_processor.py:44`). You just lose silence trimming + loudness normalization.

---

## 1. Clone & venv

```bash
git clone <repo-url>
cd VoiceCohortRecord

python -m venv venv
# Windows (PowerShell)
.\venv\Scripts\Activate.ps1
# Windows (cmd)
# venv\Scripts\activate.bat
# macOS / Linux
# source venv/bin/activate

pip install -r requirements.txt
```

`requirements.txt` (`requirements.txt:1`):

```
fastapi
uvicorn
sqlalchemy
psycopg2-binary
google-genai
python-dotenv
python-multipart
```

For docs (already in this repo's venv):

```bash
pip install mkdocs mkdocs-material
```

---

## 2. Database

Create a PostgreSQL database and note its DSN:

```bash
# local example
createdb vcr_v2_db
# DSN: postgresql://postgres:sobhan021@localhost:5432/vcr_v2_db
```

Tables are created automatically on app startup via `Base.metadata.create_all(bind=engine)` (`app/main.py:21`). There are **no Alembic migrations**.

You must then **seed** at least one `Form` + its `Section`s + `Question`s — otherwise `/get-form-structure` returns `[]` and the form renders empty. Seed via:

- Admin API (`POST /api/admin/forms`, `/sections`, `/questions`) — see [Admin API](../api/admin.md), or
- Direct SQL (restore from `backup-22-08-2026.sql` if provided in repo root), or
- `psql` inserts.

---

## 3. Environment file

Create `.env` in project root (gitignored):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/vcr_v2_db

# Gemini — any of these work, comma-separated for rotation:
GEMINI_API_KEYS=key1,key2
# or GEMINI_API_KEY=key1,key2
# or GOOGLE_API_KEY=key1

# optional tuning (see Configuration)
GENAI_FALLBACK_MODELS=gemini-3.1-flash-lite,gemini-3.5-flash
GENAI_TIMEOUT_MS=60000
GENAI_RETRY_BACKOFF_SECONDS=1.5
GENAI_OVERLOAD_RETRIES=1
FFMPEG_PATH=C:\path\to\ffmpeg.exe
GENAI_PROXY=http://127.0.0.1:1080
```

Full reference: [Configuration](configuration.md).

---

## 4. Run

=== "python main.py"

    ```bash
    python main.py
    # honors $PORT, binds 0.0.0.0 — for Render / HF Spaces
    ```

=== "uvicorn (dev)"

    ```bash
    uvicorn main:app --reload --host 127.0.0.1 --port 8000
    # or
    uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
    ```

Open:

- Signup — <http://127.0.0.1:8000/signup> (also `/`)
- Login — <http://127.0.0.1:8000/login>
- Dashboard — <http://127.0.0.1:8000/dashboard>
- Form — <http://127.0.0.1:8000/form>

> **Microphone requires a secure context.** `localhost` counts as secure. Any other host needs **HTTPS** or `getUserMedia` will be blocked.

---

## 5. Verify

```bash
# API liveness
curl http://127.0.0.1:8000/get-form-structure | jq

# Tests (no DB needed for unit tests)
pytest tests/ -v
```

Expected: `tests/test_audio_processor.py` and `tests/test_ai_engine_failover.py` pass without a DB or API key (they mock ffmpeg / genai).

---

## Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `sqlalchemy.exc.ArgumentError` on startup | `DATABASE_URL` unset | Set `.env` → restart |
| Form renders empty spinner forever | No seeded forms | Seed via Admin API / SQL |
| `ffmpeg not found; using original audio` in logs | ffmpeg not on PATH | Install or set `FFMPEG_PATH` |
| `429 RESOURCE_EXHAUSTED` on voice submit | Key quota exhausted | Add more keys to `GEMINI_API_KEYS` or wait |
| Mic button does nothing on LAN IP | Insecure context | Serve over HTTPS or SSH tunnel |
