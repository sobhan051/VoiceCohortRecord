# Configuration

All settings are loaded **once** from `.env` via `load_dotenv()` in `app/core/config.py:12`. Any module that needs config imports from there.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL DSN. `app/db/session.py:6` crashes on import if unset. Examples below. |
| `GEMINI_API_KEYS` | No* | — | Comma-separated Gemini API keys (preferred). Order preserved, duplicates removed. |
| `GEMINI_API_KEY` | No* | — | Singular variant — also accepts comma-separated list. Used if `GEMINI_API_KEYS` unset (`app/core/config.py:63`). |
| `GOOGLE_API_KEY` | No* | — | Also checked by `google-genai` SDK fallback when no explicit key is configured (`app/services/ai_engine.py:138`). |
| `GEMINI_FALLBACK_MODELS` | No | `gemini-3.1-flash-lite,gemini-3.5-flash` | Comma-separated fallback chain after primary model overload (`app/core/config.py:31`). |
| `GENAI_TIMEOUT_MS` | No | `60000` | HTTP timeout for Gemini calls in ms (`app/core/config.py:38`). Raise behind slow proxies. |
| `GENAI_RETRY_BACKOFF_SECONDS` | No | `1.5` | Seconds to wait after a transient 500/503 before rotating to next key (`app/core/config.py:43`). |
| `GENAI_OVERLOAD_RETRIES` | No | `1` | Extra retries after one pass over all keys, only if quota remains (`app/core/config.py:46`). |
| `GENAI_PROXY` | No | — | Outbound HTTP proxy for Gemini + CDN proxy. Also honors `HTTP_PROXY` / `HTTPS_PROXY` (`app/core/config.py:50`). |
| `HTTP_PROXY` / `HTTPS_PROXY` | No | — | Fallback proxy env vars, checked after `GENAI_PROXY`. |
| `FFMPEG_PATH` | No | `which ffmpeg` | Absolute path to ffmpeg binary. Otherwise resolved via `PATH` (`app/services/audio_processor.py:35`). |
| `PORT` | No | `8000` (`7860` in Docker) | Port for `python main.py` (`main.py:16`). Docker sets `7860` for HF Spaces. |

\* At least one key source should be set for AI features. If none are set, `ai_engine._try_keys` makes a single SDK-default lookup (`app/services/ai_engine.py:137`) — which succeeds only if the SDK finds a key in the environment on its own.

---

## DATABASE_URL examples

```env
# Local Postgres
DATABASE_URL=postgresql://postgres:password@localhost:5432/vcr_v2_db

# Supabase (pooler, port 6543)
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres

# Supabase (direct, port 5432)
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

# Neon (requires sslmode)
DATABASE_URL=postgresql://neondb_owner:<password>@ep-xyz-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require

# HF Spaces — set as a Space Secret (Variables and secrets → Secrets)
DATABASE_URL=postgresql://... ?sslmode=require
```

Append `?sslmode=require` (or `&sslmode=require` if DSN already has `?`) when the provider requires TLS — otherwise `psycopg2` fails to connect.

---

## Gemini model config

Defined in `app/core/config.py:24`:

```python
AUDIO_MODEL   = "gemini-3-flash-preview"   # voice extraction
ANOMALY_MODEL = "gemini-3-flash-preview"   # anomaly checks
FALLBACK_MODELS = [...]  # from GEMINI_FALLBACK_MODELS env
```

Failover chain per call is `[primary] + FALLBACK_MODELS` (deduped) — see [AI Engine](../guides/ai-engine.md).

> **README drift:** the README front-matter lists fallback defaults `gemini-3.1-flash-lite,gemini-3.5-flash` which matches code, but the primary model in code is `gemini-3-flash-preview`, not the `gemini-2.5-flash` style names shown in some README examples. Trust `app/core/config.py`.

---

## Key rotation & proxy

### Multiple keys

```env
GEMINI_API_KEYS=AIza_first,AIza_second,AIza_third
```

Parsed in `get_api_keys()` (`app/core/config.py:54`): split on `,`, strip, preserve order, deduplicate. `_KeyRotator` (`app/services/ai_engine.py:53`) round-robins the starting offset so load is spread.

`GOOGLE_API_KEY` as comma-separated list is **not** split by config — only `GEMINI_API_KEYS` / `GEMINI_API_KEY` are. If you use `GOOGLE_API_KEY` with multiple keys, prefer `GEMINI_API_KEYS`.

### Proxy

```env
GENAI_PROXY=http://127.0.0.1:1080
# or
HTTP_PROXY=http://proxy.example.com:8080
HTTPS_PROXY=http://proxy.example.com:8080
```

Used in two places:

- `ai_engine._build_client()` — `httpx.HTTPTransport(proxy=proxy_url)` (`app/services/ai_engine.py:40`)
- `cdn.fetch_cdn_resource()` — `httpx.AsyncHTTPTransport(proxy=proxy_url)` (`app/services/cdn.py:20`)

Useful for restricted networks (e.g. Hugging Face Spaces fetching Tailwind/Vazirmatn, or Gemini calls from behind a filter).

---

## ffmpeg

```env
# explicit path (Windows example)
FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe

# otherwise ensure `ffmpeg` is on PATH
ffmpeg -version  # should print version
```

Tuning knobs are constants in `app/services/audio_processor.py:20`:

| Constant | Default | Meaning |
|---|---|---|
| `OUT_EXT` / `OUT_CODEC` / `OUT_BITRATE` | `webm` / `libopus` / `32k` | Output container/codec/bitrate |
| `OUT_SR` / `OUT_CHANNELS` | `16000` / `1` | Sample rate / mono |
| `TRIM_THRESHOLD_DB` | `-40` | Silence threshold |
| `MAX_INTERNAL_SILENCE_S` | `0.6` | Collapse gaps longer than this |
| `LOUDNORM` | `I=-16:TP=-1.5:LRA=11` | EBU R128 target |

Change bitrate to `64k` if extraction quality needs it (see `FIXES.md:5`). Switch to WAV by setting `OUT_CODEC=None`.

---

## .env template

Copy-paste starter (`.env.example` pattern):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/vcr
GEMINI_API_KEYS=key1,key2
GENAI_FALLBACK_MODELS=gemini-3.1-flash-lite,gemini-3.5-flash
GENAI_TIMEOUT_MS=60000
GENAI_RETRY_BACKOFF_SECONDS=1.5
GENAI_OVERLOAD_RETRIES=1
GENAI_PROXY=http://127.0.0.1:1080
FFMPEG_PATH=
PORT=8000
```

!!! warning "Do not commit .env"
    `.env` is gitignored. Set secrets via **Hugging Face Space → Settings → Variables and secrets** or your PaaS secret store for deployments.
