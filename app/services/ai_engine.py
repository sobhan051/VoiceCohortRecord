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
from app.services.visibility import parse_rules

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


def _run_with_failover(call, primary):
    """Run ``call(client, model)`` across a chain of models and API keys.

    Key rotation happens first (one shot per key, then bounded overload
    retries — see ``_try_keys``). Only when every key failed with a
    *transient* failure (503/500 "high demand", timeout, dropped connection)
    do we move to the next model in ``[primary] + FALLBACK_MODELS``.
    Fatal errors still raise immediately; quota exhaustion on every key stops.
    """
    models = [primary] + [m for m in config.FALLBACK_MODELS if m != primary]
    last_err = None
    for i, model in enumerate(models):
        try:
            return _try_keys(call, model)
        except Exception as e:
            kind = _classify(e)
            if kind != "transient" or i == len(models) - 1:
                raise
            print(f"[ai_engine] model {model} overloaded; switching to {models[i + 1]}")
            last_err = e
    raise last_err


def _try_keys(call, model):
    """One full key-failover pass against a single model.

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
        return call(_build_client(None), model)

    n = len(keys)
    order = _rotator.order(n)
    last_err = None
    quota_exhausted = set()

    # Phase 1 — one shot per key, rotating offset spreads the load.
    for idx in order:
        try:
            return call(_build_client(keys[idx]), model)
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
            return call(_build_client(key), model)
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
    def _format_warning_schema():
        """Shared JSON schema for anomaly-check responses (section + final)."""
        return {
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

    @staticmethod
    def _append_option_meanings(desc_parts, q):
        """Append the human meaning of each option code (e.g. 1=زن, 2=مرد)
        so the checker reasons about clinical meaning, not opaque codes."""
        opts = q.get("coding_options")
        if not opts:
            return
        try:
            opts = json.loads(opts) if isinstance(opts, str) else opts
        except Exception:
            return
        if isinstance(opts, dict) and opts:
            meaning = ", ".join(f"{k}={v}" for k, v in opts.items())
            desc_parts.append(f"options: {meaning}")

    @classmethod
    def _build_field_line(cls, q, value, include_options=True):
        parts = [
            f"Q: {q['question_text_fa']} (code {q['v_code']}, type {q['response_type']}"
        ]
        if q.get("unit"):
            parts.append(f", unit {q['unit']}")
        parts.append(f") → ANSWER: {value}")
        if include_options:
            cls._append_option_meanings(parts, q)
        return "".join(parts)

    @classmethod
    def check_anomalies(cls, answers, questions_meta, confidence_reasons=None, transcript=None):
        # Build base prompt
        prompt = (
            "You are a medical quality control assistant. "
            "Review the following patient answers for clinical inconsistencies, "
            "medically suspicious values, contradictions, or suspicious combinations. "
            "IMPORTANT: Be tolerant of small inconsistencies. Only flag issues that are "
            "clearly medically significant or potentially unsafe. "
            "Do not nitpick minor or harmless details. "
            "A value of \"N/A\" means the question was not applicable (its precondition "
            "was not met); never flag it as missing, contradictory, or suspicious.\n\n"
        )

        # Append field descriptions (options decoded so the model reasons about
        # the clinical meaning behind each code)
        field_descriptions = []
        for q in questions_meta:
            vc = q["v_code"]
            if vc not in answers or answers[vc] is None:
                continue
            field_descriptions.append(cls._build_field_line(q, answers[vc]))
        if field_descriptions:
            prompt += "Patient answers:\n" + "\n".join(field_descriptions) + "\n\n"

        # Append confidence hints if available
        if confidence_reasons:
            hints = []
            for vc, reason in confidence_reasons.items():
                if reason:
                    hints.append(f"- {vc}: {reason}")
            if hints:
                prompt += (
                    "The extraction AI flagged the following fields as uncertain; "
                    "pay extra attention to them:\n"
                    + "\n".join(hints)
                    + "\n\n"
                )

        # Verbatim transcript — helps the checker catch values mentioned in
        # speech that were not extracted, and confirm suspicious readings.
        if transcript:
            prompt += (
                "Verbatim transcript of the recording (the authoritative record):\n"
                + transcript
                + "\n\n"
            )

        # Final instructions
        prompt += (
            "Return a JSON array of warnings. Each warning must have: "
            "'v_code' (the code of the suspicious field), "
            "'message' (short explanation in Persian), and "
            "'severity' (either 'warning' or 'critical'). "
            "If everything looks consistent, return an empty array.\n"
            "Output ONLY a valid JSON array, no other text."
        )

        def _call(client, model):
            return client.models.generate_content(
                model=model,
                contents=[prompt],
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=PromptGenerator._format_warning_schema(),
                    temperature=0.0,
                ),
            )

        response = _run_with_failover(_call, config.ANOMALY_MODEL)

        print("\n=== ANOMALY RAW RESPONSE ===")
        print(response.text)
        print("=== END ANOMALY ===\n")
        try:
            parsed = json.loads(response.text)
            return parsed if isinstance(parsed, list) else [parsed]
        except Exception:
            return []

    @classmethod
    def check_final_anomalies(cls, all_answers, all_questions_meta, transcripts=None, confidence_reasons=None):
        """Cross-section quality pass over ALL answers of a submission at submit
        time — catches contradictions between sections (e.g. section B says
        'never smoked' while section C's meds include a COPD drug)."""
        prompt = (
            "You are a medical quality control assistant reviewing the COMPLETE "
            "set of answers for one patient across ALL form sections. "
            "Look for inconsistencies, contradictions, medically impossible or "
            "suspicious values, and unsafe combinations that may span across "
            "different sections of the questionnaire. "
            "IMPORTANT: Be tolerant of small inconsistencies. Only flag issues that "
            "are clearly medically significant or potentially unsafe. "
            "Do not nitpick minor wording or harmless details. "
            "A value of \"N/A\" means the question was not applicable (its precondition "
            "was not met); never flag it as missing, contradictory, or suspicious.\n\n"
        )

        # All answered fields with section context.
        for section, questions_meta in all_questions_meta.items():
            answered = [
                (q, all_answers[q["v_code"]])
                for q in questions_meta
                if all_answers.get(q["v_code"]) is not None
            ]
            if not answered:
                continue
            prompt += f"[Section: {section}]\n"
            for q, val in answered:
                prompt += cls._build_field_line(q, val) + "\n"
            prompt += "\n"

        # Verbatim transcripts — give the checker the actual speech to confirm
        # suspicious readings or catch mentioned-but-unanswered values.
        if transcripts:
            prompt += "Verbatim transcripts of each section's recording (authoritative record):\n"
            for section, text in transcripts.items():
                if text:
                    prompt += f"[Section {section}]: {text}\n"

        if confidence_reasons:
            hints = [
                f"- {vc}: {reason}"
                for vc, reason in confidence_reasons.items()
                if reason
            ]
            if hints:
                prompt += (
                    "The extraction AI flagged the following fields as uncertain; "
                    "pay extra attention to them:\n"
                    + "\n".join(hints)
                    + "\n\n"
                )

        prompt += (
            "Return a JSON array of warnings. Each warning must have: "
            "'v_code' (the code of the suspicious field), "
            "'message' (short explanation in Persian), and "
            "'severity' (either 'warning' or 'critical'). "
            "If everything looks consistent, return an empty array.\n"
            "Output ONLY a valid JSON array, no other text."
        )

        def _call(client, model):
            return client.models.generate_content(
                model=model,
                contents=[prompt],
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=PromptGenerator._format_warning_schema(),
                    temperature=0.0,
                ),
            )

        response = _run_with_failover(_call, config.ANOMALY_MODEL)

        print("\n=== [FINAL ANOMALY RAW RESPONSE] ===")
        print(response.text)
        print("=== END FINAL ANOMALY ===\n")

        try:
            parsed = json.loads(response.text)
            return parsed if isinstance(parsed, list) else [parsed]
        except Exception:
            return []

    @staticmethod
    def _build_response_schema(questions):
        data_props = {}
        conf_props = {}
        reason_props = {}
        # Group questions by group_pair so we can add indexed keys
        grouped = {}  # group_pair -> list of questions
        for q in questions:
            if q.group_pair:
                grouped.setdefault(q.group_pair, []).append(q)

        MAX_GROUP_ENTRIES = 6
        # Track which vcodes are the base (non-indexed) ones for required lists
        base_vcodes = set()

        for q in questions:
            vc = q.v_code
            base_vcodes.add(vc)
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

        # Add indexed keys for grouped questions (M1_1, M3_1, etc.) as OPTIONAL
        for gp, gp_questions in grouped.items():
            for idx in range(1, MAX_GROUP_ENTRIES):
                for q in gp_questions:
                    vc_idx = f"{q.v_code}_{idx}"
                    data_props[vc_idx] = {
                        "type": "string",
                        "nullable": True,
                        "description": f"Additional entry {idx+1} for {q.v_code} (group: {gp})",
                    }
                    conf_props[vc_idx] = {
                        "type": "number",
                        "nullable": True,
                        "minimum": 0.0,
                        "maximum": 1.0,
                        "description": f"Confidence for {vc_idx}",
                    }
                    reason_props[vc_idx] = {
                        "type": "string",
                        "description": f"Reason for {vc_idx}. Empty string if confidence is 1.",
                    }

        schema = {
            "type": "object",
            "properties": {
                "transcript": {"type": "string"},
                "data": {
                    "type": "object",
                    "properties": data_props,
                    "required": list(base_vcodes),
                },
                "confidence": {
                    "type": "object",
                    "properties": conf_props,
                    "required": list(base_vcodes),
                },
                "confidence_reasons": {
                    "type": "object",
                    "properties": reason_props,
                    "required": list(base_vcodes),
                },
            },
            "required": ["transcript", "data", "confidence", "confidence_reasons"],
        }

        return schema

    @staticmethod
    def generate_section_prompt(questions):
        specs = []
        # Detect grouped questions
        grouped = {}  # group_pair -> list of v_codes
        for q in questions:
            if q.group_pair:
                grouped.setdefault(q.group_pair, []).append(q)

        for q in questions:
            if q.manual_prompt:
                specs.append(f"CODE {q.v_code}: {q.manual_prompt}")
                continue

            q_type = q.response_type
            q_text = q.question_text_fa or ""
            unit = q.unit or ""
            group_note = ""
            if q.group_pair:
                partners = grouped[q.group_pair]
                partner_codes = [p.v_code for p in partners if p.v_code != q.v_code]
                group_note = (
                    f" [GROUPED: '{q.group_pair}' — this question can have multiple answers. "
                    f"If the speaker mentions multiple items, extract each as {q.v_code}_0, {q.v_code}_1, etc. "
                    f"Group partners: {', '.join(partner_codes)}. Use the same index for each partner. "
                    f"IMPORTANT: Only return entries for items actually mentioned. Do NOT return null for unused indices. "
                    f"If only 1 medicine is mentioned, return only {q.v_code} (plain, no index). "
                    f"If 2 medicines are mentioned, return {q.v_code} and {q.v_code}_1 only."
                )

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
                    f"CODE {q.v_code} | Question: {q_text} | Rule: {rule}{group_note}"
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
                    f"CODE {q.v_code} | Question: {q_text} | Rule: {rule}{group_note}"
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
                    f"CODE {q.v_code} | Question: {q_text} | Rule: {rule}{group_note}"
                )

            elif q_type == "Date":
                rule = "Format as YYYY-MM-DD. If only year, use YYYY-01-01. If missing, return null."
                specs.append(
                    f"CODE {q.v_code} | Question: {q_text} | Rule: {rule}{group_note}"
                )

            elif q_type == "Text":
                rule = "Return the exact answer phrase. If missing, return null."
                specs.append(
                    f"CODE {q.v_code} | Question: {q_text} | Rule: {rule}{group_note}"
                )

            else:
                specs.append(
                    f"CODE {q.v_code} | Question: {q_text} | Type: {q_type}. Extract the value, return null if missing.{group_note}"
                )

        # Dependency rules from questions.visibility_rules (JSONB). These are
        # binding — the backend re-checks them after extraction, but telling
        # the model up front avoids wasted or contradictory values.
        dep_lines = []
        for q in questions:
            rules = parse_rules(getattr(q, "visibility_rules", None))
            if not rules:
                continue
            rule_strs = [
                "[" + " OR ".join(f"{r['v_code']}={v}" for v in r["values"]) + "]"
                for r in rules["rules"]
            ]
            joiner = " OR " if rules["logic"] == "any" else " AND "
            dep_lines.append(
                f"{q.v_code}: applies only if " + joiner.join(rule_strs)
                + "; if the condition is not satisfied return \"N/A\" for it."
            )
        if dep_lines:
            specs.append(
                "\nDEPENDENCY RULES (a question that does not apply must be \"N/A\"):\n"
                + "\n".join(dep_lines)
            )

        prompt = (
            "You are a medical data entry assistant. "
            "Transcribe the audio in Farsi and analyze it and extract answers according to the rules below.\n\n"
            + "\n".join(specs)
            + "\n\n"
            "IMPORTANT: For each rule, extract ONLY what is actually said on the recording. "
            "Never guess, infer, or fill in a value that is not clearly spoken. "
            "If a field is not mentioned or is unclear, return null for that field. "
            "Do not invent or fabricate answers.\n\n"
            "TRANSCRIPT: Provide a FULL, VERBATIM transcript of the speech in Farsi. "
            "Transcribe every word that is said, exactly as spoken, without summarizing, "
            "correcting, or editing. The transcript is the official record of the recording "
            "and will be used to recover any field that could not be extracted. "
            "If a field is unclear, still extract every other field and leave only the "
            "unclear fields as null.\n\n"
            "CONDITIONAL QUESTIONS: Some questions only apply when another answer "
            "qualifies (for example, 'at what age did you quit smoking?' only applies "
            "if the patient smoked and later stopped). If what was said makes a "
            "question clearly NOT APPLICABLE, set its value to exactly \"N/A\" with "
            "confidence 1 and reason \"غیرمرتبط\". Only do this when another stated "
            "answer rules the question out — never merely because the value was not "
            "mentioned. The questions listed under DEPENDENCY RULES are binding: "
            "when their condition is not satisfied by the stated answers, that "
            "field MUST be \"N/A\".\n\n"
            "For every field also provide a confidence score between 0 and 1 "
            "(0 = completely guessing, 1 = absolutely certain). "
            "The confidence must be below 1 whenever the value was hard to hear, "
            "ambiguous, or inferred. "
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
        
        def _call(client, model):
            return client.models.generate_content(
                model=model,
                contents=[prompt_text, audio_part],
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema,
                    temperature=0.0,
                ),
            )

        response = _run_with_failover(_call, config.AUDIO_MODEL)
        
        print("\n=== RAW RESPONSE ===")
        try:
            print(json.dumps(json.loads(response.text), indent=2, ensure_ascii=False))
        except Exception:
            print(response.text)
        print("=== END RAW ===\n")
        
        return json.loads(response.text)