import json
import os
from dotenv import load_dotenv
from google import genai
from google.genai.types import (
    Part,
    HttpOptions,
    HttpRetryOptions,
    GenerateContentConfig,
)
import httpx
load_dotenv()


class PromptGenerator:
    """
    Generates prompts and handles the Gemini voice‑processing pipeline.
    All audio is sent inline — no file upload API is used.
    """

    @staticmethod
    def _build_response_schema(questions):
        """
        Construct a response_schema that enforces:
        {
          "transcript": string,
          "data": { "VCODE": string | null, ... },
          "confidence": { "VCODE": number | null, ... }   (optional but useful)
        }
        """
        data_props = {}
        conf_props = {}
        for q in questions:
            vc = q.v_code
            # Each value is a string (nullable)
            data_props[vc] = {
                "type": "string",
                "nullable": True,
                "description": (
                    q.question_text_fa[:120] if q.question_text_fa else ""
                ),
            }
            # Confidence: number between 0 and 1, nullable
            conf_props[vc] = {
                "type": "number",
                "nullable": True,
                "minimum": 0.0,
                "maximum": 1.0,
                "description": f"Confidence for {vc}",
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
            },
            "required": ["transcript", "data", "confidence"],
        }
        return schema

    @staticmethod
    def generate_section_prompt(questions):
        """
        Create a detailed prompt with per‑question extraction rules.
        Manual prompts override automatic rules.
        """
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
                    # Clean up unit string (optional: trim spaces, unify variations)
                    unit_clean = unit.strip().replace(" ", "")  # e.g., "سانتی متر" -> "سانتیمتر"
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
                # Fallback
                specs.append(
                    f"CODE {q.v_code} | Question: {q_text} | Type: {q_type}. Extract the value, return null if missing."
                )

        prompt = (
            "You are a medical data entry assistant. "
            "Analyze the audio transcript and extract answers according to the rules below.\n\n"
            + "\n".join(specs)
            + "\n\nIMPORTANT: Follow the rule for each CODE exactly. "
            "For every field also provide a confidence score between 0 and 1 (0 = completely guessing, 1 = absolutely certain)."
        )
        return prompt

    @staticmethod
    def process_audio(audio_path, questions):
        """
        Reads audio from disk and sends it inline together with the prompt.
        Returns the parsed JSON (transcript, data, confidence).
        """
        # Ensure exactly 1 attempt, no retries
        # 1. Ensure exactly 1 attempt, no retries
        retry_config = HttpRetryOptions(attempts=1)

        # 2. Read proxy configuration from environment variable
        proxy_url = os.getenv("GENAI_PROXY")  # e.g., http://127.0.0.1:8080
        if not proxy_url:
            # Fallback to standard HTTP_PROXY/HTTPS_PROXY environment variables
            proxy_url = os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")

        # 3. Configure proxy IF a proxy URL is found
        http_config = None
        if proxy_url:
            # Configure sync and async transports to use the proxy
            # Note: For SOCKS5 proxies, install with: pip install httpx[socks]
            sync_transport = httpx.HTTPTransport(proxy=proxy_url)
            async_transport = httpx.AsyncHTTPTransport(proxy=proxy_url) if hasattr(httpx, 'AsyncHTTPTransport') else None

            http_config = HttpOptions(
                retry_options=retry_config,
                timeout=60_000,
                client_args={"transport": sync_transport},
                async_client_args={"transport": async_transport} if async_transport else {},
            )
        else:
            # No proxy – proceed as before
            http_config = HttpOptions(retry_options=retry_config, timeout=60_000)
        client = genai.Client(http_options=http_config)

        model_name = "gemini-2.5-flash"  # fast and accurate

        # Generate the prompt
        prompt_text = PromptGenerator.generate_section_prompt(questions)

        # Build the response schema from the current set of questions
        schema = PromptGenerator._build_response_schema(questions)

        # Read audio bytes
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        # Create an inline Part
        audio_part = Part.from_bytes(data=audio_bytes, mime_type="audio/wav")

        # Single API call
        response = client.models.generate_content(
            model=model_name,
            contents=[prompt_text, audio_part],
            config=GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
                temperature=0.0,  # deterministic output
            ),
        )

        # Debug: print the raw (already valid JSON because of schema)
        print("\n=== RAW RESPONSE ===")
        print(response.text)
        print("=== END RAW ===\n")

        # No need to strip markdown; response.text is guaranteed to be valid JSON
        return json.loads(response.text)