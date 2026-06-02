import json

import httpx
from google import genai
from google.genai.types import (
    Part,
    HttpOptions,
    HttpRetryOptions,
    GenerateContentConfig,
)

from app.core import config


def _build_client():
    """Create a genai client wired through the optional outbound proxy.

    The proxy transport is built inline per call (cheap) and `attempts=1`
    disables genai's internal retries, matching the original behavior.
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
    return genai.Client(http_options=http_config)


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
                    + "\n".join(hints) +
                    "\nPay special attention to these fields for contradictions or inconsistencies.\n\n"
                )

        # Final instructions
        prompt += (
            "Return a JSON array of warnings. Each warning must have: "
            "'v_code' (the code of the suspicious field, or 'general' if it's a global issue), "
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

        client = _build_client()

        response = client.models.generate_content(
            model=config.ANOMALY_MODEL,
            contents=[prompt],
            config=GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=warning_schema,
                temperature=0.0,
            ),
        )

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

            if q_type in ("Categorical", "Dichotomous"):
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
        client = _build_client()
        model_name = config.AUDIO_MODEL

        prompt_text = PromptGenerator.generate_section_prompt(questions)
        schema = PromptGenerator._build_response_schema(questions)

        with open(audio_path, "rb") as f:
            audio_bytes = f.read()
        audio_part = Part.from_bytes(data=audio_bytes, mime_type="audio/wav")

        response = client.models.generate_content(
            model=model_name,
            contents=[prompt_text, audio_part],
            config=GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
                temperature=0.0,
            ),
        )

        print("\n=== RAW RESPONSE ===")
        print(response.text)
        print("=== END RAW ===\n")

        return json.loads(response.text)
