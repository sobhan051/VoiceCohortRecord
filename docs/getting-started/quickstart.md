# Quick Start

Get from zero to a working voice-filled submission in ~5 minutes.

## 1. Start the server

```bash
pip install -r requirements.txt
# .env must have DATABASE_URL + at least one GEMINI key
python main.py
# → Uvicorn running on http://0.0.0.0:8000
```

Tables auto-create on first boot (`app/main.py:21`).

## 2. Seed a minimal questionnaire

The UI renders nothing until at least one `Form` with `Section`s and `Question`s exists. Use the Admin API (no auth — local only):

```bash
# 1) create form
curl -X POST http://127.0.0.1:8000/api/admin/forms \
  -H "Content-Type: application/json" \
  -d '{"form_name":"Cohort Baseline","category":"baseline"}'
# → {"success":true,"form_id":"1"}

# 2) create section
curl -X POST http://127.0.0.1:8000/api/admin/sections \
  -H "Content-Type: application/json" \
  -d '{"form_id":1,"section_key":"A","name_fa":"اطلاعات دموگرافیک","sort_order":0}'

# 3) create questions
curl -X POST http://127.0.0.1:8000/api/admin/questions \
  -H "Content-Type: application/json" \
  -d '{
    "section_id":1, "v_code":"A1", "variable_name":"age",
    "question_text_fa":"سن شما چند سال است؟",
    "response_type":"Numeric", "unit":"سال", "sort_order":0
  }'

curl -X POST http://127.0.0.1:8000/api/admin/questions \
  -H "Content-Type: application/json" \
  -d '{
    "section_id":1, "v_code":"A4", "variable_name":"gender",
    "question_text_fa":"جنسیت",
    "response_type":"Categorical",
    "coding_options":{"1":"زن","2":"مرد"},
    "sort_order":1
  }'
```

Alternatively restore `backup-22-08-2026.sql` if provided:

```bash
psql "$DATABASE_URL" < backup-22-08-2026.sql
```

Verify:

```bash
curl http://127.0.0.1:8000/get-form-structure | jq
```

## 3. Create a user & log in

Open <http://127.0.0.1:8000/signup> and sign up with a **10-digit national code** (e.g. `0012345678`) and optional `09…` phone. Or via API:

```bash
curl -X POST http://127.0.0.1:8000/api/signup \
  -H "Content-Type: application/json" \
  -d '{"first_name":"سارا","last_name":"احمدی","national_code":"0012345678","phone_number":"09123456789"}'

curl -X POST http://127.0.0.1:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"national_code":"0012345678"}'
# → {"success":true,"user":{"user_id":"1","role":1,...}}
```

The frontend stores the user in `localStorage.vcr_user` (`static/signup.js`, `static/dashboard.js`).

## 4. Fill the form by voice

1. Go to <http://127.0.0.1:8000/dashboard> — you should see your form card.
2. Click **شروع پرسشنامه / ادامه** → lands on `/form?form_id=1`.
3. Patient card at the top is pre-filled (read-only) from the session.
4. In section **A**, click **ثبت با صدا**, speak your answers in Persian (e.g. *«سنم سی و پنج ساله، جنسیتم زن»*), then stop.
5. Watch the live volume meter; recording auto-stops after ~3.5s of silence (`static/app.js:12`).
6. Fields populate with AI-extracted values + blue pulse; confidence below 1 shows reasoning.
7. An orange badge + floating warning panel appear if anomalies are detected.
8. Repeat for each section. Progress panel on the right tracks `answered / total` per section and overall %.

Manual override: click any field to edit — editing clears that field's warning (`static/app.js`).

## 5. Submit

1. Progress panel **ثبت نهایی** button enables once at least one answer exists.
2. Clicking it first runs `POST /check-final-anomalies` over all sections (cross-section contradictions).
3. If warnings exist they are shown but **do not block** — confirm to submit.
4. `POST /complete-submission` persists manual edits, marks status `completed` (`app/routers/questionnaire.py:320`).

Check in dashboard: admin sees it in `/api/admin/submissions`, user sees `status: completed` with `response_count / total_questions`.

## 6. Inspect in admin

Promote your user to admin (via API — no UI for this):

```bash
curl -X PUT http://127.0.0.1:8000/api/admin/users/1 \
  -H "Content-Type: application/json" \
  -d '{"role":2}'
```

Refresh `/dashboard` — now you see **platform stats** (submissions, users, AI calls, avg confidence) + admin panels for submissions, users, API logs, and form management.

---

## cURL cheat sheet

```bash
# form structure
curl "http://127.0.0.1:8000/get-form-structure?form_id=1" | jq

# dashboard for user
curl "http://127.0.0.1:8000/api/dashboard?user_id=1" | jq

# section anomaly check (manual)
curl -X POST http://127.0.0.1:8000/check-section-anomalies \
  -H "Content-Type: application/json" \
  -d '{"section_key":"A","answers":{"A1":"35","A4":"1"},"confidence_reasons":{}}' | jq

# final anomaly check
curl -X POST http://127.0.0.1:8000/check-final-anomalies \
  -H "Content-Type: application/json" \
  -d '{"submission_id":"1","answers":{"A1":"35","A4":"1"}}' | jq
```
