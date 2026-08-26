# Testing

## Running tests

```bash
# all tests
pytest tests/ -v

# single file
pytest tests/test_audio_processor.py -v
pytest tests/test_ai_engine_failover.py -v

# with coverage (if installed)
pytest --cov=app tests/
```

No DB or Gemini key needed for the unit tests — both are mocked. `pytest` is available in `venv` (via `requirements` / `pip show pytest`).

---

## Test suite

| File | What it covers | Mocking |
|---|---|---|
| `tests/test_audio_processor.py` | `process_audio_file()` — ffmpeg success, missing ffmpeg, empty output, timeout, no output file | `shutil.which`, `subprocess.run`, `os.path.exists/getsize` |
| `tests/test_ai_engine_failover.py` | `_KeyRotator`, `_classify`, `_try_keys`, `_run_with_failover` — quota → next key, transient → backoff+retry, fatal → raise, model failover chain, empty keys, dedup | `google.genai.errors.APIError`, `httpx.TimeoutException/TransportError`, `config.get_api_keys` |

### `test_audio_processor.py` — key cases

- **Happy path**: ffmpeg found, output exists & non-empty → returns `proc_*.webm`, logs `processed … KB`.
- **No ffmpeg**: `get_ffmpeg()` returns `None` → returns original path, logs `ffmpeg not found`.
- **ffmpeg fails**: `CalledProcessError` / `TimeoutExpired` / `OSError` → deletes partial `out_path`, returns original.
- **Empty output**: `getsize == 0` or file missing → delete + fallback.

### `test_ai_engine_failover.py` — key cases

- `_classify` maps `429 → quota`, `500/503 → transient`, `Timeout/Transport → transient`, other → `fatal`.
- `_KeyRotator.order(n)` round-robins — first call `[0..n-1]`, next `[1..n-1,0]`, etc.
- `_try_keys`:
  - Success on first key → returns immediately.
  - Fatal on any key → raises without trying others.
  - Quota on key 0 → tries key 1; if all quota → raises last quota error.
  - Transient on all keys → Phase 2 extra retries (`GENAI_OVERLOAD_RETRIES`) on `live` keys only.
  - No keys (`[]`) → single env-based client attempt.
- `_run_with_failover`:
  - Transient on primary → retries fallback model.
  - Quota/fatal on primary → raises (no model fallback).
  - Success on fallback → returns.

---

## Manual / integration testing

Unit tests don't hit DB or Gemini. For end-to-end:

```bash
python main.py  # needs DATABASE_URL + GEMINI_API_KEYS

# seed
curl -X POST http://127.0.0.1:8000/api/admin/forms -H "Content-Type: application/json" -d '{"form_name":"Test","category":"test"}'

# signup + login
curl -X POST http://127.0.0.1:8000/api/signup -H "Content-Type: application/json" -d '{"national_code":"0012345678","phone_number":"09123456789"}'
curl -X POST http://127.0.0.1:8000/api/login -H "Content-Type: application/json" -d '{"national_code":"0012345678"}'

# form structure
curl "http://127.0.0.1:8000/get-form-structure?form_id=1" | jq

# voice (needs real audio file)
curl -X POST http://127.0.0.1:8000/process-voice \
  -F "audio=@sample.webm;type=audio/webm" \
  -F "section_key=A" \
  -F "submission_id=1" | jq
```

For browser flow, follow [Quick Start](../getting-started/quickstart.md) — record actual voice and verify warnings.

---

## Adding a new test

Tests use `pytest` + `unittest.mock`. No fixtures, no DB setup.

```python
from unittest.mock import patch, MagicMock
import app.services.audio_processor as ap

def test_my_case(tmp_path):
    fake = tmp_path / "in.webm"
    fake.write_bytes(b"fake audio")
    with patch("app.services.audio_processor.get_ffmpeg", return_value=None):
        assert ap.process_audio_file(str(fake)) == str(fake)
```

For `ai_engine`, patch `app.core.config.get_api_keys` and `app.services.ai_engine._build_client`:

```python
from unittest.mock import patch, MagicMock
import app.services.ai_engine as eng

def test_quota_rotates():
    with patch("app.core.config.get_api_keys", return_value=["k1","k2"]):
        # build a mock client whose call raises quota on k1 then succeeds on k2
        ...
        result = eng._try_keys(call, "gemini-3-flash-preview")
        assert result == expected
```

Keep tests **isolated** — never hit real Gemini or Postgres.

---

## CI (suggested)

```yaml
# .github/workflows/test.yml
name: test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.10" }
      - run: pip install -r requirements.txt pytest
      - run: pytest tests/ -q
      - run: mkdocs build --strict
```

`--strict` fails on broken docs links — catches nav drift.

---

## Known gaps

- **No integration / DB tests** — `questionnaire.py`, `auth.py`, `admin.py` have zero automated coverage. Add `pytest` + `TestClient` + `sqlalchemy` in-memory SQLite or a test Postgres if you want confidence before changing routes.
- **No frontend tests** — `static/app.js` untested. Consider `vitest` + `jsdom` for `updateProgressPanel`, `applyAiResults`, etc., or keep manual QA.
- **`ApiLog` not asserted** — the tests don't verify logging.
