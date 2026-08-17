"""Gemini client, prompts, and AI summaries / suggested-buy ranking."""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    from google import genai  # type: ignore
except Exception:  # pragma: no cover
    genai = None  # type: ignore


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper().replace(".", "-")


_CASH_SYMBOLS = ("CASH", "USD", "USD-CASH", "USDCASH")


def _is_cash_symbol(symbol: str) -> bool:
    return _normalize_symbol(symbol) in _CASH_SYMBOLS


def create_gemini_client() -> Optional[Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    if genai is None:  # pragma: no cover
        raise RuntimeError("google-genai is not installed")
    return genai.Client(api_key=api_key)


def gemini_model_name() -> str:
    return (
        # Free-tier friendly default. gemini-3.1-pro* is paid-only (quota limit 0 on free).
        os.getenv("GEMINI_MODEL", "gemini-2.5-flash") or "gemini-2.5-flash"
    ).split("/")[-1]


def ai_output_lang() -> str:
    """Kept for compatibility. AI output is bilingual (en + zh)."""
    return "bilingual"


def build_ai_prompt(policy_report: Dict[str, Any]) -> str:
    pol = policy_report.get("policy") or {}
    actions = pol.get("recommended_actions", [])
    qqq = policy_report.get("qqq", {})
    spy = policy_report.get("spy", {})
    combined = int(policy_report.get("combined_dip_level", 0))
    totals = pol.get("totals", {})
    constraints = pol.get("constraints", {})
    positions = list(policy_report.get("positions") or [])
    sectors = list(policy_report.get("sector_breakdown") or [])
    warnings = list(policy_report.get("warnings") or [])

    pos_sorted = sorted(positions, key=lambda p: -_safe_float(p.get("weight_pct"), 0.0))[:8]
    pos_lines: List[str] = []
    held: List[str] = []
    for p in pos_sorted:
        sym = str(p.get("symbol", "?") or "?")
        held.append(sym)
        w = _safe_float(p.get("weight_pct"), 0.0)
        val = _safe_float(p.get("position_value"), 0.0)
        pnl = _safe_float(p.get("pnl"), 0.0)
        rsi = _safe_float(p.get("rsi"), 0.0)
        pos_lines.append(
            f"- {sym}: {w:.1f}%  ${val:,.0f}  P/L ${pnl:+,.0f}  RSI {rsi:.0f}  "
            f"sector {p.get('sector') or 'Unknown'}"
        )

    sec_lines = [
        f"- {s.get('sector', '?')}: {s.get('weight_pct', 0):.1f}%"
        for s in sectors[:6]
    ]
    action_lines = [
        f"- {a.get('symbol')}: {a.get('type')} ${a.get('trade_usd', 0):,.0f} — {a.get('reason', '')}"
        for a in (actions or [])[:5]
    ]

    return f"""You are a US equities portfolio research assistant for THIS book only.
Job: a short decision note. Do NOT recap totals, cash %, or rule actions — the dashboard already shows those.
Do NOT suggest new tickers or a watchlist (another tab does that).
Use Google Search for a real, recent catalyst that affects names already held (earnings, product, regulation, sector news). Do NOT invent prices or metrics.
Every narrative field is bilingual: English AND Simplified Chinese (separate keys).

Held names (only these tickers may appear): {', '.join(held) or '(none)'}

Book snapshot (context, do not repeat as a numbered list):
- Value ${totals.get('total_value', 0):,.0f}, cash ${totals.get('cash_usd', 0):,.0f} ({totals.get('cash_pct', 0):.1f}%), floor {constraints.get('cash_floor_pct', 0.15)*100:.0f}%
- Dip L{combined} (QQQ L{qqq.get('dip_level', 0)}, SPY L{spy.get('dip_level', 0)})
Holdings:
{chr(10).join(pos_lines) if pos_lines else '- (none)'}
Sectors:
{chr(10).join(sec_lines) if sec_lines else '- Unknown'}
Rule actions already computed (mention only if they change crowding/risk; do not list them as the answer):
{chr(10).join(action_lines) if action_lines else '- (none)'}
Data warnings:
{chr(10).join(f'- {w}' for w in warnings) if warnings else '- (none)'}

Return ONLY valid JSON (no markdown fences):
{{
  "crowding": "English: which 1–2 holdings dominate, and why that matters now (weights from the list)",
  "crowding_zh": "中文：集中度",
  "catalyst": "English: one near-term searchable catalyst for a held name or the book’s main sector",
  "catalyst_zh": "中文：催化剂",
  "risk": "English: what would prove this book’s stance wrong in the next weeks (falsifier)",
  "risk_zh": "中文：证伪/风险"
}}
2–4 sentences per English field. No tickers outside the held list. Not financial advice.
"""


def parse_ai_note_json(text: str) -> Dict[str, str]:
    raw = (text or "").strip()
    if not raw:
        return {}
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.I)
    if fence:
        raw = fence.group(1).strip()
    data: Any = None
    try:
        data = json.loads(raw)
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            return {}
        try:
            data = json.loads(raw[start : end + 1])
        except Exception:
            return {}
    if not isinstance(data, dict):
        return {}
    note = {
        "crowding": str(data.get("crowding") or "").strip(),
        "crowding_zh": str(data.get("crowding_zh") or "").strip(),
        "catalyst": str(data.get("catalyst") or "").strip(),
        "catalyst_zh": str(data.get("catalyst_zh") or "").strip(),
        "risk": str(data.get("risk") or "").strip(),
        "risk_zh": str(data.get("risk_zh") or "").strip(),
    }
    if not (note["crowding"] or note["catalyst"] or note["risk"]):
        return {}
    return note


