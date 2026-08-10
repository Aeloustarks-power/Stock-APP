"""US Stock API entrypoint."""
from __future__ import annotations

import os

from backend.api import create_app

app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(create_app(), host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
