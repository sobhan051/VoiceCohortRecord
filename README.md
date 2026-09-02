---
title: VCR — Voice Cohort Record
emoji: 🎙️
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# VCR — Voice Cohort Record

سیستم استخراج هوشمند داده‌های کوهرت با صدا

VCR is a voice-driven data collection platform for medical cohort studies. A
field worker reads or dictates a patient's answers into the microphone, and the
system uses Google Gemini to transcribe the speech, extract structured answers
for each question, score the confidence of every extracted value, and flag
clinically suspicious or contradictory responses — all in Persian (RTL).

The form structure is fully database-driven, so questionnaires, sections, and
questions can be changed without touching code. A role-based admin dashboard
provides platform statistics, submission browsing, user management, and AI
request logs, with full management APIs for forms, sections, and questions.

## Features

### Accounts & dashboards
- **Signup / login** via national code (10 digits) and optional phone number;
  role-based dashboards (`role=1` user, `role=2` admin).
- **User dashboard** (`/dashboard`) — personal submissions with completion
  progress, drafts, and open forms not yet started.
- **Admin dashboard** (same page, `role=2`) — platform-wide statistics
  (submissions, users, AI calls, average confidence) plus available forms.

### Management API (`/api/admin/*`)
- Full CRUD for **forms**, **sections**, and **questions**.
- Paginated submissions with detail modal, user management
  (create / update role / delete), AI request logs, and JSON export.
- No UI of its own beyond the dashboard stats — the endpoints are ready for a
  dedicated management UI.

### Voice-based data entry
- **Per-section voice recording** — each form section has its own "ثبت با صدا"
  button; the AI fills the fields automatically from spoken answers.
- **Automatic silence detection** — recording stops after ~4 s of silence,
  with a 3-second minimum length so short pauses don't cut you off.
- **Live volume meter** — real-time RMS meter, red when too quiet,
  orange/yellow when too loud.
- **Manual override** — every field remains editable by hand; editing a field
  clears its AI warning.
- **Draft submissions** — start a submission, fill sections incrementally,
  complete it when done (`POST /start-submission`, `/complete-submission`).

### Server-side audio preprocessing
- ffmpeg pipeline: silence trim → internal-silence collapse → EBU R128 loudness
  normalization → 16 kHz mono Opus/WebM (smaller uploads, better ASR).
- Graceful fallback: if ffmpeg is missing or fails, the original recording is
  used so a field worker never loses a take.

### AI extraction engine (Google Gemini)
- **Single-request extraction** — transcript, structured data, per-field
  confidence scores, and confidence reasons come back from one Gemini call per
  section, using a JSON response schema.
- **Type-aware prompting** — rules generated per question type:
  - *Categorical / Dichotomous* — exact integer option code.
  - *Numeric / Continuous* — value extraction with unit conversion
    (e.g. متر، میلی‌متر) to the question's expected unit.
  - *Date* — normalized to `YYYY-MM-DD` (year-only becomes `YYYY-01-01`).
  - *Text / MultiSelect* — exact phrase or comma-separated codes.
  - *Grouped questions* — repeated entries indexed as `V_1`, `V_2`, … for
    multi-item answers (e.g. several medications).
  - *Manual prompt override* — any question can carry a custom `manual_prompt`.
- **Conditional questions** — when the spoken answers make a question logically
  inapplicable (e.g. never smoked → quit age), the model returns `N/A` with
  confidence 1; the UI marks the field «غیرمرتبط» and counts it as resolved in
  the progress bar, and the anomaly checker never flags it.
- **Resilient API access**:
  - Round-robin rotation over multiple API keys (`GEMINI_API_KEYS`).
  - Retry with backoff on quota (429), transient overload (500/503), timeouts,
    and dropped connections.
  - **Model failover** — when the primary model reports "high demand", the call
    moves down a fallback chain (`GEMINI_FALLBACK_MODELS`,
    default `gemini-3.1-flash-lite,gemini-3.5-flash`).