def format_ai_note(note: Dict[str, Any]) -> str:
    """Plain markdown fallback for older UI / last-saved text."""
    if not note:
        return ""
    blocks = []
    if note.get("crowding"):
        blocks.append(f"**Crowding:** {note['crowding']}")
        if note.get("crowding_zh"):
            blocks.append(str(note["crowding_zh"]))
    if note.get("catalyst"):
        blocks.append(f"**Catalyst:** {note['catalyst']}")
        if note.get("catalyst_zh"):
            blocks.append(str(note["catalyst_zh"]))
    if note.get("risk"):
        blocks.append(f"**Risk:** {note['risk']}")
        if note.get("risk_zh"):
            blocks.append(str(note["risk_zh"]))
    return "\n\n".join(blocks)


def screen_buy_candidates(
    policy_report: Dict[str, Any],
    *,
    limit: int = 15,
    extra_exclude: Optional[Iterable[str]] = None,
) -> List[Dict[str, Any]]:
    """Mechanical Nasdaq-100 shortlist for AI to rank (not invent tickers)."""
    from backend.service import _rank_new_candidates

    positions = list(policy_report.get("positions") or [])
    held = {_normalize_symbol(str(p.get("symbol", ""))) for p in positions if p.get("symbol")}
    extra = {_normalize_symbol(str(s)) for s in (extra_exclude or []) if s}
    return _rank_new_candidates(held | extra, limit=limit)


