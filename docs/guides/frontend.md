# Frontend

Vanilla JS + Tailwind CDN + Vazirmatn — no build step, no bundler, no framework. Four pages, three JS files, one RTL-driven UI.

Sources: `static/index.html`, `static/app.js`, `static/dashboard.html` / `dashboard.js`, `static/signup.html` / `signup.js`, `static/login.html`.

---

## Pages & routes

| Route | File | Purpose | Auth |
|---|---|---|---|
| `GET /` | `static/signup.html` | Landing — serves signup | public |
| `GET /signup` | `static/signup.html` | Create account | public |
| `GET /login` | `static/login.html` | Log in by national code | public |
| `GET /dashboard` | `static/dashboard.html` | Role-based dashboard (user vs admin) | reads `localStorage.vcr_user` |
| `GET /form` | `static/index.html` + `static/app.js` | Questionnaire — voice per section | requires `vcr_user` (redirects otherwise) |
| `GET /cdn/tailwindcss` | `routers/pages.py:41` | Proxied Tailwind (optional) | public |
| `GET /cdn/vazirmatn` | `routers/pages.py:48` | Proxied Vazirmatn CSS (optional) | public |

Backend serves them via `FileResponse` (`app/routers/pages.py:11`) + `StaticFiles` mount at `/static` (`app/main.py:26`).

!!! note "CDN proxy — opt-in"
    `pages.py` proxies `cdn.tailwindcss.com` and `jsdelivr/Vazirmatn` through the server (cached in-memory via `services/cdn.py:12`). But `static/*.html` currently load directly from public CDNs:
    ```html
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fontsource/vazirmatn@5.2.8/400.min.css">
    ```
    The proxied `<script src="/cdn/tailwindcss">` line is commented out in `static/index.html:10`. Uncomment it for restricted networks (e.g. behind `GENAI_PROXY`).

---

## Styling

- **Tailwind Browser v4** — no build, runtime compilation (`@tailwindcss/browser@4`). Works offline only via proxy.
- **Vazirmatn** — Persian font (`@fontsource/vazirmatn`). `body { font-family: 'Vazirmatn', sans-serif; }`.
- **RTL** — every HTML has `<html lang="fa" dir="rtl">`. Progress panel is `right: 0`, warning panel `left: 24px`.
- Custom CSS in `index.html:14` for progress panel, warning panel, toast, audio retry modal, `ai-updated` pulse, `mic-recording` shadow pulse.

---

## `signup.js` / `signup.html` & `login.html`

### Signup — `static/signup.js:1`

- Validation: `NATIONAL_RE = /^\d{10}$/`, `PHONE_RE = /^09\d{9}$/` — mirrors `app/routers/auth.py:29`.
- Persian digit conversion: `digitsOnly()` maps `۰-۹` → `0-9` before validation.
- `POST /api/signup {first_name, last_name, national_code, phone_number}` → on success, stores `user` in `localStorage.vcr_user`, redirects to `/dashboard`.

### Login — inline in `static/login.html`

- Single `national_code` input → `POST /api/login {national_code}` → stores `user` in `localStorage.vcr_user` → redirect to `/dashboard`.
- Error messages in Persian, `showToast()` style.

### Session — `localStorage.vcr_user`

```json
{"user_id":"3","first_name":"سارا","last_name":"احمدی","national_code":"0012345678","phone_number":"0912…","role":1}
```

No cookies, no JWT — the only "session" is this localStorage entry. `dashboard.js` and `app.js` verify it via `GET /api/dashboard?user_id=…` on load; if invalid → redirect to `/login`.

---

## Dashboard — `static/dashboard.js` / `dashboard.html`

Verifies `vcr_user` on `DOMContentLoaded`:

```js
const data = await fetch(`/api/dashboard?user_id=${userData.user_id}`).then(r=>r.json());
if (data.error) → redirect /login
```

Branches on `data.dashboard_type`:

### User view (`role == 1`)

- **Stats**: `total_submissions`, `completed_submissions`, `draft_submissions`, plus `avg_confidence` (admin).
- **Submissions list**: each with `submission_id`, `form_name`, `status`, `response_count / total_questions`, `created_at`, `updated_at`.
- **Open forms**: forms with no submission yet.
- Action: **شروع / ادامه پرسشنامه** → sets `localStorage.selected_form_id = form_id` and navigates to `/form?form_id=…`.

### Admin view (`role == 2`)

- **Platform stats**: total submissions, completed/draft, total users, AI calls (`ApiLog` count), avg confidence.
- **Tabs** (sidebar): Dashboard, Submissions (paginated table + detail modal), Users (create/update role/delete), Forms/Sections/Questions CRUD, API Logs, Export.
- All via `GET/POST/PUT/DELETE /api/admin/*` — see [Admin API](../api/admin.md).

!!! warning "Admin is client-side only"
    The dashboard **hides** admin tabs by `role` client-side; the API has **no auth check** (`app/routers/admin.py:5`). Anyone who knows the endpoints can call them. See [Security](../operations/security.md).

---

## Questionnaire — `static/app.js` + `static/index.html`

The complex one — ~1300 lines.

### Page skeleton — `static/index.html:346`

- Sticky header: title + *داشبورد* link + `status-badge`.
- **Progress panel** (`#progress-panel`, `right: 0`, `250px`): header with overall ring/bar, body `progress-section-list`, footer submit button. Responsive: hidden on `<1024px` with toggle (`#progress-panel-toggle`).
- **Patient card** (`#patient-card`): 4 readonly inputs (`pt-first`, `pt-last`, `pt-national`, `pt-phone`) + badge `✓ احراز هویت شده`. Pre-filled from `vcr_user`.
- **Form container** (`#form-container`): loading spinner → sections rendered by JS.
- **Floating stop** (`#floating-stop-btn`, `bottom-8 left-8`) + **volume meter** (`#volume-meter-container`, `bottom-8 left-24`).
- **Warning summary panel** (`#warning-summary-panel`, `top-80 left-24`).
- **Audio retry modal** (`#audio-retry-modal`) + **toast container** (`#toast-container`, `bottom-24 left-24`).

