#!/usr/bin/env python3
"""CLI: run the same portfolio analysis as POST /api/analyze-portfolio; print summary to stdout."""
from __future__ import annotations

import sys

# Import side effect: loads .env from Stock/ when present (same as API).
import main as stock_main


def main() -> int:
    try:
        result = stock_main.run_portfolio_analysis()
    except RuntimeError as e:
        sys.stderr.write(f"{e}\n")
        return 1
    except ValueError as e:
        sys.stderr.write(f"{e}\n")
        return 1

    ai_err = (result.get("ai_error") or "").strip()
    text = (result.get("ai_summary") or "").strip()
    if text:
        banner = "Summary source: AI-generated (Gemini)."
    else:
        if ai_err:
            sys.stderr.write(
                f"Gemini summary unavailable; falling back to rules-only summary. Error: {ai_err}\n"
            )
            err_one = ai_err.replace("\n", " ").strip()
            if len(err_one) > 180:
                err_one = err_one[:177] + "..."
            banner = f"Summary source: rules-only (Gemini error: {err_one})"
        else:
            banner = "Summary source: rules-only (Gemini unavailable or empty response)."
        text = stock_main.rules_full_summary_from_policy(result.get("policy_report") or {})

    text = banner + "\n\n" + text

    appendix = stock_main.rich_policy_appendix(result.get("policy_report") or {})
    if appendix.strip():
        text = text.rstrip() + "\n\n" + appendix.rstrip()

    sys.stdout.write(text)
    if not text.endswith("\n"):
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
