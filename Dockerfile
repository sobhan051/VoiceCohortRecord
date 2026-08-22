FROM python:3.10-slim

# ffmpeg is a system binary used for audio preprocessing (silence trim,
# loudness normalization). libopus support comes with the distro ffmpeg.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
# HF Spaces (Docker SDK) routes traffic to the app_port declared in README.md.
ENV PORT=7860

# Shell form so $PORT (set by the platform) is expanded at runtime.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