### Clinical anomaly detection
- Per-section quality pass reviews answers for medically impossible values,
  contradictions, and suspicious combinations (e.g. male + pregnancy).
- Final cross-section pass at submit time catches contradictions *between*
  sections (e.g. "never smoked" vs. COPD medication).
- Low-confidence fields are passed forward as hints so the checker pays extra
  attention to them.
- Warnings are non-blocking: `{v_code, message (Persian), severity}` with
  severity of `warning` or `critical`.

### Warning UI
- Inline orange/red highlighting on flagged inputs, per-section badges, and a
  floating collapsible summary panel across the whole form.

### Conditional form logic
- Sections declare dependencies (`depends_on_vcode` / `depends_on_value`) and
  skip rules (`skip_if_vcode` / `skip_if_value`); visibility is re-evaluated
  live as fields are filled or edited.

### Infrastructure
- **CDN proxy** — Tailwind CSS and the Vazirmatn font are proxied through the
  server (`/cdn/tailwindcss`, `/cdn/vazirmatn`) and cached in memory, so the
  app works in restricted-network environments. Fetches honor an outbound proxy
  and fail gracefully.
- **Outbound proxy support** — both the Gemini client and the CDN fetcher
  respect `GENAI_PROXY`, `HTTP_PROXY`, or `HTTPS_PROXY`.
- **PostgreSQL persistence** via SQLAlchemy ORM with UUID primary keys and JSONB
  columns.
