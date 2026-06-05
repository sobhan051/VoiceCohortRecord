# TODO
- [x] PWA
- [x] audio process retry & R-R
- [ ] fix ui when asking to resend the audio (timeout)
- [ ] save audio in database
- [ ] audio cleaning / filtering
- [ ] improve prompts
- [ ] fix questions loading 

# VCR — Voice Cohort Record

سیستم استخراج هوشمند داده‌های کوهرت با صدا

VCR is a voice-driven data collection platform for medical cohort studies. A
field worker reads or dictates a patient's answers into the microphone, and the
system uses Google Gemini to transcribe the speech, extract structured answers
for each question, score the confidence of every extracted value, and flag
clinically suspicious or contradictory responses — all in Persian (RTL).

The form structure is fully database-driven, so questionnaires, sections, and
questions can be changed without touching code. An admin panel provides
dashboards, submission browsing, user management, and AI request logs.

---

## Features

### Voice-based data entry
- **Per-section voice recording** — each form section has its own "ثبت با صدا"
  (record with voice) button. The speaker answers the questions in that section
  out loud and the AI fills the fields automatically.
- **Automatic silence detection** — recording stops on its own after 4 seconds
  of silence (configurable), with a 3-second minimum recording length so short
  pauses don't cut you off.
- **Live volume meter** — a real-time RMS-based meter shows input level while
  recording, turning red when the signal is too quiet and orange/yellow when
  too loud.
- **Floating stop button** — a persistent control to end recording from
  anywhere on the page.
- **Manual override** — every field remains editable by hand; editing a field
  manually clears any AI warning attached to it.

### AI extraction engine (Google Gemini)
- **Single-request extraction** — transcript, structured data, confidence
  scores, and confidence reasons are all returned from one Gemini call per
  section (using a JSON response schema), instead of multiple round-trips.
- **Type-aware prompting** — the prompt generator builds field-specific rules
  per question type:
  - *Categorical / Dichotomous* — returns the exact integer option code.
  - *Numeric / Continuous* — extracts the number and converts spoken units
    (e.g. متر، میلی‌متر) to the question's expected unit.
  - *Date* — normalizes to `YYYY-MM-DD` (year-only becomes `YYYY-01-01`).
  - *Text / MultiSelect* — returns the exact phrase or selected codes.
  - *Manual prompt override* — any question can carry a custom `manual_prompt`
    that replaces the generated rule.
- **Confidence scoring** — every extracted field gets a 0–1 confidence value
  plus a short human-readable reason explaining why confidence is below 1.
- **Audio handling** — uploaded audio is saved to `uploads/`, sent to Gemini as
  inline bytes, and deleted after processing.

### Clinical anomaly detection
- After a section is filled, answers are sent to a second Gemini "quality
  control" pass that reviews them for medically impossible values,
  contradictions, and suspicious combinations (e.g. male + pregnancy).
- Low-confidence fields from the extraction step are passed forward as hints so
  the anomaly checker pays extra attention to them.
- Warnings are **non-blocking** and returned as structured items with a
  `v_code`, a Persian `message`, and a `severity` of `warning` or `critical`.

### Warning UI
- **Inline field highlighting** — flagged inputs get an orange (warning) or red
  (critical) border.
- **Per-section badges** — each section header shows a count of fields with
  warnings.
- **Floating warning summary panel** — a collapsible list of every active
  warning across the form, with its field code and message.

### Conditional form logic
- Sections can declare dependencies (`depends_on_vcode` / `depends_on_value`)
  so a section only appears when a parent answer matches a given value.
- Visibility is re-evaluated live as the AI fills fields or the user edits them.

### Admin panel (`/admin`)
- **Dashboard** — total submissions, completed vs. draft counts, registered
  users, total AI API calls, average AI confidence, and submissions in the last
  7 days, with progress-bar breakdowns.
- **Submissions** — paginated list of all submissions with user, national code,
  date, status, and response count; a detail modal shows every answer, its
  transcript, voice/manual source, and AI confidence.
- **Users** — list users with submission counts, add new users, and delete
  users.
- **Questions** — browse all questions grouped by section with their type,
  unit, and order (inline editing is exposed via the API; the UI edit dialog is
  marked as upcoming).
- **AI logs** — view recent API calls with section, model, token usage, and
  truncated prompt/response previews.
- **Settings** — adjust recording timing and AI model preferences (stored
  client-side).
- **Export** — JSON export of all submissions and their responses (CSV planned).

### Infrastructure
- **CDN proxy** — Tailwind CSS and the Vazirmatn font are proxied through the
  server (`/cdn/tailwindcss`, `/cdn/vazirmatn`) and cached in memory, so the
  app works in restricted-network environments. Fetches honor an outbound proxy
  and fail gracefully.
- **Outbound proxy support** — both the Gemini client and the CDN fetcher
  respect `GENAI_PROXY`, `HTTP_PROXY`, or `HTTPS_PROXY`.
- **PostgreSQL persistence** via SQLAlchemy ORM with UUID primary keys and JSONB
  columns.

---

## Tech stack

| Layer       | Technology                                          |
|-------------|-----------------------------------------------------|
| Backend     | FastAPI, Uvicorn                                    |
| Database    | PostgreSQL, SQLAlchemy ORM                          |
| AI          | Google Gemini (`google-genai`) — Flash & Flash-Lite |
| Frontend    | Vanilla JS, Tailwind CSS (proxied), Vazirmatn font  |
| Audio       | Browser `MediaRecorder` + Web Audio API             |
| Config      | python-dotenv                                       |

