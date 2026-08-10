"""HTTP API entry (re-exports create_app from service during modularization)."""
from backend.service import create_app

app = None
try:
    app = create_app()
except Exception:
    app = None

__all__ = ["create_app", "app"]
