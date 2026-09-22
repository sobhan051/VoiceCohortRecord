"""Entrypoint shim.

The application now lives in the ``app`` package. This module keeps the
documented commands working:

    python main.py
    uvicorn main:app --reload --host 127.0.0.1 --port 8000
"""
import os

from app.main import app

if __name__ == "__main__":
    import uvicorn

    # Bind 0.0.0.0 + honor $PORT so hosting platforms (e.g. Render) can route.
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
