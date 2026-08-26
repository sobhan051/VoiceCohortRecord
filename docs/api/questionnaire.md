# Questionnaire API

`app/routers/questionnaire.py:1` — form structure, voice processing, anomaly checks, and submission lifecycle.

---

## `GET /get-form-structure` — `questionnaire.py:23`

Sections + questions, ordered, with dependency metadata.

**Query** (optional): `?form_id=1` (string → `int`). If absent, returns **all** sections. `ValueError` on non-int is silently ignored (returns all).

**Response** — array of sections:

```json
[
  {
    "section_key":"A",
    "name_fa":"اطلاعات دموگرافیک",
    "depends_on_vcode":"A4",
    "depends_on_value":"1",
    "questions":[
      {
        "question_id":1,"section_id":1,"v_code":"A1","variable_name":"age",
        "question_text_fa":"سن شما چند سال است؟","response_type":"Numeric",
        "coding_options":null,"unit":"سال","manual_prompt":null,"sort_order":0,"group_pair":null
      }
    ]
  }
]
```

Ordering: sections by `sort_order`, questions per section by `sort_order` (`questionnaire.py:32`). Used by `static/app.js:34` to build `renderForm()` + `sectionMetaMap`.

---

## `POST /process-voice` — `questionnaire.py:396`

Upload section audio; returns transcript + extracted data + confidence.

**Request** — `multipart/form-data`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `section_key` | form | **Yes** | Must match a `Section.section_key` |
| `audio` | file | **Yes** | `Content-Type` must be in `audio/webm, audio/mp4, audio/ogg, audio/wav, audio/mpeg` (`questionnaire.py:413`) |
| `submission_id` | form | No | If present, responses are linked; validated as `int` + existence |
| `audio_format` | form | No | `webm`/`m4a`/… — logged, not used for processing |
| `bitrate` | form | No | `32000` etc. — logged |

**Server steps** (`questionnaire.py:424`):

1. Validate MIME + section + submission.
2. Save as `uploads/<uuid>.<ext>` (ext from MIME map).
3. `process_audio_file(original) → processed_path` (ffmpeg or fallback).
4. `PromptGenerator.process_audio(processed_path, questions)` (Gemini — see [AI Engine](../guides/ai-engine.md)).
5. For each `v_code` in `result.data` (`null` skipped): parse grouped `V_1` via `^(.+?)_(\d+)$`, lookup `Question` by base code, set `group_index` (`0` default for grouped), `upsert_response(db, sub_id, q, v_code, val, transcript, is_voice=True, confidence, group_index)`. Commit.
6. Delete both `file_path` and `processed_path` on success (`questionnaire.py:502`).

**Success** `200`:

```json
{
  "data":{"A1":"35","A4":"1","A9":"N/A"},
  "confidence":{"A1":0.95,"A4":1,"A9":1},
  "confidence_reasons":{"A1":"","A4":"","A9":"غیرمرتبط"}
}
```

**Errors** `200` with `{error: "…"}` (Persian):

- `فرمت صوتی پشتیبانی نمی‌شود…` (unsupported MIME)
- `سکشن مورد نظر یافت نشد` (section not found)
- `شناسه ثبت نامعتبر است` / `ثبت مورد نظر یافت نشد` (bad submission_id)
- Any Gemini/ffmpeg exception → `CRITICAL ERROR: …` printed, returned as `{error: str(e)}`

!!! note "Transcripts"
    `transcript` from Gemini is returned inside `data` handling but **not** in the HTTP response body as a top-level field — it's stored on `Response.transcript` for anomaly checks. The response only echoes `data`/`confidence`/`confidence_reasons`.

---

## `POST /check-section-anomalies` — `questionnaire.py:48`

Validate one section's answers; returns warnings.

**Request** `application/json`:

```json
{
  "section_key":"A",
  "answers":{"A1":"35","A4":"1","A9":"N/A"},
  "confidence_reasons":{"A1":"صدای ضعیف"},
  "submission_id":"12"
}
```

