# Deployment

## Docker (recommended)

`Dockerfile:1` is production-ready — `python:3.10-slim` + system `ffmpeg`.

```dockerfile
FROM python:3.10-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONUNBUFFERED=1
ENV PORT=7860
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}
```

### Build & run

```bash
docker build -t vcr .

# local
docker run -p 8000:8000 --env-file .env vcr

# or explicit env
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/vcr?sslmode=require" \
  -e GEMINI_API_KEYS="key1,key2" \
  -e GENAI_PROXY="http://proxy:8080" \
  vcr
```

`main.py:16` honors `$PORT` and binds `0.0.0.0` — required by PaaS routers. The image includes `ffmpeg` with `libopus` support; no extra setup.

### `.dockerignore`

`uploads/` and `venv/` are excluded from the build context (via `.dockerignore` if present) — temp audio never baked into the image.

---

## Hugging Face Spaces

This repo is ready for **Docker SDK** Spaces. The front-matter in `README.md:1` configures the build:

```yaml
---
sdk: docker
app_port: 7860
pinned: false
---
```

### Steps

1. **Create Space** → SDK: **Docker** → push this repo (or connect via GitHub).
   HF reads `app_port: 7860` and routes traffic to `PORT=7860`.
2. **Space → Settings → Variables and secrets** → set as **Secrets**:
   - `GEMINI_API_KEYS` — comma-separated keys
   - `DATABASE_URL` — external PostgreSQL (Spaces has no managed DB). Use Neon or Supabase; append `?sslmode=require` if the host demands TLS.
3. First boot: tables auto-create via `Base.metadata.create_all(bind=engine)` (`app/main.py:21`). Seed forms/sections/questions via Admin API or SQL restore.
4. Logs: **Space → Logs** shows `print()` lines from `ai_engine`, `audio_processor`, etc.

!!! warning "HF Spaces has no persistent disk"
    `uploads/` is ephemeral. That's fine — files are deleted after each successful `process-voice`. But if you store anything else on disk, use external storage.

### External DB — Neon / Supabase examples

```env
# Neon (pooler)
DATABASE_URL=postgresql://neondb_owner:npg_xxx@ep-xxx-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require

# Supabase pooler
DATABASE_URL=postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres

# Supabase direct
DATABASE_URL=postgresql://postgres:<pass>@db.<ref>.supabase.co:5432/postgres
```

Test connectivity before deploying: `psql "$DATABASE_URL" -c "select 1"`.

---

## Other PaaS — Render, Fly.io, Railway

Same Docker image works. Generic recipe:

```bash
# env vars to set on the platform
DATABASE_URL=postgresql://…
GEMINI_API_KEYS=key1,key2
GENAI_FALLBACK_MODELS=gemini-3.1-flash-lite,gemini-3.5-flash
GENAI_PROXY=http://proxy:port   # if needed
PORT=8000                       # or platform-default
```

- **Render**: Docker deploy or `uvicorn main:app --host 0.0.0.0 --port $PORT` as start command. Set env vars in **Environment**.
- **Fly.io**: `fly launch` with `Dockerfile`, `fly secrets set DATABASE_URL=… GEMINI_API_KEYS=…`.
- **Railway**: connect GitHub repo, set variables in **Variables**, deploy.

All platforms must honor `$PORT` — `main.py` already does.

---

## Bare-metal / VM

```bash
git clone <repo> && cd VoiceCohortRecord
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# .env as in Configuration
python main.py
# or systemd: ExecStart=/app/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
```

Put behind **Nginx/Caddy** for TLS (required for mic on non-localhost):

```nginx
server {
  listen 443 ssl;
  server_name vcr.example.com;
  ssl_certificate /etc/ssl/certs/vcr.crt;
  ssl_certificate_key /etc/ssl/private/vcr.key;
  location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 20m;  # audio uploads
  }
}
```

Increase `client_max_body_size` — recordings at 32 kbps are small, but WAV fallback can be larger.

---

## Environment & secrets

| Secret | Where to set |
|---|---|
| `DATABASE_URL` | PaaS env / Space Secret |
| `GEMINI_API_KEYS` | PaaS env / Space Secret (mark as secret, not variable) |
| `GENAI_PROXY` | PaaS env if outbound filtering exists |
| `FFMPEG_PATH` | Usually not needed inside Docker |

Never commit `.env` — it's gitignored. Rotate leaked keys immediately in Google AI Studio.

---

## Health & observability

- **Liveness**: `GET /get-form-structure` → `200` + `[]` or sections. No dedicated `/health` — add one if your orchestrator needs it.
- **Logs**: `print()` in `ai_engine.py` (`RAW RESPONSE`, `ANOMALY RAW`, key rotation), `audio_processor.py` (`ffmpeg failed`), `questionnaire.py` (`Received audio`, `CRITICAL ERROR`). Collect via `docker logs` / platform log stream.
- **DB**: monitor `api_logs` + `responses` table growth; `ApiLog` has no retention — add periodic cleanup if needed.
- **Backups**: `pg_dump "$DATABASE_URL" > backup.sql` — the repo's `backup-22-08-2026.sql` is an example. Schedule daily dumps.

---

## Scaling notes

- Single-process, no background workers — vertical scale first.
- `SessionLocal` is per-request via `get_db()` (`app/db/session.py:11`) — thread-safe under Uvicorn.
- `_KeyRotator` is process-local (`ai_engine.py:70`) — with multiple replicas, rotation is per-replica. That's fine; distribution is statistical.
- `cdn._cdn_cache` and `uploads/` are in-memory / local-disk — not shared across replicas. Sticky sessions not needed, but don't expect cache hits across instances.
