# Contributing

## Getting started

```bash
git clone <repo-url> && cd VoiceCohortRecord
python -m venv venv && source venv/bin/activate  # or .\venv\Scripts\Activate.ps1 on Windows
pip install -r requirements.txt
cp .env.example .env  # then fill DATABASE_URL + GEMINI_API_KEYS
python main.py        # → http://127.0.0.1:8000
pytest tests/ -q      # no DB needed
mkdocs serve          # → http://127.0.0.1:8000 (docs hot-reload)
```

Read [Installation](../getting-started/installation.md) and [Configuration](../getting-started/configuration.md) for full setup.

---

## Branch & commit

- Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
- Commits: imperative, concise — e.g. `fix: handle N/A in grouped progress`, `docs: add deployment guide`.
- Keep diffs small — one concern per PR.

---

## Code style

- **Python**: no formatter enforced — follow existing style (4-space indent, docstrings on routers/services). Consider adding `ruff`/`black` later.
- **JS**: vanilla, no bundler — keep `static/app.js` functions small, prefix DOM helpers like `render*`, `update*`, `apply*`.
- **Docs**: MkDocs Material — use admonitions (`!!! note`, `!!! warning`), `mermaid` for diagrams, code blocks with file refs (`app/models.py:8`).

---

## What to work on

Check `FIXES.md` and the Roadmap in the README:

- [ ] Update question texts
- [ ] Reduce chronic disease section question count
- [x] Proxy for Gemini (WebShare) — done via `GENAI_PROXY`
- [ ] Fine-tune audio processing configs if needed
- [ ] Bitrate `32k → 64k` if ASR quality needs it (`audio_processor.py:22`)
- [x] Pill names — grouped fix (`group_pair`) — done
- [ ] CSV export (JSON done) — `admin.py:598`
- [ ] Passwords / proper sessions for login
- [ ] Authorization checks for admin endpoints

Plus [Security](../operations/security.md) hardening — the highest-impact contributions.

---

## Adding a question type

1. `app/services/ai_engine.py:528` — add a branch in `generate_section_prompt()` for the new `response_type` with its rule.
2. `static/app.js:706` — add a branch in `renderQuestion()` for the input widget.
3. `app/services/ai_engine.py:396` — if it needs custom schema handling, extend `_build_response_schema()`.
4. Document in [Form Engine](../architecture/form-engine.md) and seed via Admin API.

Prefer `manual_prompt` on the `Question` row if the new type is one-off — no code change needed.

---

## Adding a docs page

1. Create `docs/<section>/<page>.md`.
2. Add it to `nav:` in `mkdocs.yml` (order matters for sidebar).
3. `mkdocs serve` to preview; `mkdocs build --strict` to verify (fails on broken links).

Keep docs **source-tied** — reference files as `path:line` (e.g. `app/routers/auth.py:19`) so readers can jump to code.

---

## Pull request checklist

- [ ] `pytest tests/ -q` passes
- [ ] `mkdocs build --strict` passes (no broken links)
- [ ] Manual smoke: `GET /get-form-structure`, signup/login, record one section, verify warnings + progress
- [ ] No secrets committed (`.env` gitignored — double-check `git status`)
- [ ] If you touched auth/admin/db: see [Security](../operations/security.md) — don't widen exposure
- [ ] Update `FIXES.md` / Roadmap if you closed an item

---

## Reporting issues

Include:

- `python --version`, `pip freeze` snippet, OS, browser + version
- `.env` keys set (redact values) and `DATABASE_URL` kind (local/Neon/Supabase)
- Server logs (`docker logs` or `uvicorn` stdout) — especially `=== RAW RESPONSE ===` / `ffmpeg failed`
- Steps to reproduce + expected vs actual

For security issues (auth bypass, PII leak), **do not** open a public issue — contact the maintainers directly.
