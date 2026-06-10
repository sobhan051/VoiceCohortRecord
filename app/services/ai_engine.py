import json
import threading
import time
import os

import httpx
from google import genai
from google.genai import errors
from google.genai.types import (
    Part,
    HttpOptions,
    HttpRetryOptions,
    GenerateContentConfig,
)

from app.core import config

# HTTP status codes worth retrying on a different key / after a backoff:
#   429 RESOURCE_EXHAUSTED  -> that key is out of quota / rate limited
#   503 UNAVAILABLE         -> model overloaded ("high demand")
#   500 INTERNAL            -> transient server error
_QUOTA_CODE = 429
_OVERLOAD_CODES = {500, 503}
_RETRYABLE_CODES = {_QUOTA_CODE} | _OVERLOAD_CODES


def _build_client(api_key=None):
    """Create a genai client wired through the optional outbound proxy.

    The proxy transport is built inline per call (cheap) and `attempts=1`
    disables genai's internal retries, so retry/failover is handled by
    ``_run_with_failover`` instead. When ``api_key`` is None the client falls
    back to its own GEMINI_API_KEY / GOOGLE_API_KEY environment lookup.
    """
    retry_config = HttpRetryOptions(attempts=1)
    proxy_url = config.get_proxy_url()
    if proxy_url:
        sync_transport = httpx.HTTPTransport(proxy=proxy_url)
        http_config = HttpOptions(
            retry_options=retry_config,
            timeout=config.GENAI_TIMEOUT_MS,
            client_args={"transport": sync_transport},
        )
    else:
        http_config = HttpOptions(
            retry_options=retry_config,
            timeout=config.GENAI_TIMEOUT_MS,
        )
    return genai.Client(api_key=api_key, http_options=http_config)


class _KeyRotator:
    """Thread-safe round-robin offset so load is spread across the keys."""

    def __init__(self):
        self._lock = threading.Lock()
        self._counter = 0

    def order(self, n):
        """Return key indices [0, n) starting at the next rotating offset."""
        if n <= 0:
            return []
        with self._lock:
            start = self._counter % n
            self._counter = (self._counter + 1) % n
        return [(start + i) % n for i in range(n)]


_rotator = _KeyRotator()


def _classify(err):
    """Map an exception to a retry decision: ('quota'|'transient'|'fatal').

    ``transient`` covers both server-side overload (503/500) and *transport*
    failures — request timeouts and dropped connections. Those last two are NOT
    ``APIError`` (they're ``httpx`` errors), so without handling them here a
    proxy timeout or "Server disconnected" would skip failover entirely and
    force the field worker to re-record. Treating them as transient lets us back
    off and retry on another key, which is exactly the recovery we want.
    """
    if isinstance(err, errors.APIError):
        code = getattr(err, "code", None)
        if code == _QUOTA_CODE:
            return "quota"
        if code in _OVERLOAD_CODES:
            return "transient"
        return "fatal"
    # Transport-level failures from httpx: timeouts, disconnects, connection
    # resets. All worth retrying; none are quota.
    if isinstance(err, (httpx.TimeoutException, httpx.TransportError)):
        return "transient"
    return "fatal"


def _run_with_failover(call):
    """Run ``call(client)`` against the configured API keys with retry.

    Behavior (designed to never fire a request "for no reason"):
      * On success, return immediately.
      * On a fatal error (bad request, auth, etc.), raise immediately —
        other keys are not burned.
      * On quota (429), move on to the next key once; a key known to be out of
        quota is not retried.
      * On a transient failure (503/500 overload, or a timeout / dropped
        connection), back off briefly and try the next key.
      * After one pass over every key, if at least one key still has quota left
        (i.e. the failures were transient, not quota), do a few extra bounded
        retries with growing backoff. If every key is quota-exhausted, stop.
    """
    keys = config.get_api_keys()
    if not keys:
        # No explicit keys configured: single attempt, env-based client.
        return call(_build_client(None))

    n = len(keys)
    order = _rotator.order(n)
    last_err = None
    quota_exhausted = set()

    # Phase 1 — one shot per key, rotating offset spreads the load.
    for idx in order:
        try:
            return call(_build_client(keys[idx]))
        except Exception as e:
            kind = _classify(e)
            if kind == "fatal":
                raise
            last_err = e
            if kind == "quota":
                quota_exhausted.add(idx)
                print(f"[ai_engine] key #{idx} out of quota; trying next key")
            else:
                print(f"[ai_engine] key #{idx} transient failure ({type(e).__name__}); backing off and rotating")
                time.sleep(config.GENAI_RETRY_BACKOFF_SECONDS)

    # Phase 2 — transient retries, only for keys that still have quota.
    live = [keys[i] for i in range(n) if i not in quota_exhausted]
    for attempt in range(config.GENAI_OVERLOAD_RETRIES):
        if not live:
            break
        time.sleep(config.GENAI_RETRY_BACKOFF_SECONDS * (attempt + 2))
        key = live[attempt % len(live)]
        try:
            return call(_build_client(key))
        except Exception as e:
            kind = _classify(e)
            if kind == "fatal":
                raise
            last_err = e
            if kind == "quota":
                live = [k for k in live if k != key]

    raise last_err