def build_suggested_buys_prompt(
    policy_report: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    *,
    extra_exclude: Optional[Iterable[str]] = None,
) -> str:
    pol = policy_report.get("policy") or {}
    totals = pol.get("totals") or {}
    constraints = pol.get("constraints") or {}
    positions = list(policy_report.get("positions") or [])
    sectors = list(policy_report.get("sector_breakdown") or [])
    held = sorted({_normalize_symbol(str(p.get("symbol", ""))) for p in positions if p.get("symbol")})
    skip = sorted(
        {
            _normalize_symbol(str(s))
            for s in (extra_exclude or [])
            if s and _normalize_symbol(str(s)) not in set(held)
        }
    )
    pos_lines = [
        f"- {p.get('symbol')}: weight {_safe_float(p.get('weight_pct')):.1f}%, "
        f"sector {p.get('sector', 'Unknown')}, RSI {_safe_float(p.get('rsi')):.0f}"
        for p in sorted(positions, key=lambda x: -_safe_float(x.get("weight_pct")))[:12]
    ]
    sec_lines = [
        f"- {s.get('sector')}: {_safe_float(s.get('weight_pct')):.1f}%"
        for s in sectors[:8]
    ]
    cand_lines = []
    for c in candidates:
        cand_lines.append(
            f"- {c.get('symbol')}: screen_score={c.get('score')}, "
            f"dd_from_high={c.get('drawdown_from_52w_high_pct')}%, "
            f"ret_1y={c.get('return_1y_pct')}%, "
            f"avg_$vol_30d={c.get('avg_dollar_vol_30d')}"
        )
    return f"""You are a US equities portfolio research assistant.
Task: RANK 2-3 tickers ONLY from the screened candidate list below. Do NOT invent tickers outside that list.
Near-duplicates of holdings are forbidden (e.g. no GOOG if GOOGL is held).
Prefer names that fill a sector/theme gap vs this portfolio. If Skip is non-empty, do not repeat those tickers — explore the rest of the candidate list.
Use Google Search for recent catalysts (earnings, product, regulation, sector rotation). Do NOT invent prices.
Every narrative field must be bilingual: provide English AND Simplified Chinese (separate keys).

Already held: {', '.join(held) or '(none)'}
Skip (already shown this session — pick DIFFERENT tickers): {', '.join(skip) or '(none)'}

Portfolio context:
- Total value ${_safe_float(totals.get('total_value')):,.0f}, cash ${_safe_float(totals.get('cash_usd')):,.0f} ({_safe_float(totals.get('cash_pct')):.1f}%)
- Excess cash ${_safe_float(totals.get('excess_cash_usd')):,.0f}, deploy budget ${_safe_float(totals.get('deploy_budget_usd')):,.0f}
- Dip level L{int(policy_report.get('combined_dip_level', 0))}, holdings {pol.get('holdings_count')}/{constraints.get('max_holdings', 18)}
- Cash floor {_safe_float(constraints.get('cash_floor_pct'), 0.15)*100:.0f}%

Top holdings:
{chr(10).join(pos_lines) if pos_lines else '- (none)'}

Sector mix:
{chr(10).join(sec_lines) if sec_lines else '- Unknown'}

Screened candidates (CHOOSE ONLY FROM THESE):
{chr(10).join(cand_lines) if cand_lines else '- (none — return empty suggestions)'}

Return ONLY valid JSON (no markdown fences) with this shape:
{{
  "suggestions": [
    {{
      "symbol": "TICKER",
      "thesis": "English one sentence",
      "thesis_zh": "中文一句话",
      "fit": "English why it fits THIS portfolio",
      "fit_zh": "中文：为何适合当前组合",
      "catalyst": "English recent searchable catalyst",
      "catalyst_zh": "中文近期催化剂",
      "risk": "English key risk",
      "risk_zh": "中文主要风险",
      "confidence": 0.0
    }}
  ]
}}
confidence is 0-1. Prefer names that fill a sector/theme gap vs this portfolio, with a real recent catalyst.
If the candidate list is empty, return {{"suggestions": []}}.
"""


def parse_suggested_buys_json(text: str) -> List[Dict[str, Any]]:
    raw = (text or "").strip()
    if not raw:
        return []
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.I)
    if fence:
        raw = fence.group(1).strip()
    try:
        data = json.loads(raw)
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            return []
        try:
            data = json.loads(raw[start : end + 1])
        except Exception:
            return []
    items = data.get("suggestions") if isinstance(data, dict) else data
    if not isinstance(items, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        sym = _normalize_symbol(str(item.get("symbol", "")))
        if not sym or _is_cash_symbol(sym):
            continue
        out.append(
            {
                "symbol": sym,
                "thesis": str(item.get("thesis") or "").strip(),
                "thesis_zh": str(item.get("thesis_zh") or "").strip(),
                "fit": str(item.get("fit") or "").strip(),
                "fit_zh": str(item.get("fit_zh") or "").strip(),
                "catalyst": str(item.get("catalyst") or "").strip(),
                "catalyst_zh": str(item.get("catalyst_zh") or "").strip(),
                "risk": str(item.get("risk") or "").strip(),
                "risk_zh": str(item.get("risk_zh") or "").strip(),
                "confidence": round(min(1.0, max(0.0, _safe_float(item.get("confidence"), 0.5))), 3),
                "source": "gemini_grounded_screen_rank",
            }
        )
    return out[:3]


def enrich_suggested_buys(
    suggestions: List[Dict[str, Any]], *, held: set
) -> List[Dict[str, Any]]:
    from backend.market import _calc_position_metrics_cached

    enriched: List[Dict[str, Any]] = []
    for s in suggestions:
        sym = s["symbol"]
        if sym in held:
            continue
        row = dict(s)
        try:
            metrics = _calc_position_metrics_cached(sym, 1.0, 0.0)
            row["metrics"] = {
                "price": metrics.get("current_price"),
                "ma20": metrics.get("ma20"),
                "rsi": metrics.get("rsi"),
                "high_52w_percentile": metrics.get("high_52w_percentile"),
                "near_52w_high_pct": metrics.get("near_52w_high_pct"),
            }
        except Exception as e:
            row["metrics"] = None
            row["metrics_error"] = str(e)
        enriched.append(row)
    return enriched


def generate_ai_summary(gemini: Any, policy_report: Dict[str, Any]) -> Tuple[Dict[str, str], str]:
    """Return (note dict with crowding/catalyst/risk, error string)."""
    if not gemini or genai is None:
        return {}, "Gemini is not configured (set GEMINI_API_KEY)."
    prompt = build_ai_prompt(policy_report)
    model = gemini_model_name()

    def _parse(resp_text: str) -> Dict[str, str]:
        return parse_ai_note_json(resp_text or "")

    try:
        from google.genai import types  # type: ignore

        config = types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.4,
        )
        resp = gemini.models.generate_content(model=model, contents=prompt, config=config)
        note = _parse(resp.text or "")
        if note:
            return note, ""
    except Exception as e:
        try:
            resp = gemini.models.generate_content(model=model, contents=prompt)
            note = _parse(resp.text or "")
            if note:
                return note, f"grounding_fallback: {e}"
            return {}, str(e)
        except Exception as e2:
            return {}, str(e2)
    try:
        resp = gemini.models.generate_content(model=model, contents=prompt)
        note = _parse(resp.text or "")
        if note:
            return note, ""
        return {}, "AI note was empty or unreadable."
    except Exception as e:
        return {}, str(e)