### Boot — `DOMContentLoaded` (`app.js:26`)

```js
const formId = urlParams.get('form_id') || localStorage.getItem('selected_form_id');
const sections = await fetch(`/get-form-structure?form_id=${formId}`).then(r=>r.json());
renderForm(sections);
updateQuestionVisibility();
autoStartFromSession(); // localStorage.vcr_user → POST /start-submission
```

### Rendering — `renderForm(sections)` (`app.js:502`)

1. `extractGroupedQuestions(sections)` — partitions `group_pair` questions into `groupedQuestionsMap` / `groupedQuestionsSections`. Still counted for progress.
2. `sectionProgressData[section_key] = {name_fa, total, answered: 0}`.
3. Removes grouped questions from `section.questions` (rendered separately).
4. For each section: emits `section[id="sect-{key}"]` with header (title + `badge-{key}` + mic button `btn-{key}`) + grid with:
   - `renderGroupContainer(gp)` per `group_pair` in that section
   - `renderQuestion(q)` per remaining question

### `renderQuestion(q)` (`app.js:706`)

| `response_type` | Output |
|---|---|
| `MultiSelect` | Checkbox group, `name="{v_code}[]"`, `data-vcode="{v_code}"` |
| `Categorical` / `Dichotomous` | Radio group, `name="{v_code}"`, `data-vcode="{v_code}"` |
| otherwise | `input[type=text]` with `data-vcode="{v_code}"`, placeholder `واحد: {unit}` |

All inputs have `data-vcode` — the universal selector for extraction / anomaly / progress.

### Grouped rendering — `renderGroupContainer()` / `renderGroupEntry()` (`app.js:277`)

- Container: blue tint card, title from first question, row count badge `N ردیف`, `Add row` button.
- Each entry: `div.group-entry[data-group="{pair}"][data-idx="{i}"]` with grid of `renderQuestion({...q, v_code: q.v_code+"_"+idx})`.
- `addGroupEntry()` guards: all inputs in last row must be filled or toast *«لطفاً تمام فیلدهای ردیف قبلی را پر کنید»*.
- `removeGroupEntry()` guards: at least one row must remain.

### Voice — `toggleRecording(sectionKey)` (`app.js:758`)

See [Audio Pipeline](audio-pipeline.md) for detail — `getBestAudioMimeType()`, `MediaRecorder`, `AudioContext` RMS, auto-stop, `sendAudioToServer()`.

### AI result handling — `applyAiResults()` + helpers (`app.js:1160`)

- `applyGroupedAiResults()` first computes `groupMaxIdx` per `group_pair`, auto-adds rows via `addGroupEntrySilent()`, then fills each `[data-vcode="{indexed}"]` (radio vs text), adds `.ai-updated` pulse, dispatches `change` to sync `sessionContext`.
- Plain `v_code`s filled similarly; `"N/A"` tagged `data-na="1"` + placeholder `غیرمرتبط` + pulse.
- Post-fill: `updateQuestionVisibility()`, `markSectionAnswered()`, `updateProgressPanel()`, then `POST /check-section-anomalies` → `fieldWarnings` → `applyFieldWarnings()` etc.

### Manual edits

Any input `change` updates `sessionContext[v_code]` and clears that field's warning (removes from `fieldWarnings`). The warning badge + panel update automatically.

### Progress & warnings

- `updateProgressPanel()` (`app.js:556`) — see [Questionnaire Flow](questionnaire-flow.md).
- `applyFieldWarnings()` / `updateSectionBadges()` / `updateWarningPanel()` — see [Anomaly Detection](anomaly-detection.md).
- `showToast(message)` (`app.js:1061`) — auto-dismiss 5s, `.toast` card at bottom-left.

### Final submit — `submitFinalForm()` (`app.js` — search `function submitFinalForm`)

1. `collectGroupedAnswers()` syncs last edits.
2. `POST /check-final-anomalies {submission_id, answers, confidence_reasons}` — shows warnings in confirmation if any.
3. On confirm, `POST /complete-submission {submission_id, answers, confidence}` → toast + redirect to `/dashboard` or show success.

### Keyboard & toggles

- `Esc` → `closeAudioRetryModal()`
- `toggleProgressPanel()` / `toggleWarningPanel()` — CSS `open` / `active` classes.

---

## RTL & accessibility notes

- `dir="rtl"` on every page — Tailwind's logical properties not relied on; custom CSS uses `right`/`left` intentionally for RTL layout (progress `right`, warnings `left`).
- Font: Vazirmatn everywhere; no fallback needed via proxy.
- No ARIA landmarks beyond native — consider adding `role="status"` to `status-badge`, `aria-live` to toast container for screen readers.

---

## Files at a glance

| File | Lines | Role |
|---|---|---|
| `static/index.html` | ~516 | Form shell + custom CSS |
| `static/app.js` | ~1300 | All form logic |
| `static/dashboard.html` | — | Dashboard shell |
| `static/dashboard.js` | — | Dashboard logic (user+admin) |
| `static/signup.html` / `signup.js` | — | Signup flow |
| `static/login.html` | — | Login flow (inline JS) |
| `static/app.js:48` | — | Format negotiation |
| `static/app.js:252` | — | Grouped questions |
| `static/app.js:556` | — | Progress panel |
| `static/app.js:1080` | — | Warning UI |
