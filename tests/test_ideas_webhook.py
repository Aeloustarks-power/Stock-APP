"""Outbound ideas webhook: skip when unset, treat Apps Script 302 as success."""
from __future__ import annotations

import urllib.error
import urllib.request

from backend.webhooks import build_ideas_payload, post_ideas_webhook


def test_skip_when_url_unset(monkeypatch):
    monkeypatch.delenv("IDEAS_WEBHOOK_URL", raising=False)
    out = post_ideas_webhook(
        portfolio_id="Eric",
        source="ideas",
        ideas=[{"symbol": "AAPL", "thesis": "x", "catalyst": "y", "risk": "z"}],
    )
    assert out["skipped"] is True
    assert out["ok"] is True


def test_skip_when_no_ideas(monkeypatch):
    monkeypatch.setenv("IDEAS_WEBHOOK_URL", "https://example.invalid/hook")
    out = post_ideas_webhook(portfolio_id="Eric", source="ideas", ideas=[])
    assert out["skipped"] is True


def test_payload_has_event_and_rows():
    payload = build_ideas_payload(
        portfolio_id="Eric",
        source="ideas",
        ideas=[
            {
                "symbol": "nvda",
                "thesis": "AI demand",
                "catalyst": "earnings",
                "risk": "valuation",
                "confidence": 0.7,
                "metrics": {"price": 120},
            }
        ],
    )
    assert payload["event"] == "ideas.generated"
    assert payload["portfolio_id"] == "Eric"
    assert payload["source"] == "ideas"
    assert payload["rows"][0]["symbol"] == "NVDA"
    assert payload["rows"][0]["catalyst"] == "earnings"
    assert "secret" not in payload


def test_secret_goes_in_body_not_rows(monkeypatch):
    monkeypatch.setenv("IDEAS_WEBHOOK_SECRET", "sheet-hook-1")
    payload = build_ideas_payload(
        portfolio_id="Eric",
        source="ideas",
        ideas=[{"symbol": "MSFT", "thesis": "a", "catalyst": "b", "risk": "c"}],
    )
    assert payload["secret"] == "sheet-hook-1"
    assert "secret" not in payload["rows"][0]


def test_apps_script_302_counts_as_ok(monkeypatch):
    monkeypatch.setenv("IDEAS_WEBHOOK_URL", "https://script.google.com/macros/s/fake/exec")

    def fake_open(_req, timeout=8):  # noqa: ARG001
        raise urllib.error.HTTPError(
            "https://script.google.com/macros/s/fake/exec",
            302,
            "Found",
            hdrs=None,
            fp=None,
        )

    monkeypatch.setattr(urllib.request, "build_opener", lambda *_a, **_k: type("O", (), {"open": staticmethod(fake_open)})())
    out = post_ideas_webhook(
        portfolio_id="Eric",
        source="ideas",
        ideas=[{"symbol": "AAPL", "thesis": "t", "catalyst": "c", "risk": "r"}],
    )
    assert out["skipped"] is False
    assert out["ok"] is True
    assert out["status"] == 302
