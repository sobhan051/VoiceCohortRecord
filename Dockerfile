FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV PORT=7860

# Shell form so $PORT (set by the platform) is expanded at runtime.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}
