from google import genai
from google.genai.types import HttpOptions, HttpRetryOptions
import os
import json
import httpx  # <-- new
from dotenv import load_dotenv

load_dotenv()


class PromptGenerator:
    @staticmethod
    def generate_section_prompt(questions):
        specs = []
        for q in questions:
            if q.manual_prompt:
                specs.append(f"CODE {q.v_code}: {q.manual_prompt}")
            else:
                opt_str = f"Options (CODES): {json.dumps(q.coding_options, ensure_ascii=False)}" if q.coding_options else "testeles"
                specs.append(f"VarCode: {q.v_code} | Question: {q.question_text_fa} | Type: {q.response_type} | {opt_str}")
                print(q.coding_options)
                if q.manual_prompt: print("\n\nmanual prompt is not empty!!!!!\n\n")
        return f"""
        You are a medical data entry system.
        Analyze the audio and extract answers for these codes:
        {chr(10).join(specs)}
        
        CRITICAL RULES:
        1. Return Farsi language.
        1. Return ONLY a valid JSON object. No conversational text.
        2. Use VarCode as the KEY.
        3. For Categorical/Dichotomous, return the integer KEY from the options provided.
        4. If a value is missing, return null.
        5. Output format: 
        {{"transcript": "...", "data": {{"VCODE": "VALUE"}}}}
        """

    @staticmethod
    def process_audio(audio_path, questions):
        # Read proxy URL from environment (GENAI_PROXY, then HTTP_PROXY, then HTTPS_PROXY)
        proxy_url = (
            os.getenv("GENAI_PROXY")
            or os.getenv("HTTP_PROXY")
            or os.getenv("HTTPS_PROXY")
        )

        # Build retry config (1 attempt)
        retry_config = HttpRetryOptions(attempts=1)

        # Build HttpOptions with proxy transport if a proxy URL is defined
        if proxy_url:
            # Use explicit transport to force all requests through the proxy
            sync_transport = httpx.HTTPTransport(proxy=proxy_url)
            http_config = HttpOptions(
                retry_options=retry_config,
                timeout=60000,
                client_args={"transport": sync_transport},
            )
        else:
            http_config = HttpOptions(
                retry_options=retry_config,
                timeout=60000,
            )

        client = genai.Client(http_options=http_config)

        model_name = "gemini-2.5-flash"
        prompt = PromptGenerator.generate_section_prompt(questions)
        print(prompt)

        # Upload the audio file
        audio_file = client.files.upload(file=audio_path)

        response = client.models.generate_content(
            model=model_name,
            contents=[prompt, audio_file],
        )

        # ---- RAW OUTPUT FOR DEBUGGING ----
        print("\n=== RAW RESPONSE (full text) ===")
        print(response.text)
        print("=== END RAW ===")

        # Clean markdown fences if present
        raw_text = response.text.replace('```json', '').replace('```', '').strip()

        # Try to parse JSON
        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError as e:
            print("Failed to parse JSON. Cleaned output:")
            print(raw_text)
            raise e

        return parsed