- `section_key` required; `answers` filtered to section's `v_codes` only.
- `submission_id` optional — if present, one `Response.transcript` is fetched for the prompt.

**Response**:

```json
{"warnings":[{"v_code":"A1","message":"سن ۲۰۰ سال غیرممکن است","severity":"critical"}]}
```

Empty `[]` if consistent. `{error:…}` on bad section or exception.

Source: `PromptGenerator.check_anomalies()` — see [Anomaly Detection](../guides/anomaly-detection.md).

---

## `POST /check-final-anomalies` — `questionnaire.py:120`

Cross-section validation over all answers at submit time.

**Request**:

```json
{
  "submission_id":"12",
  "answers":{"A1":"35","A4":"1","B3":"2"},
  "confidence_reasons":{"B3":"نامشخص"}
}
```

- `submission_id` required (`int` validated).
- `answers` grouped by `section_key` via `v_code → question → section` maps (`questionnaire.py:154`).
- Transcripts: latest per section from `Response.transcript` (`questionnaire.py:179`).

**Response**: same `{warnings:[…]}` shape.

Docs: `PromptGenerator.check_final_anomalies()` in [Anomaly Detection](../guides/anomaly-detection.md).

---

## `POST /start-submission` — `questionnaire.py:199`

Create or reuse a draft submission.

**Request** `application/json` — two modes:

```json
// by existing user_id
{"user_id":"3", "form_id":"1"}

// or inline user (reuse by national_code or create if new)
{"user":{"first_name":"سارا","last_name":"احمدی","national_code":"0012345678","phone_number":"0912…","role":1},"form_id":"1"}
```

| Field | Rule |
|---|---|
| `user_id` | if present, must exist as `User.user_id` |
| `user.national_code` | required if `user_id` absent/missing user |
| `form_id` | optional; if present must exist; else **first form** by `form_name` (`questionnaire.py:254`) |

**Resume logic** (`questionnaire.py:262`): reuse the most recent `Submission` for `(user_id, form_id)` ordered by `created_at desc`. If `completed`, reopen to `draft`. If none, create `draft`.

**Response**:

```json
{
  "submission_id":"12","user_id":"3","user_name":"سارا احمدی","national_code":"0012345678","status":"draft",
  "answers":{"A1":"35","D1_0":"متفورمین"},"confidence":{"A1":0.9},"answered_sections":["A"]
}
```

`answers` uses indexed keys for grouped items (`D1_0`), built from `Response` rows with `group_index`. Used by `static/app.js:164` to prefill + mark sections done.

Errors: `{error:"کد ملی الزامی است" | "کاربر یافت نشد" | "هیچ فرمی تعریف نشده است" | …}` — Persian.

---

## `POST /complete-submission` — `questionnaire.py:320`

Persist final answer set (including manual fields) and mark `completed`.

**Request**:

```json
{
  "submission_id":"12",
  "answers":{"A1":"35","A4":"1","D1_0":"متفورمین","D1_1":"لوزارتان"},
  "confidence":{"A1":0.9,"A4":1}
}
```

| Field | Notes |
|---|---|
| `submission_id` | required, `int` |
| `answers` | `{v_code: value}` — grouped as `V_1`; empty/null skipped |
| `confidence` | `{v_code: 0..1}` — stored as `Response.ai_confidence` |

For each `v_code`:

- Grouped match `^(.+?)_(\d+)$` → `base_vcode` + `group_index`; else plain.
- Lookup `Question` by base code (manual-only fields still link).
- `existing = query(submission_id, v_code, group_index)` — if `existing.extracted_value == str(value)` preserve `is_voice`, else `is_voice=False` (manual edit).
- `upsert_response(db, sub_id, q, v_code, value, is_voice, confidence, group_index)`.

After loop: `submission.status="completed"`, `updated_at=now()`, commit.

**Response**:

```json
{"success":true,"submission_id":"12","saved":14}
```

Errors: `{error:"submission_id الزامی است" | "ثبت مورد نظر یافت نشد"}`.