def generate_suggested_buys(
    gemini: Any,
    policy_report: Dict[str, Any],
    *,
    extra_exclude: Optional[Iterable[str]] = None,
) -> Tuple[List[Dict[str, Any]], str]:
    if not gemini or genai is None:
        return [], "Gemini is not configured (set GEMINI_API_KEY)."
    held = {
        _normalize_symbol(str(p.get("symbol", "")))
        for p in (policy_report.get("positions") or [])
        if p.get("symbol")
    }
    extra = {_normalize_symbol(str(s)) for s in (extra_exclude or []) if s}
    candidates = screen_buy_candidates(
        policy_report, limit=25 if extra else 15, extra_exclude=extra
    )
    allowed = {_normalize_symbol(str(c.get("symbol", ""))) for c in candidates if c.get("symbol")}
    temperature = 0.55 if extra else 0.4
    try:
        from google.genai import types  # type: ignore

        prompt = build_suggested_buys_prompt(
            policy_report, candidates, extra_exclude=extra
        )
        model = gemini_model_name()
        config = types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=temperature,
        )
        resp = gemini.models.generate_content(
            model=model, contents=prompt, config=config
        )
        parsed = parse_suggested_buys_json(resp.text or "")
        if allowed:
            parsed = [s for s in parsed if s.get("symbol") in allowed]
        parsed = [s for s in parsed if s.get("symbol") not in extra]
        return enrich_suggested_buys(parsed, held=held), ""
    except Exception as e:
        try:
            prompt = build_suggested_buys_prompt(
                policy_report, candidates, extra_exclude=extra
            )
            model = gemini_model_name()
            resp = gemini.models.generate_content(model=model, contents=prompt)
            parsed = parse_suggested_buys_json(resp.text or "")
            if allowed:
                parsed = [s for s in parsed if s.get("symbol") in allowed]
            parsed = [s for s in parsed if s.get("symbol") not in extra]
            return enrich_suggested_buys(parsed, held=held), f"grounding_fallback: {e}"
        except Exception as e2:
            return [], str(e2)


# Names service.py used to export
_build_ai_prompt = build_ai_prompt
_build_suggested_buys_prompt = build_suggested_buys_prompt
_generate_ai_summary = generate_ai_summary
_generate_suggested_buys = generate_suggested_buys
_gemini_model_name = gemini_model_name
_create_gemini_client = create_gemini_client

__all__ = [
    "create_gemini_client",
    "gemini_model_name",
    "ai_output_lang",
    "build_ai_prompt",
    "build_suggested_buys_prompt",
    "parse_ai_note_json",
    "format_ai_note",
    "generate_ai_summary",
    "generate_suggested_buys",
    "_build_ai_prompt",
    "_build_suggested_buys_prompt",
    "_generate_ai_summary",
    "_generate_suggested_buys",
    "_gemini_model_name",
    "_create_gemini_client",
]
