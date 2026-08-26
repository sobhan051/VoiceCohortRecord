# Admin API

`app/routers/admin.py:1` — `prefix="/api/admin"`. No auth check on any route — **do not expose publicly** (see [Security](../operations/security.md)).

Helper: `_int(val)` (`admin.py:17`) — `int(val)` or `None` on failure.

---

## Stats

### `GET /api/admin/stats` — `admin.py:26`

```json
{
  "total_submissions":42,"completed_submissions":30,"draft_submissions":12,
  "total_users":15,"recent_submissions":3,
  "total_api_calls":128,"avg_confidence":0.86
}
```

- `recent_submissions`: `created_at >= now-7d` (`admin.py:41`)
- `avg_confidence`: `AVG(response.ai_confidence)` rounded to 2 decimals (`admin.py:49`)

---

## Submissions

### `GET /api/admin/submissions` — `admin.py:62`

`?limit=50&offset=0&status=draft|completed`

```json
[
  {
    "submission_id":"12","user_name":"سارا احمدی","national_code":"0012345678",
    "status":"draft","created_at":"2026-08-20T10:00:00","response_count":12
  }
]
```

Ordered by `created_at desc` (`admin.py:75`).

### `GET /api/admin/submission/{submission_id}` — `admin.py:99`

Detail + answers:

```json
{
  "submission_id":"12","status":"draft","created_at":"…","updated_at":"…",
  "user":{"user_id":"3","first_name":"سارا","last_name":"احمدی","national_code":"0012345678","phone_number":"0912…"},
  "responses":[
    {"response_id":"44","v_code":"A1","question_text":"سن شما چند سال است؟","extracted_value":"35","transcript":"سنم سی و پنج…","is_voice":true,"ai_confidence":0.95,"processed_at":"…"}
  ]
}
```

Transcript truncated to 200 chars + `…` in this view (`admin.py:138`).

### `DELETE /api/admin/submissions/{submission_id}` — `admin.py:502`

Deletes `Response`s + `ApiLog`s for that submission, then the `Submission`. Cascading is manual (no DB FK cascade).

### `DELETE /api/admin/responses/{response_id}` — `admin.py:521`

Deletes a single `Response`.

---

## Users

### `GET /api/admin/users` — `admin.py:161`

```json
[{"user_id":"3","first_name":"سارا","last_name":"احمدی","national_code":"0012345678","phone_number":"0912…","role":1,"submission_count":2,"created_at":"…"}]
```

Ordered by `created_at desc`.

### `POST /api/admin/user` — `admin.py:186`

Create user (no validation here — caller-provided):

```json
{"first_name":"سارا","last_name":"احمدی","national_code":"0012345679","phone_number":"0912…","role":1}
```

→ `{"success":true,"user_id":"4","message":"User created successfully"}`

### `PUT /api/admin/users/{user_id}` — `admin.py:487`

Update: fields `first_name`, `last_name`, `national_code`, `phone_number`, `role` — only those present in payload are set (`admin.py:496`). Promote with `{"role":2}`.

→ `{"success":true}`

### `DELETE /api/admin/user/{user_id}` — `admin.py:213`

Delete user. **No cascade** — orphan `Submission`s remain (FK not enforced with delete rule).

---

## Forms

### `GET /api/admin/forms` — `admin.py:241`

```json
[{"form_id":"1","form_name":"Cohort Baseline","category":"baseline"}]
```

Ordered by `form_name`.

### `POST /api/admin/forms` — `admin.py:254`

```json
{"form_name":"Follow-up","category":"followup"}
```

→ `{"success":true,"form_id":"2"}`

### `PUT /api/admin/forms/{form_id}` — `admin.py:270`

Updatable: `form_name`, `category`.

### `DELETE /api/admin/forms/{form_id}` — `admin.py:287`

Manually cascade-deletes `Section`s + `Question`s for that form, then the form (`admin.py:298`).

---

## Sections (scoped under a form)

### `GET /api/admin/forms/{form_id}/sections` — `admin.py:311`

```json
[{"section_id":"5","form_id":"1","section_key":"A","name_fa":"دموگرافیک","sort_order":0,"depends_on_vcode":null,"depends_on_value":null,"skip_if_vcode":null,"skip_if_value":null}]
```

Ordered by `sort_order`.

### `POST /api/admin/sections` — `admin.py:336`

