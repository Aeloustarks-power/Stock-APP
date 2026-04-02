#!/usr/bin/env python3
"""Send plain-text email via SendGrid v3 Mail Send (stdin = body)."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone


def _ny_today_iso() -> str:
    try:
        from zoneinfo import ZoneInfo

        tz = ZoneInfo("America/New_York")
    except Exception:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return datetime.now(tz).strftime("%Y-%m-%d")


def main() -> int:
    api_key = os.getenv("SENDGRID_API_KEY", "").strip()
    to_addr = os.getenv("EMAIL_TO", "").strip()
    from_addr = os.getenv("EMAIL_FROM", "").strip()
    if not api_key or not to_addr or not from_addr:
        sys.stderr.write("SendGrid: missing SENDGRID_API_KEY, EMAIL_TO, or EMAIL_FROM.\n")
        return 1

    body = sys.stdin.read()
    if not body.strip():
        sys.stderr.write("SendGrid: empty email body (stdin).\n")
        return 1

    date_s = _ny_today_iso()
    subject = f"Daily Portfolio Summary - {date_s}"

    payload = {
        "personalizations": [{"to": [{"email": to_addr}]}],
        "from": {"email": from_addr},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status not in (200, 202):
                sys.stderr.write(f"SendGrid: unexpected HTTP {resp.status}.\n")
                return 1
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        sys.stderr.write(f"SendGrid: HTTP {e.code} {e.reason}. {err_body}\n")
        return 1
    except urllib.error.URLError as e:
        sys.stderr.write(f"SendGrid: request failed ({e.reason}).\n")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
