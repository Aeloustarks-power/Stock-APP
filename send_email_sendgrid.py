#!/usr/bin/env python3
"""Send email via SendGrid v3 Mail Send (stdin = body): multipart plain + HTML."""
from __future__ import annotations

import html
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

SNAPSHOT_MARKER = "\n--- Portfolio snapshot ---\n"


def _subject_date_iso() -> str:
    """Date in subject line; default Australia/Melbourne (override with EMAIL_SUBJECT_TZ, e.g. America/New_York)."""
    tz_name = (os.getenv("EMAIL_SUBJECT_TZ") or "Australia/Melbourne").strip()
    try:
        from zoneinfo import ZoneInfo

        tz = ZoneInfo(tz_name)
    except Exception:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return datetime.now(tz).strftime("%Y-%m-%d")


def _parse_recipients(raw: str) -> list[dict[str, str]]:
    """Split EMAIL_TO on commas/semicolons; trim; drop empties."""
    parts = raw.replace(";", ",").split(",")
    out: list[dict[str, str]] = []
    for p in parts:
        e = p.strip()
        if e:
            out.append({"email": e})
    return out


def _cell_style(**extra: str) -> str:
    base = "padding:8px 10px;border:1px solid #d8dce0;vertical-align:top"
    if extra:
        base += ";" + ";".join(f"{k}:{v}" for k, v in extra.items())
    return base


def _summary_to_html(summary_text: str) -> str:
    """Numbered summary lines as simple paragraphs; easy to scan."""
    lines = summary_text.rstrip().split("\n")
    blocks: list[str] = [
        '<div style="font-family:system-ui,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:640px">',
        '<p style="margin:0 0 12px;font-size:13px;color:#555">Daily portfolio summary</p>',
    ]
    num_re = re.compile(r"^(\d+\))\s*(.*)$")
    for ln in lines:
        if not ln.strip():
            continue
        m = num_re.match(ln.strip())
        if m:
            label, rest = m.group(1), m.group(2)
            blocks.append(
                f'<p style="margin:10px 0 6px"><span style="font-weight:700;color:#1a1a2e">{html.escape(label)}</span> '
                f'<span>{html.escape(rest)}</span></p>'
            )
        else:
            blocks.append(f'<p style="margin:6px 0">{html.escape(ln)}</p>')
    blocks.append("</div>")
    return "".join(blocks)


def _snapshot_to_html(snapshot_block: str) -> str:
    """
    Parse plain snapshot (after --- marker) into tables: overview rows, holdings, sectors, notes, warnings.
    """
    lines = [ln.rstrip() for ln in snapshot_block.strip().split("\n")]
    if lines and lines[0].strip() == "--- Portfolio snapshot ---":
        lines = lines[1:]

    tb: list[str] = [
        '<table role="presentation" style="border-collapse:collapse;width:100%;max-width:640px;'
        'margin-top:20px;font-family:system-ui,Segoe UI,sans-serif;font-size:14px;color:#222">',
        f'<tr><td colspan="2" style="{_cell_style(**{"background": "#1a1a2e", "color": "#fff", "font-weight": "600", "font-size": "15px"})}">'
        "Portfolio snapshot</td></tr>",
    ]

    def row_full(text: str, header_bg: str | None = None) -> None:
        st = _cell_style()
        if header_bg:
            st += f";background:{header_bg};font-weight:600"
        tb.append(f'<tr><td colspan="2" style="{st}">{html.escape(text)}</td></tr>')

    def row_two(left: str, right: str, left_bold: bool = False) -> None:
        lw = "font-weight:600;width:26%" if left_bold else "width:26%"
        tb.append(
            f'<tr><td style="{_cell_style(**{"width": "26%"})};{lw}">{html.escape(left)}</td>'
            f'<td style="{_cell_style()}">{html.escape(right)}</td></tr>'
        )

    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        if not line.strip():
            i += 1
            continue

        if line.startswith("Top holdings"):
            row_full(line.strip(), "#e8eef4")
            i += 1
            tb.append(
                f'<tr><th scope="col" style="{_cell_style(**{"background": "#f4f6f8", "text-align": "left"})}">Symbol</th>'
                f'<th scope="col" style="{_cell_style(**{"background": "#f4f6f8", "text-align": "left"})}">Position</th></tr>'
            )
            while i < n:
                ln = lines[i]
                if not ln.startswith("  "):
                    break
                t = ln.strip()
                if t.startswith("Sector mix:") or t.startswith("Policy notes:") or t.startswith("Data warnings:"):
                    break
                if ":" in t:
                    sym, rest = t.split(":", 1)
                    row_two(sym.strip(), rest.strip(), left_bold=True)
                else:
                    row_full(t)
                i += 1
            continue

        if line.strip().startswith("Sector mix"):
            row_full("Sector mix", "#e8eef4")
            i += 1
            tb.append(
                f'<tr><th scope="col" style="{_cell_style(**{"background": "#f4f6f8"})}">Sector</th>'
                f'<th scope="col" style="{_cell_style(**{"background": "#f4f6f8"})}">Allocation</th></tr>'
            )
            while i < n:
                ln = lines[i]
                if not ln.startswith("  "):
                    break
                t = ln.strip()
                if t.startswith("Policy notes:") or t.startswith("Data warnings:"):
                    break
                if ":" in t:
                    a, b = t.split(":", 1)
                    row_two(a.strip(), b.strip(), left_bold=True)
                i += 1
            continue

        if line.strip().startswith("Policy notes"):
            row_full("Policy notes", "#e8eef4")
            i += 1
            while i < n and lines[i].startswith("  -"):
                row_full(lines[i].strip())
                i += 1
            continue

        if line.strip().startswith("Data warnings"):
            row_full("Data warnings", "#fde8e8")
            i += 1
            while i < n and lines[i].startswith("  -"):
                row_full(lines[i].strip())
                i += 1
            continue

        row_full(line.strip())
        i += 1

    tb.append("</table>")
    return "".join(tb)


def _plain_to_html_body(plain: str) -> str:
    if SNAPSHOT_MARKER in plain:
        summary, snapshot = plain.split(SNAPSHOT_MARKER, 1)
        snap_html = _snapshot_to_html(snapshot)
    else:
        summary = plain
        snap_html = ""

    inner = _summary_to_html(summary) + snap_html
    return (
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>"
        f'<body style="margin:16px;background:#f7f8fa">{inner}'
        '<p style="margin-top:24px;font-size:12px;color:#888;font-family:system-ui,sans-serif">'
        "Automated message — not financial advice.</p></body></html>"
    )


def main() -> int:
    api_key = os.getenv("SENDGRID_API_KEY", "").strip()
    to_addrs = _parse_recipients(os.getenv("EMAIL_TO", ""))
    from_addr = os.getenv("EMAIL_FROM", "").strip()
    if not api_key or not to_addrs or not from_addr:
        sys.stderr.write("SendGrid: missing SENDGRID_API_KEY, EMAIL_TO, or EMAIL_FROM.\n")
        return 1

    body = sys.stdin.read()
    if not body.strip():
        sys.stderr.write("SendGrid: empty email body (stdin).\n")
        return 1

    date_s = _subject_date_iso()
    subject = f"Daily Portfolio Summary - {date_s}"
    html_body = _plain_to_html_body(body)

    payload = {
        "personalizations": [{"to": to_addrs}],
        "from": {"email": from_addr},
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": body},
            {"type": "text/html", "value": html_body},
        ],
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
