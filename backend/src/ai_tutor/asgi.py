"""ASGI entry point: `uvicorn ai_tutor.asgi:app`."""

from .main import create_app

app = create_app()
