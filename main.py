"""Entrypoint shim.

The application now lives in the ``app`` package. This module keeps the
documented commands working:

    python main.py
    uvicorn main:app --reload --host 127.0.0.1 --port 8000
"""
from app.main import app

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
