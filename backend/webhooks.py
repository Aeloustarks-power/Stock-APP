"""Outbound webhooks: push JSON when something happens (no one is clicking).

Ideas: POST to IDEAS_WEBHOOK_URL after Gemini ranks a batch. Empty URL = off.
Google Apps Script web apps often reply 302 after doPost — that still counts as success.

Apps Script cannot read custom headers in doPost. Send Content-Type, and if
IDEAS_WEBHOOK_SECRET is set, put it on the JSON body as `secret` (not a header).
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

_TIMEOUT_SECONDS = 8.0
# 302/303: Google Apps Script accepted the POST and redirected to the echo URL.
_OK_STATUSES = {200, 201, 202, 204, 301, 302, 303, 307, 308}


def _looks_like_google_login_html(raw: bytes) -> bool:
    head = (raw or b"")[:500].lower()
    return b"<!doctype html" in head or b"<html" in head


def _result_from_status(status: int, raw: bytes = b"", error: str = "") -> Dict[str, Any]:
    if status in _OK_STATUSES and _looks_like_google_login_html(raw):
        return {
            "ok": False,
            "status": status,
            "error": (
                "Google returned a login page. In Apps Script: Deploy → Web app → "
                "Who has access = Anyone (not 'only me'). Then New version → Deploy."
            ),
        }
    if status in _OK_STATUSES:
        return {"ok": True, "status": status, "error": ""}
    return {"ok": False, "status": status, "error": error or f"HTTP {status}"}


def ideas_webhook_url() -> str:
    return (os.getenv("IDEAS_WEBHOOK_URL") or "").strip()


def ideas_webhook_secret() -> str:
    return (os.getenv("IDEAS_WEBHOOK_SECRET") or "").strip()


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        return None


def _slim_idea(item: Dict[str, Any]) -> Dict[str, Any]:
    metrics = item.get("metrics") if isinstance(item.get("metrics"), dict) else {}
    return {
        "symbol": str(item.get("symbol") or "").strip().upper(),
        "thesis": str(item.get("thesis") or "").strip(),
        "thesis_zh": str(item.get("thesis_zh") or "").strip(),
        "catalyst": str(item.get("catalyst") or "").strip(),
        "catalyst_zh": str(item.get("catalyst_zh") or "").strip(),
        "risk": str(item.get("risk") or "").strip(),
        "risk_zh": str(item.get("risk_zh") or "").strip(),
        "confidence": item.get("confidence"),
        "price": metrics.get("price"),
    }


def build_ideas_payload(
    *,
    portfolio_id: Optional[str],
    source: str,
    ideas: List[Dict[str, Any]],
) -> Dict[str, Any]:
    at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    pid = str(portfolio_id or "").strip()
    slim = [_slim_idea(i) for i in ideas if i.get("symbol")]
    payload: Dict[str, Any] = {
        "event": "ideas.generated",
        "at": at,
        "portfolio_id": pid,
        "source": source,
        "ideas": slim,
        "rows": [
            {
                "at": at,
                "portfolio_id": pid,
                "source": source,
                "symbol": row["symbol"],
                "thesis": row["thesis"],
                "catalyst": row["catalyst"],
                "risk": row["risk"],
                "confidence": row["confidence"],
                "price": row["price"],
            }
            for row in slim
        ],
    }
    secret = ideas_webhook_secret()
    if secret:
        payload["secret"] = secret
    return payload


def _post_json(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "us-stock-sentinel-webhook",
    }
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=_TIMEOUT_SECONDS) as resp:
            status = int(getattr(resp, "status", 200) or 200)
            raw = resp.read(800) if hasattr(resp, "read") else b""
            return _result_from_status(status, raw)
    except urllib.error.HTTPError as exc:
        code = int(exc.code)
        raw = b""
        try:
            raw = exc.read(800) if exc.fp else b""
        except Exception:
            raw = b""
        return _result_from_status(code, raw, str(exc.reason or exc))
    except Exception as exc:
        return {"ok": False, "status": 0, "error": str(exc)}


def post_ideas_webhook(
    *,
    portfolio_id: Optional[str],
    source: str,
    ideas: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """POST ideas to IDEAS_WEBHOOK_URL. Never raises. Skip if unset or no tickers."""
    url = ideas_webhook_url()
    if not url:
        return {"skipped": True, "ok": True, "status": None, "error": ""}
    if not ideas:
        return {"skipped": True, "ok": True, "status": None, "error": "no ideas"}
    payload = build_ideas_payload(portfolio_id=portfolio_id, source=source, ideas=ideas)
    result = _post_json(url, payload)
    if not result["ok"] and int(result.get("status") or 0) in {0, 500, 502, 503, 504}:
        result = _post_json(url, payload)
    result["skipped"] = False
    return result