- **Concurrency-safe request handling** — all endpoints run blocking DB/AI work
  in FastAPI's threadpool (never on the event loop), and the engine uses a
  tuned, pre-pinged connection pool (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`,
  `DB_POOL_TIMEOUT`, `DB_POOL_RECYCLE` env knobs).

---

## Tech stack

| Layer     | Technology                                          |
|-----------|-----------------------------------------------------|
| Backend   | FastAPI, Uvicorn                                    |
| Database  | PostgreSQL, SQLAlchemy ORM                          |
| AI        | Google Gemini (`google-genai`) with key + model failover |
| Frontend  | Vanilla JS, Tailwind CSS (proxied), Vazirmatn font  |
| Audio     | Browser `MediaRecorder` + server-side ffmpeg        |
| Config    | python-dotenv                                       |

## Architecture

```
Browser (static/*.html + JS)
  │  signup / login (national code)
  ▼
GET /form ──► GET /get-form-structure ──► sections + questions (DB-driven)
  │  records audio per section
  ▼
POST /process-voice ──► audio_processor (ffmpeg) ──► ai_engine.process_audio()
  │                       returns {transcript, data, confidence, reasons}
  │  stores Response rows
  ▼
POST /check-section-anomalies ──► queues background sanity job ──► returns {check_id} at once
GET  /check-section-anomalies/result/{check_id} ──► {status, warnings} (polled by the client)

Admin (static/admin.html + admin.js) ──► /api/admin/* ──► PostgreSQL
```

## Project structure

```
VoiceCohortRecord/
├── main.py                  # Entrypoint shim (honors $PORT, binds 0.0.0.0)
├── app/
│   ├── main.py              # FastAPI app factory, routers, static mount
│   ├── models.py            # SQLAlchemy models (User, Form, Section, Question, ...)
│   ├── core/config.py       # Env loading, paths, models, keys, tuning knobs
│   ├── db/base.py           # Declarative Base
│   ├── db/session.py        # Engine, SessionLocal, get_db dependency
│   ├── routers/
│   │   ├── pages.py         # Page routes (/ , /form, /signup, /login, ...) + CDN proxy
│   │   ├── auth.py          # /api/signup, /api/login, /api/dashboard
│   │   ├── questionnaire.py # Form structure, voice processing, anomalies, submissions
│   │   └── admin.py         # /api/admin/* management API (CRUD, logs, export)
│   └── services/
│       ├── ai_engine.py     # Prompts, schemas, Gemini calls, key+model failover
│       ├── audio_processor.py # ffmpeg silence trim + loudnorm preprocessing
│       ├── cdn.py           # Cached CDN proxy fetcher
│       └── responses.py     # Response persistence helpers
├── static/                  # Vanilla JS frontend (RTL, Persian): signup,
│                            # login, dashboard, questionnaire (index.html)
├── tests/                   # pytest suite (audio processor, failover logic)
├── requirements.txt
├── Dockerfile               # python:3.10-slim + ffmpeg, uvicorn on $PORT
└── uploads/                 # Temporary audio files (gitignored, auto-cleaned)
```

## Data model

All primary keys are auto-increment integers.

| Model        | Purpose                                                                 |
|--------------|-------------------------------------------------------------------------|
| `User`       | Respondents/operators — name, national code (unique), phone, role (1=user, 2=admin). |
| `Form`       | A questionnaire definition (name, category).                            |
| `Section`    | A group of questions; supports conditional show/skip rules and ordering.|
| `Question`   | A single question — `v_code`, type, `coding_options` (JSONB), unit, optional `manual_prompt`, `group_pair`. |
| `Submission` | One filled questionnaire instance, with `draft`/`completed` status.     |
| `Response`   | A single answer — extracted value (+JSON variant), transcript, voice flag, AI confidence, group index. |
| `ApiLog`     | Record of each AI request — section, model, prompt, response, tokens.   |

Notable fields:
- `Question.coding_options` — JSONB map of option code → Persian label.
- `Section.depends_on_vcode` / `depends_on_value`, `skip_if_vcode` /
  `skip_if_value` — conditional visibility.
- `Response.is_voice` — whether the answer came from voice or manual entry.
- `Response.group_index` — index of repeated entries within a grouped question.

## Getting started

### Prerequisites
- Python 3.10+
- PostgreSQL
- ffmpeg on PATH (optional but recommended — see audio preprocessing)
- A Google Gemini API key

### Installation

```bash
git clone <repo-url>
cd VoiceCohortRecord

python -m venv venv
source venv/Scripts/activate    # Windows (bash) — use venv\Scripts\activate on cmd

pip install -r requirements.txt
```

### Configuration

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/vcr
GEMINI_API_KEYS=key1,key2          # or GEMINI_API_KEY / GOOGLE_API_KEY

# optional
GENAI_FALLBACK_MODELS=gemini-2.5-flash,gemini-2.0-flash
GENAI_TIMEOUT_MS=60000             # outbound HTTP timeout for Gemini calls
GENAI_RETRY_BACKOFF_SECONDS=1.5    # wait between transient-failure retries
GENAI_OVERLOAD_RETRIES=1           # extra retries after one pass over all keys
FFMPEG_PATH=C:\path\to\ffmpeg.exe  # otherwise found on PATH
GENAI_PROXY=http://your-proxy:port # outbound proxy for Gemini + CDN fetches
```

> The `.env` file is gitignored. Never commit API keys or credentials.

### Database

Tables are created automatically on startup via
`models.Base.metadata.create_all`. You still need to seed `forms`, `sections`,
and `questions` so the questionnaire has content to render.

### Run

```bash
python main.py
# or
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Then open:
- Signup — http://127.0.0.1:8000/signup
- Login — http://127.0.0.1:8000/login
- Dashboard — http://127.0.0.1:8000/dashboard
- Form — http://127.0.0.1:8000/form

> `/` serves the signup page by default.

> Microphone access requires a secure context. `localhost` is treated as
> secure by browsers; if you serve VCR from another host, use HTTPS or the mic
> will be blocked.

### Tests

```bash
pytest tests/
```

## Deployment

### Docker

```bash
docker build -t vcr .
docker run -p 8000:8000 --env-file .env vcr
```

### Hugging Face Spaces

1. Create a Space → SDK: **Docker** → push this repo to it.
   The frontmatter at the top of this README (`sdk: docker`,
   `app_port: 7860`) configures the build.
2. In Space **Settings → Variables and secrets**, set:
   - `GEMINI_API_KEYS` (secret) — comma-separated Gemini API keys.
   - `DATABASE_URL` (secret) — external PostgreSQL (HF Spaces has no managed
     DB; e.g. Neon/Supabase). Append `?sslmode=require` if the host demands TLS.
3. Tables auto-create on first boot — seed forms/sections/questions afterwards.

## API reference

### Pages
| Method | Path                | Description                        |
|--------|---------------------|------------------------------------|
| GET    | `/`                 | Landing page.                      |
| GET    | `/form`             | Questionnaire UI.                  |
| GET    | `/signup`, `/login` | Auth pages.                        |
| GET    | `/dashboard`        | Role-based dashboard UI (user or admin). |
| GET    | `/cdn/tailwindcss`  | Proxied Tailwind CSS.              |
| GET    | `/cdn/vazirmatn`    | Proxied Vazirmatn font CSS.        |

### Public / form (`questionnaire.py`)
| Method | Path                       | Description                                        |
|--------|----------------------------|----------------------------------------------------|
| GET    | `/get-form-structure`      | Sections + questions, ordered, with dependencies.  |
| POST   | `/process-voice`           | Upload section audio; returns transcript + data + confidence. |
| POST   | `/check-section-anomalies` | Validate one section's answers; returns warnings.  |
| POST   | `/check-final-anomalies`   | Cross-section validation over ALL answers.         |
| POST   | `/start-submission`        | Create a draft submission.                         |
| POST   | `/complete-submission`     | Mark a submission completed.                       |

### Auth (`auth.py`)
| Method | Path              | Description                                   |
|--------|-------------------|-----------------------------------------------|
| POST   | `/api/signup`     | Create user (national_code + phone validated).|
| POST   | `/api/login`      | Log in by national_code; returns user + role. |
| GET    | `/api/dashboard`  | Role-specific dashboard data (`?user_id=`).   |

### Admin (`admin.py`, prefix `/api/admin`)
| Method | Path                              | Description                              |
|--------|-----------------------------------|------------------------------------------|
| GET    | `/stats`                          | Dashboard statistics.                    |
| GET    | `/submissions`                    | List submissions (`limit`/`offset`/`status`). |
| GET    | `/submission/{id}`                | Full submission detail with answers.     |
| DELETE | `/submissions/{id}`               | Delete a submission.                     |
| DELETE | `/responses/{id}`                 | Delete a single response.                |
| GET    | `/users`                          | List users with submission counts.       |
| POST   | `/user`                           | Create a user.                           |
| PUT    | `/users/{id}`                     | Update a user.                           |
| DELETE | `/user/{id}`                      | Delete a user.                           |
| GET    | `/forms`                          | List forms.                              |
| POST   | `/forms`                          | Create a form.                           |
| PUT    | `/forms/{id}`                     | Update a form.                           |
| DELETE | `/forms/{id}`                     | Delete a form.                           |
| GET    | `/forms/{id}/sections`            | Sections of a form.                      |
| POST   | `/sections`                       | Create a section.                        |
| PUT    | `/sections/{id}`                  | Update a section.                        |
| DELETE | `/sections/{id}`                  | Delete a section.                        |
| GET    | `/sections/{id}/questions`        | Questions of a section.                  |
| POST   | `/questions`                      | Create a question.                       |
| PUT    | `/questions/{id}`                 | Update a question.                       |
| DELETE | `/questions/{id}`                 | Delete a question.                       |
| GET    | `/api-logs`                       | Recent AI request logs.                  |
| GET    | `/export/submissions`             | Export submissions (`format=json`).      |

## Security notes

- Login is national-code-only (no passwords) — treat this as identification,
  not authentication.
- The management endpoints under `/api/admin/*` have **no authorization
  check**. Do not expose this service publicly without adding access control,
  since it exposes patient data, allows user deletion, and reveals AI prompt
  logs. The dashboard only *hides* admin features client-side by role.
- Audio uploads are written to `uploads/` and removed after processing.
- Treat the database as containing PII (national codes, phone numbers) and
  protect it accordingly.

## Roadmap

- CSV export for submissions (JSON export is implemented).
- Passwords / proper sessions for login.
- Authorization checks for admin endpoints.
