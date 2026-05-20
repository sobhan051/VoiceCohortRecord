import json
import os
import httpx
from dotenv import load_dotenv
from google import genai
from google.genai.types import (
    Part,
    HttpOptions,
    HttpRetryOptions,
    GenerateContentConfig,
)

load_dotenv()


class PromptGenerator:
    @staticmethod
    def _build_response_schema(questions, all_sections=None):
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

        if all_sections:
            schema["properties"]["skip_sections"] = {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of section keys to skip (hide) because the patient's speech makes them irrelevant.",
            }

        return schema

    @staticmethod
    def generate_section_prompt(questions, all_sections=None):
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
        if all_sections:
            section_list = "\n".join(
                f"- {s['section_key']}: {s['name_fa']}" for s in all_sections
            )
            prompt += (
                f"The form contains these sections:\n{section_list}\n\n"
                "Based on the patient's speech, some sections may be entirely irrelevant. "
                "Output a `skip_sections` array containing the section keys of any sections that should be hidden. "
                "For example, if the patient is male, skip the reproductive history section. "
                "If no sections should be skipped, return an empty array.\n\n"
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
    def process_audio(audio_path, questions, all_sections=None):
        retry_config = HttpRetryOptions(attempts=1)
        proxy_url = os.getenv("GENAI_PROXY") or os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")

        if proxy_url:
            sync_transport = httpx.HTTPTransport(proxy=proxy_url)
            http_config = HttpOptions(
                retry_options=retry_config,
                timeout=60_000,
                client_args={"transport": sync_transport},
            )
        else:
            http_config = HttpOptions(retry_options=retry_config, timeout=60_000)

        client = genai.Client(http_options=http_config)
        model_name = "gemini-2.5-flash"

        prompt_text = PromptGenerator.generate_section_prompt(questions, all_sections)
        schema = PromptGenerator._build_response_schema(questions, all_sections)

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