# Form Engine

Forms are **fully database-driven**. No hardcoded questionnaire — add/edit forms, sections, questions via DB or Admin API and the frontend renders them automatically.

## Hierarchy

```
Form (form_name, category)
 └─ Section (section_key, name_fa, sort_order, depends_on/skip_if)
     └─ Question (v_code, question_text_fa, response_type, coding_options, unit, manual_prompt, group_pair, sort_order)
```

- **Form** — a questionnaire version (e.g. *Cohort Baseline*). `form_id` is FK on both `Section` and `Submission`.
- **Section** — a visually grouped card on `index.html` (`static/app.js:525`), ordered by `sort_order`. Each has a **per-section mic button** (`ثبت با صدا`).
- **Question** — a single field. `v_code` is the canonical key (unique globally) used in API payloads, `Response` rows, and anomaly checks.

Source: `app/models.py:19`, `app/routers/questionnaire.py:23`.

---

## Section visibility — conditional logic

Stored on `Section` (`app/models.py:33`):

| Field | Meaning |
|---|---|
| `depends_on_vcode` + `depends_on_value` | **Show only if** `answers[depends_on_vcode] == depends_on_value` |
| `skip_if_vcode` + `skip_if_value` | **Hide if** `answers[skip_if_vcode] == skip_if_value` |

Evaluated live in `updateQuestionVisibility()` (`static/app.js:226`):

```js
if (meta.depends_on_vcode) {
  const parent = sessionContext[meta.depends_on_vcode];
  if (parent === undefined || parent === "" || parent != meta.depends_on_value)
    sectionShouldShow = false;
}
```

!!! note
    The DB has **both** `depends_on_*` and `skip_if_*` columns, but `get-form-structure` (`questionnaire.py:38`) currently returns only `depends_on_*` to the frontend. `skip_if_*` is stored and managed via Admin API but not yet evaluated client-side — a known gap to close if skip rules are needed.

Progress panel (`updateProgressPanel`) **excludes hidden sections** from `totalQuestions` / `totalAnswered` counts (`static/app.js:610`).

---

## Question types & rendering

`response_type` drives both **frontend input** (`static/app.js:706`) and **AI extraction rule** (`app/services/ai_engine.py:528`):

| `response_type` | Frontend | AI rule |
|---|---|---|
| `Categorical` | Radio group from `coding_options` | `Return ONLY the integer code. Options: 1=زن, 2=مرد. If not mentioned, null.` |
| `Dichotomous` | Radio (same as Categorical, typically 2 options) | Same as Categorical |
| `Numeric` / `Continuous` | Text input with `unit` placeholder | Extract numeric, convert unit if needed (e.g. متر→سانتی‌متر), return value only |
| `Date` | Text input (`YYYY-MM-DD` placeholder) | Format as `YYYY-MM-DD`; year-only → `YYYY-01-01` |
| `Text` | Text input | Exact phrase |
| `MultiSelect` | Checkbox group (comma-joined codes) | Comma-separated list of integer codes; `null` if none |

**`coding_options`** is JSONB: `{ "1": "زن", "2": "مرد" }`. The anomaly checker decodes codes to meanings (`_append_option_meanings` in `ai_engine.py:199`).

**`manual_prompt`** — if set, the type-aware rule is **skipped** and this free-text prompt is used verbatim (`CODE V1: <manual_prompt>`). Use for questions that don't fit the standard types.

---

## Grouped / repeated questions

For questions that can have multiple answers (e.g. several medications), set the same `group_pair` on all related `Question` rows (e.g. `group_pair="meds"` for `D1`=name, `D2`=dose).

### How it works

1. **DB**: questions sharing a `group_pair` are grouped in `extractGroupedQuestions()` (`static/app.js:252`).
2. **Frontend**: they render as a **single multi-row container** (`renderGroupContainer`) with `Add row` / remove buttons (`static/app.js:277`). Each row's inputs use indexed `data-vcode` like `D1_0`, `D1_1`…
3. **Progress**: only `*_0` (first row) counts toward section progress (`static/app.js:586`).
4. **AI schema**: `PromptGenerator._build_response_schema()` (`ai_engine.py:396`) adds indexed keys `V_1`…`V_5` (up to `MAX_GROUP_ENTRIES=6`) as optional properties. Prompt includes: *"If only 1 medicine mentioned, return only `D1` (plain). If 2, return `D1` and `D1_1`."* (`ai_engine.py:503`).
5. **Storage**: `Response.group_index` (`0`, `1`…) + `v_code` (base code) disambiguates rows; upsert key is `(submission_id, v_code, group_index)` (`responses.py:14`).
6. **Submission**: `collectGroupedAnswers()` + `getIndexedGroupAnswers()` handle indexed keys; `POST /complete-submission` parses `V_2` via regex `^(.+?)_(\d+)$` (`questionnaire.py:354`).

!!! tip "Plain vs indexed"
    - Plain `D1` in AI response → stored as `D1` with `group_index=0` (first row).
    - `D1_1` → stored as `D1` with `group_index=1` (second row). The `v_code` column stores the base code; `group_index` carries the row.

---

## `GET /get-form-structure`

`app/routers/questionnaire.py:23`:

```
GET /get-form-structure?form_id=1
```

- Optional `form_id` filter; without it, returns **all sections** ordered by `sort_order`.
- Each section includes `section_key`, `name_fa`, `depends_on_*`, and nested `questions[]` ordered by `sort_order`.
- Returns empty `[]` if DB has no sections — frontend shows a loading spinner that never resolves (seed the DB!).

---

## Admin management

Full CRUD via `app/routers/admin.py:240` — see [Admin API](../api/admin.md):

- `GET /api/admin/forms` / `POST /api/admin/forms` / `PUT /api/admin/forms/{id}` / `DELETE /api/admin/forms/{id}`
- `GET /api/admin/forms/{id}/sections` / `POST /api/admin/sections` / `PUT /api/admin/sections/{id}` / `DELETE /api/admin/sections/{id}`
- `GET /api/admin/sections/{id}/questions` / `POST /api/admin/questions` / `PUT /api/admin/questions/{id}` / `DELETE /api/admin/questions/{id}`

Deletes cascade manually in code (no DB `ON DELETE CASCADE`).

---

## End-to-end example

```python
# Type-aware prompt generation for a Numeric question with unit
# app/services/ai_engine.py:546
#   "Extract the numeric value. Expected unit is 'سال'.
#    If speaker says متر/میلی‌متر, convert to سال accurately..."

# Conditional visibility: section B only if A4 (gender) == "1" (female)
# Section row: depends_on_vcode="A4", depends_on_value="1"
# Frontend hides B until A4 is answered as "1"

# Grouped: medications
# Q rows: (D1, group_pair="meds"), (D2, group_pair="meds")
# Speaker: "متفورمین ۵۰۰ و لوزارتان ۲۵"
# AI returns: {"D1":"متفورمین","D2":"500","D1_1":"لوزارتان","D2_1":"25"}
# Stored: 4 Response rows with group_index 0 and 1
```