```json
{
  "form_id":1,"section_key":"B","name_fa":"سوابق پزشکی","sort_order":1,
  "depends_on_vcode":"A4","depends_on_value":"1",
  "skip_if_vcode":null,"skip_if_value":null
}
```

`form_id` coerced via `_int()`.

### `PUT /api/admin/sections/{section_id}` — `admin.py:358`

Updatable: `section_key`, `name_fa`, `sort_order`, `depends_on_vcode/value`, `skip_if_vcode/value`, `form_id`.

### `DELETE /api/admin/sections/{section_id}` — `admin.py:378`

Deletes `Question`s for that section (by `section_id`), then the section.

---

## Questions (scoped under a section)

### `GET /api/admin/sections/{section_id}/questions` — `admin.py:398`

```json
[{
  "question_id":"10","section_id":"5","v_code":"A1","variable_name":"age",
  "question_text_fa":"سن شما چند سال است؟","response_type":"Numeric",
  "coding_options":null,"unit":"سال","manual_prompt":null,"sort_order":0,"group_pair":null
}]
```

Ordered by `sort_order`.

### `POST /api/admin/questions` — `admin.py:425`

```json
{
  "section_id":5,"v_code":"B1","variable_name":"diabetes",
  "question_text_fa":"آیا به دیابت مبتلا هستید؟","response_type":"Dichotomous",
  "coding_options":{"1":"بله","2":"خیر"},"unit":null,"manual_prompt":null,
  "sort_order":0,"group_pair":null
}
```

`section_id` via `_int()`, `v_code` is DB-unique — duplicate → SQL error returned as `{error: str(e)}`.

Grouped example: set `"group_pair":"meds"` on all med-related questions.

### `PUT /api/admin/questions/{question_id}` — `admin.py:448`

Updatable: `v_code`, `variable_name`, `question_text_fa`, `response_type`, `coding_options`, `unit`, `manual_prompt`, `sort_order`, `group_pair`, `section_id`.

### `DELETE /api/admin/questions/{question_id}` — `admin.py:468`

Deletes the question. Orphan `Response`s remain.

---

## Logs & export

### `GET /api/admin/api-logs?limit=100` — `admin.py:535`

```json
[{
  "log_id":"7","submission_id":"12","section_key":"A","model_name":"gemini-3-flash-preview",
  "tokens_used":1234,"created_at":"…",
  "prompt_preview":"You are a medical…","response_preview":"{\"transcript\":…"
}]
```

Ordered by `created_at desc`, previews truncated to 100 chars (`admin.py:552`).

### `GET /api/admin/export/submissions?format=json` — `admin.py:559`

```json
[{
  "submission_id":"12",
  "user":{"first_name":"سارا","last_name":"احمدی","national_code":"0012345678"},
  "status":"draft","created_at":"…",
  "responses":[{"v_code":"A1","extracted_value":"35","is_voice":true}]
}]
```

`format=json` returns `JSONResponse`; any other value returns `{"message":"CSV export coming soon"}` (`admin.py:598`) — CSV is a roadmap item.

---

## cURL cookbook

```bash
# forms
curl http://127.0.0.1:8000/api/admin/forms | jq
curl -X POST http://127.0.0.1:8000/api/admin/forms \
  -H "Content-Type: application/json" \
  -d '{"form_name":"Cohort Baseline","category":"baseline"}' | jq

# sections
curl http://127.0.0.1:8000/api/admin/forms/1/sections | jq
curl -X POST http://127.0.0.1:8000/api/admin/sections \
  -H "Content-Type: application/json" \
  -d '{"form_id":1,"section_key":"A","name_fa":"دموگرافیک","sort_order":0}' | jq

# questions
curl http://127.0.0.1:8000/api/admin/sections/1/questions | jq
curl -X POST http://127.0.0.1:8000/api/admin/questions \
  -H "Content-Type: application/json" \
  -d '{"section_id":1,"v_code":"A1","question_text_fa":"سن؟","response_type":"Numeric","unit":"سال","sort_order":0}' | jq

# users
curl http://127.0.0.1:8000/api/admin/users | jq
curl -X PUT http://127.0.0.1:8000/api/admin/users/1 \
  -H "Content-Type: application/json" -d '{"role":2}' | jq

# submissions + export
curl "http://127.0.0.1:8000/api/admin/submissions?limit=10&status=completed" | jq
curl http://127.0.0.1:8000/api/admin/api-logs?limit=20 | jq
curl "http://127.0.0.1:8000/api/admin/export/submissions?format=json" | jq
```
