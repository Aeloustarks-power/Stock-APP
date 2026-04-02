#!/usr/bin/env python3
"""Send multipart email via Gmail SMTP (app password). stdin = daily_summary body."""
from __future__ import annotations

import os
import smtplib
import sys
from email.message import EmailMessage

from email_multipart import build_plain_and_html, parse_to_addresses, subject_date_iso


def main() -> int:
    gmail_user = (os.getenv("GMAIL_ADDRESS") or os.getenv("GMAIL_USER") or "").strip()
    app_pw = os.getenv("GMAIL_APP_PASSWORD", "").strip().replace(" ", "")
    to_list = parse_to_addresses(os.getenv("EMAIL_TO", ""))

    if not gmail_user or not app_pw or not to_list:
        sys.stderr.write(
            "Gmail: missing GMAIL_ADDRESS (or GMAIL_USER), GMAIL_APP_PASSWORD, or EMAIL_TO.\n"
        )
        return 1

    body = sys.stdin.read()
    if not body.strip():
        sys.stderr.write("Gmail: empty email body (stdin).\n")
        return 1

    date_s = subject_date_iso()
    subj = f"Daily Portfolio Summary - {date_s}"
    plain, html_doc = build_plain_and_html(body)

    msg = EmailMessage()
    msg["Subject"] = subj
    msg["From"] = gmail_user
    msg["To"] = ", ".join(to_list)
    msg.set_content(plain, subtype="plain", charset="utf-8")
    msg.add_alternative(html_doc, subtype="html", charset="utf-8")

    host = (os.getenv("GMAIL_SMTP_HOST") or "smtp.gmail.com").strip()
    port = int((os.getenv("GMAIL_SMTP_PORT") or "587").strip())

    try:
        with smtplib.SMTP(host, port, timeout=90) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(gmail_user, app_pw)
            smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        sys.stderr.write(
            "Gmail: authentication failed. Use an App Password (not your normal password) "
            "with 2-Step Verification enabled.\n"
        )
        return 1
    except smtplib.SMTPException as e:
        sys.stderr.write(f"Gmail: SMTP error ({e}).\n")
        return 1
    except OSError as e:
        sys.stderr.write(f"Gmail: connection failed ({e}).\n")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