---

## Architecture

```
Browser (static/index.html + app.js)
  │  records audio per section
  ▼
POST /process-voice ──► ai_engine.process_audio() ──► Gemini (flash-lite)
  │                         returns {transcript, data, confidence, reasons}
  │  stores Response rows
  ▼
POST /check-section-anomalies ──► ai_engine.check_anomalies() ──► Gemini (flash)
                                    returns [{v_code, message, severity}]

Admin (static/admin.html + admin.js) ──► /api/admin/* ──► PostgreSQL
```

---

## Project structure

```
VoiceCohortRecord/
├── main.py            # FastAPI app: routes for voice, anomalies, admin API, CDN proxy
├── ai_engine.py       # PromptGenerator: prompt building, Gemini calls, schemas
├── models.py          # SQLAlchemy models (User, Form, Section, Question, ...)
├── database.py        # Engine, session, get_db dependency
├── requirements.txt   # Python dependencies
├── static/
│   ├── index.html     # Voice questionnaire UI (RTL, Persian)
│   ├── app.js         # Recording, AI result application, warning UI
│   ├── admin.html     # Admin panel shell + sidebar
│   └── admin.js       # Admin dashboard, submissions, users, questions, logs
└── uploads/           # Temporary audio files (gitignored, auto-cleaned)
```

---

## Data model

| Model        | Purpose                                                                 |
|--------------|-------------------------------------------------------------------------|
| `User`       | Respondents/operators — name, national code (unique), phone, role.      |
| `Form`       | A questionnaire definition (name, category).                            |
| `Section`    | A group of questions; supports conditional show/skip rules and ordering.|
| `Question`   | A single question — `v_code`, type, `coding_options` (JSONB), unit, optional `manual_prompt`. |
| `Submission` | One filled questionnaire instance, with `draft`/`completed` status.     |
| `Response`   | A single answer — extracted value, transcript, voice flag, AI confidence.|
| `ApiLog`     | Record of each AI request — section, model, prompt, response, tokens.   |

Notable fields:
- `Question.coding_options` — JSONB map of option code → Persian label.
- `Section.depends_on_vcode` / `depends_on_value` — conditional visibility.
- `Response.is_voice` — whether the answer came from voice or manual entry.

---

## Getting started

### Prerequisites
- Python 3.10+
- PostgreSQL
- A Google Gemini API key

### Installation

```bash
# clone and enter the project
git clone <repo-url>
cd VoiceCohortRecord

# create and activate a virtual environment
python -m venv venv
source venv/Scripts/activate    # Windows (bash) — use venv\Scripts\activate on cmd

# install dependencies
pip install -r requirements.txt
```

### Configuration

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/vcr
GOOGLE_API_KEY=your_gemini_api_key

# optional: outbound proxy for Gemini and CDN fetches
GENAI_PROXY=http://your-proxy:port
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
- Questionnaire — http://127.0.0.1:8000/
- Admin panel — http://127.0.0.1:8000/admin

> Microphone access requires a secure context. `localhost` is treated as
> secure by browsers; if you serve VCR from another host, use HTTPS or the mic
> will be blocked.

---

## API reference

### Public / form
| Method | Path                       | Description                                       |
|--------|----------------------------|---------------------------------------------------|
| GET    | `/`                        | Serve the questionnaire UI.                       |
| GET    | `/get-form-structure`      | Sections + questions, ordered, with dependencies. |
| POST   | `/process-voice`           | Upload section audio; returns data + confidence.  |
| POST   | `/check-section-anomalies` | Validate a section's answers; returns warnings.   |
| GET    | `/cdn/tailwindcss`         | Proxy for Tailwind CSS.                           |
| GET    | `/cdn/vazirmatn`           | Proxy for the Vazirmatn font CSS.                 |

### Admin
| Method | Path                                | Description                          |
|--------|-------------------------------------|--------------------------------------|
| GET    | `/admin`                            | Serve the admin panel.               |
| GET    | `/api/admin/stats`                  | Dashboard statistics.                |
| GET    | `/api/admin/submissions`            | List submissions (`limit`/`offset`/`status`). |
| GET    | `/api/admin/submission/{id}`        | Full submission detail with answers. |
| GET    | `/api/admin/users`                  | List users with submission counts.   |
| POST   | `/api/admin/user`                   | Create a user.                       |
| DELETE | `/api/admin/user/{id}`              | Delete a user.                       |
| GET    | `/api/admin/questions`              | Questions grouped by section.        |
| PUT    | `/api/admin/question/{id}`          | Update a question.                   |
| GET    | `/api/admin/api-logs`               | Recent AI request logs.              |
| GET    | `/api/admin/export/submissions`     | Export submissions (`format=json`).  |

---

## Security notes

- The admin endpoints under `/api/admin/*` and the `/admin` page currently have
  **no authentication or authorization**. Do not expose this service publicly
  without adding access control (e.g. an auth layer / reverse proxy), since it
  exposes patient data, allows user deletion, and reveals AI prompt logs.
- Audio uploads are written to `uploads/` and removed after processing.
- Treat the database as containing PII (national codes, phone numbers) and
  protect it accordingly.

---

## Roadmap

- CSV export for submissions (JSON export is implemented).
- In-panel question editing UI (the update API already exists).
- Configurable AI model selection wired to the backend.
- Authentication and role-based access for the admin panel.
