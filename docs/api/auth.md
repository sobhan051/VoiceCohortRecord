# Auth & Dashboard

`app/routers/auth.py:1` — national-code-only auth + role-based dashboard. All routes under `prefix="/api"`.

!!! warning
    Login is **identification, not authentication**. `User` has no password column (`app/models.py:8`). Treat `national_code` as a claim, not a proof.

---

## `POST /api/signup` — `auth.py:19`

Create a new user account.

**Request** `application/json`:

```json
{
  "first_name": "سارا",
  "last_name": "احمدی",
  "national_code": "0012345678",
  "phone_number": "09123456789"
}
```

Validation (`auth.py:27`):

| Field | Rule | Error (Persian) |
|---|---|---|
| `national_code` | required, `^\d{10}$` | `کد ملی الزامی است` / `کد ملی باید ۱۰ رقم باشد` |
| `phone_number` | optional, if present `^09\d{9}$` | `شماره تماس باید با ۰۹ شروع شده و ۱۱ رقم باشد` |
| `national_code` uniqueness | no existing `User.national_code` | `کاربری با این کد ملی قبلاً ثبت شده است` |

Trims whitespace on all fields; empty `first_name`/`last_name`/`phone_number` stored as `NULL`; `role` forced to `1`.

**Success** `200`:

```json
{"success":true,"user":{"user_id":"3","first_name":"سارا","last_name":"احمدی","national_code":"0012345678","phone_number":"09123456789","role":1}}
```

**Failure** `200` with `{error: "…"}` (not a 4xx).

Frontend (`static/signup.js`) maps Persian digits `۰-۹` → `0-9` before sending and stores the returned `user` in `localStorage.vcr_user`.

---

## `POST /api/login` — `auth.py:65`

Log in by national code only.

**Request**:

```json
{"national_code":"0012345678"}
```

Validation: `national_code` required (trimmed). No format check beyond non-empty.

Lookup: `User.national_code == national_code`. If missing → `{error: "کاربری با این کد ملی یافت نشد"}`.

**Success**: same `{success, user}` shape as signup.

Frontend stores in `localStorage.vcr_user` and redirects to `/dashboard`. Signup auto-logs in the same way.

---

## `GET /api/dashboard?user_id=…` — `auth.py:91`

Returns role-specific dashboard data. Powers both user and admin dashboards.

**Query**: `user_id` required (string → `int()`). Invalid → `{error:"شناسه کاربر نامعتبر است"}`. User not found → `{error:"کاربر یافت نشد"}`.

**Common envelope**:

```json
{
  "user":{"user_id":"3","first_name":"سارا","last_name":"احمدی","national_code":"0012345678","phone_number":"0912…","role":1},
  "dashboard_type":"user|admin",
  "stats":{…},
  "forms":[…],          // admin
  "submissions":[…],     // user
  "open_forms":[…]       // user
}
```

### Admin (`role == 2`) — `auth.py:113`

```json
{
  "dashboard_type":"admin",
  "stats":{
    "total_submissions":42,
    "completed_submissions":30,
    "draft_submissions":12,
    "total_users":15,
    "total_api_calls":128,
    "avg_confidence":0.86
  },
  "forms":[
    {"form_id":"1","form_name":"Cohort Baseline","category":"baseline"}
  ]
}
```

- `total_api_calls`: `COUNT(api_logs)` (`auth.py:123`)
- `avg_confidence`: `AVG(response.ai_confidence)` rounded to 2 decimals (`auth.py:124`)

### User (`role == 1`) — `auth.py:147`

```json
{
  "dashboard_type":"user",
  "stats":{"total_submissions":2,"completed_submissions":1,"draft_submissions":1},
  "submissions":[
    {
      "submission_id":"7","form_name":"Cohort Baseline","status":"draft",
      "created_at":"2026-08-20T10:00:00","updated_at":"2026-08-20T10:05:00",
      "response_count":12,"total_questions":48
    }
  ],
  "open_forms":[
    {"form_id":"2","form_name":"Follow-up","category":"followup"}
  ]
}
```

- `submissions` ordered by `updated_at desc` (`auth.py:152`)
- `total_questions` per submission: `COUNT(question JOIN section WHERE section.form_id == submission.form_id)` (`auth.py:168`)
- `open_forms`: forms with **no** submission for this user (`auth.py:192`)

---

## cURL

```bash
# signup
curl -X POST http://127.0.0.1:8000/api/signup \
  -H "Content-Type: application/json" \
  -d '{"first_name":"سارا","last_name":"احمدی","national_code":"0012345678","phone_number":"09123456789"}' | jq

# login
curl -X POST http://127.0.0.1:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"national_code":"0012345678"}' | jq

# dashboard
curl "http://127.0.0.1:8000/api/dashboard?user_id=1" | jq
```

---

## Promoting to admin

No UI — use Admin API:

```bash
curl -X PUT http://127.0.0.1:8000/api/admin/users/1 \
  -H "Content-Type: application/json" \
  -d '{"role":2}' | jq
# → {"success":true}
```

Or SQL: `UPDATE users SET role=2 WHERE user_id=1;`.