class PromptGenerator:
    @staticmethod
    def check_anomalies(answers, questions_meta, confidence_reasons=None):
        # Build base prompt
        prompt = (
            "You are a medical quality control assistant. "
            "Review the following patient answers for clinical inconsistencies, "
            "medically impossible values, contradictions, or suspicious combinations.\n\n"
        )

        # Append field descriptions
        field_descriptions = []
        for q in questions_meta:
            vc = q["v_code"]
            if vc not in answers or answers[vc] is None:
                continue
            val = answers[vc]
            desc = f"Q: {q['question_text_fa']} (code {vc}, type {q['response_type']}"
            if q.get("unit"):
                desc += f", unit {q['unit']}"
            desc += f") → ANSWER: {val}"
            if q.get("coding_options"):
                try:
                    opts = json.loads(q["coding_options"]) if isinstance(q["coding_options"], str) else q["coding_options"]
                    if val in opts:
                        desc += f" ({opts[val]})"
                except:
                    pass
            field_descriptions.append(desc)
        prompt += "\n".join(field_descriptions) + "\n\n"

        # Append confidence hints if available
        if confidence_reasons:
            hints = []
            for vc, reason in confidence_reasons.items():
                if reason:
                    hints.append(f"- {vc}: {reason}")
            if hints:
                prompt += (
                    "The extraction AI flagged the following fields with possible issues:\n"
                    + "\n".join(hints)
                )

        # Final instructions
        prompt += (
            "Return a JSON array of warnings. Each warning must have: "
            "'v_code' (the code of the suspicious field "
            "'message' (short explanation in Persian), and "
            "'severity' (either 'warning' or 'critical'). "
            "If everything looks consistent, return an empty array.\n"
            "Output ONLY a valid JSON array, no other text."
        )

        warning_schema = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "v_code": {"type": "string"},
                    "message": {"type": "string"},
                    "severity": {"type": "string", "enum": ["warning", "critical"]}
                },
                "required": ["v_code", "message", "severity"]
            }
        }

        def _call(client):
            return client.models.generate_content(
                model=config.ANOMALY_MODEL,
                contents=[prompt],
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=warning_schema,
                    temperature=0.0,
                ),
            )

        response = _run_with_failover(_call)

        print("\n=== ANOMALY RAW RESPONSE ===")
        print(response.text)
        print("=== END ANOMALY ===\n")
        return json.loads(response.text)

    @staticmethod
    def _build_response_schema(questions):
        data_props = {}
        conf_props = {}
        reason_props = {}
        for q in questions:
            vc = q.v_code
            data_props[vc] = {
                "type": "string",
                "nullable": True,
                "description": (q.question_text_fa[:120] if q.question_text_fa else ""),
            }
            conf_props[vc] = {
                "type": "number",
                "nullable": True,
                "minimum": 0.0,
                "maximum": 1.0,
                "description": f"Confidence for {vc}",
            }
            reason_props[vc] = {
                "type": "string",
                "description": f"Reason why confidence is less than 1 for {vc}. Empty string if confidence is 1.",
            }

        schema = {
            "type": "object",
            "properties": {
                "transcript": {"type": "string"},
                "data": {
                    "type": "object",
                    "properties": data_props,
                    "required": list(data_props.keys()),
                },
                "confidence": {
                    "type": "object",
                    "properties": conf_props,
                    "required": list(conf_props.keys()),
                },
                "confidence_reasons": {
                    "type": "object",
                    "properties": reason_props,
                    "required": list(reason_props.keys()),
                },
            },
            "required": ["transcript", "data", "confidence", "confidence_reasons"],
        }

        return schema

    @staticmethod
    def generate_section_prompt(questions):
        specs = []
        for q in questions:
            if q.manual_prompt:
                specs.append(f"CODE {q.v_code}: {q.manual_prompt}")
                continue

            q_type = q.response_type
            q_text = q.question_text_fa or ""
            unit = q.unit or ""

            if q_type == "MultiSelect":
                if q.coding_options:
                    try:
                        opts = (
                            json.loads(q.coding_options)
                            if isinstance(q.coding_options, str)
                            else q.coding_options
                        )
                    except Exception:
                        opts = {}
                    option_list = ", ".join(f"{k}={v}" for k, v in opts.items())
                    rule = (
                        f"Return ONLY a comma-separated list of the integer codes that are mentioned. "
                        f"Options: {option_list}. If none mentioned, return null. Example: '1,3,5'."
                    )
                else:
                    rule = "Return a comma-separated list of codes mentioned. If none, return null."
                specs.append(
                    f"CODE {q.v_code} | Question: {q_text} | Rule: {rule}"
                )

            elif q_type in ("Categorical", "Dichotomous"):
                if q.coding_options:
                    try:
                        opts = (
                            json.loads(q.coding_options)
                            if isinstance(q.coding_options, str)
                            else q.coding_options
                        )
                    except Exception:
                        opts = {}
                    option_list = ", ".join(f"{k}={v}" for k, v in opts.items())
                    rule = f"Return ONLY the integer code. Options: {option_list}. If not mentioned, return null."
                else:
                    rule = "Return the code exactly as heard. If missing, return null."
                specs.append(
                    f"CODE {q.v_code} | Question: {q_text} | Rule: {rule}"
                )

            elif q_type in ("Numeric", "Continuous"):
                if unit:
                    unit_clean = unit.strip().replace(" ", "")
                    rule = (
                        f"Extract the numeric value. The expected unit is '{unit_clean}'. "
                        f"If the speaker mentions a value in a different unit (e.g., متر, میلی‌متر), "
                        f"convert it to {unit_clean} accurately. "
                        f"If no unit is mentioned, assume the value is already in {unit_clean}. "
                        f"Return only the final numeric value (no unit). If missing, return null."
                    )
                else:
                    rule = "Extract the numeric value. Remove any spoken unit. If missing, return null."
                specs.append(
                    f"CODE {q.v_code} | Question: {q_text} | Rule: {rule}"
                )

            elif q_type == "Date":
                rule = "Format as YYYY-MM-DD. If only year, use YYYY-01-01. If missing, return null."
                specs.append(
                    f"CODE {q.v_code} | Question: {q_text} | Rule: {rule}"
                )

            elif q_type == "Text":
                rule = "Return the exact answer phrase. If missing, return null."
                specs.append(
                    f"CODE {q.v_code} | Question: {q_text} | Rule: {rule}"
                )

            else:
                specs.append(
                    f"CODE {q.v_code} | Question: {q_text} | Type: {q_type}. Extract the value, return null if missing."
                )

        prompt = (
            "You are a medical data entry assistant. "
            "Analyze the audio transcript and extract answers according to the rules below.\n\n"
            + "\n".join(specs)
            + "\n\n"
        )
        prompt += (
            "IMPORTANT: Follow the rule for each CODE exactly. "
            "For every field also provide a confidence score between 0 and 1 "
            "(0 = completely guessing, 1 = absolutely certain). "
            "Additionally, for each field provide a short reason (in Persian or English) explaining "
            "why the confidence is lower than 1. If confidence is 1, the reason must be an empty string."
        )
        return prompt

    @staticmethod
    def process_audio(audio_path, questions):
        """Process audio - supports WebM, M4A, OGG, and WAV formats."""
        
        # Determine MIME type from file extension
        file_ext = os.path.splitext(audio_path)[1].lower()
        
        mime_type_map = {
            '.webm': 'audio/webm',
            '.m4a': 'audio/mp4',  # Gemini accepts audio/mp4 for M4A files
            '.mp4': 'audio/mp4',
            '.ogg': 'audio/ogg',
            '.wav': 'audio/wav',
            '.mp3': 'audio/mp3',
        }
        
        mime_type = mime_type_map.get(file_ext, 'audio/wav')
        
        # For WebM files, Gemini 1.5+ supports them natively
        # No conversion needed!
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()
        
        # Log format for debugging
        print(f"[ai_engine] Processing audio: {audio_path} ({mime_type}, size: {len(audio_bytes)} bytes)")
        
        audio_part = Part.from_bytes(data=audio_bytes, mime_type=mime_type)
        
        prompt_text = PromptGenerator.generate_section_prompt(questions)
        schema = PromptGenerator._build_response_schema(questions)
        
        def _call(client):
            return client.models.generate_content(
                model=config.AUDIO_MODEL,
                contents=[prompt_text, audio_part],
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema,
                    temperature=0.0,
                ),
            )
        
        response = _run_with_failover(_call)
        
        print("\n=== RAW RESPONSE ===")
        print(response.text[:500])  # Print first 500 chars
        print("=== END RAW ===\n")
        
        return json.loads(response.text)