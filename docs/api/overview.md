# API Overview

Base URL: `http://127.0.0.1:8000` (dev) or `$PORT` in Docker/HF Spaces. No version prefix — all routes are top-level.

## Conventions

- **No authentication middleware** — user identity is passed as `user_id` / `national_code` in payloads. Admin routes have **zero** auth check (see [Security](../operations/security.md)).
- **Content types**: JSON for most endpoints; `multipart/form-data` for `POST /process-voice`.
- **IDs as strings** in responses: `user_id`, `submission_id`, `form_id` etc. are integers in DB but serialized as strings.
- **Errors as `{error: "…"}**` with Persian messages in many places; no HTTP status code distinction (always `200` with error key — not REST-idiomatic).
- **IDs in query/body as `str`** — handlers do `int()` parsing with try/except and return `{error}` on failure.

## Route table

| Group | Method & Path | File | Description |
|---|---|---|---|
| **Pages** | `GET /` | `pages.py:11` | Signup page |
|  | `GET /form` | `pages.py:19` | Questionnaire UI |
|  | `GET /signup` | `pages.py:24` | Signup page |
|  | `GET /login` | `pages.py:29` | Login page |
|  | `GET /dashboard` | `pages.py:35` | Dashboard UI (role-based) |
|  | `GET /cdn/tailwindcss` | `pages.py:41` | Proxied Tailwind CDN |
|  | `GET /cdn/vazirmatn` | `pages.py:48` | Proxied Vazirmatn CSS |
| **Public / Form** | `GET /get-form-structure` | `questionnaire.py:23` | Sections + questions, optional `?form_id=` |
|  | `POST /process-voice` | `questionnaire.py:396` | Upload section audio → transcript+data+confidence |
|  | `POST /check-section-anomalies` | `questionnaire.py:48` | Per-section quality check |
|  | `POST /check-final-anomalies` | `questionnaire.py:120` | Cross-section quality check |
|  | `POST /start-submission` | `questionnaire.py:199` | Create/reuse draft submission |
|  | `POST /complete-submission` | `questionnaire.py:320` | Persist final answers, mark completed |
| **Auth** | `POST /api/signup` | `auth.py:19` | Create user (national_code validated) |
|  | `POST /api/login` | `auth.py:65` | Log in by national_code |
|  | `GET /api/dashboard` | `auth.py:91` | Role-specific dashboard data `?user_id=` |
| **Admin** | `GET /api/admin/stats` | `admin.py:26` | Platform stats |
|  | `GET /api/admin/submissions` | `admin.py:62` | List submissions `?limit&offset&status` |
|  | `GET /api/admin/submission/{id}` | `admin.py:99` | Detail + answers |
|  | `DELETE /api/admin/submissions/{id}` | `admin.py:502` | Delete submission + responses/logs |
|  | `DELETE /api/admin/responses/{id}` | `admin.py:521` | Delete single response |
|  | `GET /api/admin/users` | `admin.py:161` | List users + submission counts |
|  | `POST /api/admin/user` | `admin.py:186` | Create user |
|  | `PUT /api/admin/users/{id}` | `admin.py:487` | Update user |
|  | `DELETE /api/admin/user/{id}` | `admin.py:213` | Delete user |
|  | `GET /api/admin/forms` | `admin.py:241` | List forms |
|  | `POST /api/admin/forms` | `admin.py:254` | Create form |
|  | `PUT /api/admin/forms/{id}` | `admin.py:270` | Update form |
|  | `DELETE /api/admin/forms/{id}` | `admin.py:287` | Delete form + sections + questions |
|  | `GET /api/admin/forms/{id}/sections` | `admin.py:311` | Sections of a form |
|  | `POST /api/admin/sections` | `admin.py:336` | Create section |
|  | `PUT /api/admin/sections/{id}` | `admin.py:358` | Update section |
|  | `DELETE /api/admin/sections/{id}` | `admin.py:378` | Delete section + questions |
|  | `GET /api/admin/sections/{id}/questions` | `admin.py:398` | Questions of a section |
|  | `POST /api/admin/questions` | `admin.py:425` | Create question |
|  | `PUT /api/admin/questions/{id}` | `admin.py:448` | Update question |
|  | `DELETE /api/admin/questions/{id}` | `admin.py:468` | Delete question |
|  | `GET /api/admin/api-logs` | `admin.py:535` | Recent API logs `?limit` |
|  | `GET /api/admin/export/submissions` | `admin.py:559` | Export `?format=json` (CSV todo) |

## Quick smoke tests

```bash
# form structure
curl http://127.0.0.1:8000/get-form-structure?form_id=1 | jq

# signup
curl -X POST http://127.0.0.1:8000/api/signup \
  -H "Content-Type: application/json" \
  -d '{"first_name":"سارا","last_name":"احمدی","national_code":"0012345678"}' | jq

# dashboard
curl "http://127.0.0.1:8000/api/dashboard?user_id=1" | jq

# admin stats
curl http://127.0.0.1:8000/api/admin/stats | jq

# per-section anomaly (manual)
curl -X POST http://127.0.0.1:8000/check-section-anomalies \
  -H "Content-Type: application/json" \
  -d '{"section_key":"A","answers":{"A1":"35","A4":"1"}}' | jq
```

## Detailed pages

- [Pages & CDN](pages.md) — static routes and proxy behavior.
- [Auth & Dashboard](auth.md) — signup/login/dashboard.
- [Questionnaire](questionnaire.md) — voice, anomalies, submissions.
- [Admin](admin.md) — full CRUD reference + payload schemas.
