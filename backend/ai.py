"""Gemini client, prompts, and AI summaries / suggested-buy ranking."""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

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
    why_no_other = policy_report.get("why_no_other_actions", [])
    uncertainty_notes = policy_report.get("uncertainty_notes", [])
    totals = pol.get("totals", {})
    constraints = pol.get("constraints", {})
    positions = list(policy_report.get("positions") or [])
    sectors = list(policy_report.get("sector_breakdown") or [])
    notes = list(pol.get("notes") or [])
    warnings = list(policy_report.get("warnings") or [])
    holdings_count = int(pol.get("holdings_count", len({p.get("symbol") for p in positions}) or 0))
    max_new_buys = int(pol.get("max_new_buys", 0))

    def fmt_action(a: Dict[str, Any]) -> str:
        sym = a.get("symbol", "?")
        typ = a.get("type", "?")
        usd = a.get("trade_usd", 0)
        sh = a.get("approx_shares", 0)
        r = a.get("reason", "")
        rule = a.get("rule_trigger", "n/a")
        return f"- {sym}: {typ}, ${usd} (~{sh} sh). {r} (Rule: {rule})"

    lines = [fmt_action(a) for a in actions[:10]]

    pos_sorted = sorted(positions, key=lambda p: -_safe_float(p.get("weight_pct"), 0.0))[:8]
    pos_lines: List[str] = []
    for p in pos_sorted:
        sym = p.get("symbol", "?")
        w = _safe_float(p.get("weight_pct"), 0.0)
        val = _safe_float(p.get("position_value"), 0.0)
        pnl = _safe_float(p.get("pnl"), 0.0)
        rsi = _safe_float(p.get("rsi"), 0.0)
        px = _safe_float(p.get("current_price"), 0.0)
        ma = _safe_float(p.get("ma20"), 0.0)
        vs = "above MA20" if px >= ma else "below MA20"
        pos_lines.append(
            f"- {sym}: weight {w:.2f}%, value ${val:,.0f}, P/L ${pnl:+,.0f}, RSI {rsi:.0f}, {vs}"
        )

    sec_lines = [
        f"- {s.get('sector', '?')}: {s.get('weight_pct', 0):.1f}% (${s.get('value', 0):,.0f})"
        for s in sectors[:6]
    ]

    q_close = qqq.get("close")
    s_close = spy.get("close")
    bench = ""
    if q_close is not None and s_close is not None:
        bench = f"- QQQ last ${q_close}, SPY last ${s_close}"

    return f"""You are a portfolio assistant. Use the numbers and tickers below for portfolio-specific commentary; do NOT fabricate metrics.
Write EVERY commentary line in bilingual form: English first, then Simplified Chinese on the same numbered item.
Format each line like: `1) Status: OK / Attention / Action — 状态：正常 / 关注 / 行动`
Keep ticker symbols (AAPL, QQQ, etc.) in English. Do NOT invent prices or metrics.
Only in the final watchlist line may you mention 1–2 additional well-known U.S. tickers (not already listed) if you justify them with a brief macro catalyst.

Policy:
- Cash floor: {constraints.get('cash_floor_pct', 0.15)*100:.0f}% (do not recommend buys that drop below it)
- Max holdings: {constraints.get('max_holdings', 18)}
- Min trade: ${constraints.get('min_trade_usd', 200):.0f}

Today:
- Portfolio value: ${totals.get('total_value', 0):.2f} (invested ${totals.get('total_invested', 0):.2f})
- Cash: ${totals.get('cash_usd', 0):.2f} ({totals.get('cash_pct', 0):.2f}%)
- Cash needed to reach floor: ${totals.get('cash_needed_usd', 0):.2f}
- Excess cash above floor: ${totals.get('excess_cash_usd', 0):.2f}
- Deploy budget (rules): ${totals.get('deploy_budget_usd', 0):.2f}
- Holdings: {holdings_count} / max {constraints.get('max_holdings', 18)}, new-buy slots: {max_new_buys}
- Dip level (dual benchmark): L{combined} (max of QQQ/SPY)
- QQQ: L{qqq.get('dip_level', 0)} (6M {qqq.get('drawdown_6m_pct', 0):.2f}%, 12M {qqq.get('drawdown_12m_pct', 0):.2f}%)
- SPY: L{spy.get('dip_level', 0)} (6M {spy.get('drawdown_6m_pct', 0):.2f}%, 12M {spy.get('drawdown_12m_pct', 0):.2f}%)
{bench}

Recommended actions (already computed; you prioritize and explain):
{chr(10).join(lines) if lines else "- (none)"}

Top holdings (reference for narrative):
{chr(10).join(pos_lines) if pos_lines else "- (none)"}

Sector mix:
{chr(10).join(sec_lines) if sec_lines else "- Unknown / not grouped"}

Policy engine notes:
{chr(10).join(f"- {n}" for n in notes) if notes else "- (none)"}

Why no other actions:
{chr(10).join(f"- {x}" for x in why_no_other) if why_no_other else "- (n/a)"}

Uncertainty / confidence:
{chr(10).join(f"- {x}" for x in uncertainty_notes) if uncertainty_notes else "- Data looks complete; monitoring only."}

Data warnings:
{chr(10).join(f"- {w}" for w in warnings) if warnings else "- (none)"}

Output format (numbered lines, no markdown tables; each item MUST include English then 中文):
1) Status: ...
2) Market: ...
3) Cash: ...
4) Actions: line 1 — "SYMBOL — ACTION — $ — ~shares — (Rule: ...)" or (none)
5) Actions: line 2 — same format or (none)
6) Actions: line 3 — same format or (none)
7) Why: ...
8) Uncertainty: ...
9) Disclaimer: Not financial advice; rules are heuristic. — 非投资建议；规则仅为启发式。
10) Portfolio: ...
11) Holdings: 2–4 short lines on top names by weight (symbols from "Top holdings" only)
12) Sectors: 1–2 lines on mix (or note if sector data is mostly Unknown)
13) Risks / data: ...
14) Optional: one line on RSI/MA20 for a top holding if notable (numbers from the list only)
15) Watchlist: "Ticker — theme" for 1–2 potential buys outside the current portfolio (bilingual justification, no fabricated prices)
Keep total under ~30 short lines; stay factual.
"""


def screen_buy_candidates(
    policy_report: Dict[str, Any],
    *,
    limit: int = 15,
) -> List[Dict[str, Any]]:
    """Mechanical Nasdaq-100 shortlist for AI to rank (not invent tickers)."""
    from backend.service import _rank_new_candidates

    positions = list(policy_report.get("positions") or [])
    held = {_normalize_symbol(str(p.get("symbol", ""))) for p in positions if p.get("symbol")}
    return _rank_new_candidates(held, limit=limit)


def build_suggested_buys_prompt(
    policy_report: Dict[str, Any],
    candidates: List[Dict[str, Any]],
) -> str:
    pol = policy_report.get("policy") or {}
    totals = pol.get("totals") or {}
    constraints = pol.get("constraints") or {}
    positions = list(policy_report.get("positions") or [])
    sectors = list(policy_report.get("sector_breakdown") or [])
    held = sorted({_normalize_symbol(str(p.get("symbol", ""))) for p in positions if p.get("symbol")})
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
Use Google Search for recent catalysts (earnings, product, regulation, sector rotation). Do NOT invent prices.
Every narrative field must be bilingual: provide English AND Simplified Chinese (separate keys).

Already held: {', '.join(held) or '(none)'}

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
    from backend.service import _calc_position_metrics_cached

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


def generate_ai_summary(gemini: Any, policy_report: Dict[str, Any]) -> Tuple[str, str]:
    if not gemini or genai is None:
        return "", "Gemini is not configured (set GEMINI_API_KEY)."
    try:
        prompt = build_ai_prompt(policy_report)
        model = gemini_model_name()
        resp = gemini.models.generate_content(model=model, contents=prompt)
        return (resp.text or "").strip(), ""
    except Exception as e:
        return "", str(e)


def generate_suggested_buys(
    gemini: Any, policy_report: Dict[str, Any]
) -> Tuple[List[Dict[str, Any]], str]:
    if not gemini or genai is None:
        return [], "Gemini is not configured (set GEMINI_API_KEY)."
    held = {
        _normalize_symbol(str(p.get("symbol", "")))
        for p in (policy_report.get("positions") or [])
        if p.get("symbol")
    }
    candidates = screen_buy_candidates(policy_report, limit=15)
    allowed = {_normalize_symbol(str(c.get("symbol", ""))) for c in candidates if c.get("symbol")}
    try:
        from google.genai import types  # type: ignore

        prompt = build_suggested_buys_prompt(policy_report, candidates)
        model = gemini_model_name()
        config = types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.4,
        )
        resp = gemini.models.generate_content(
            model=model, contents=prompt, config=config
        )
        parsed = parse_suggested_buys_json(resp.text or "")
        if allowed:
            parsed = [s for s in parsed if s.get("symbol") in allowed]
        return enrich_suggested_buys(parsed, held=held), ""
    except Exception as e:
        try:
            prompt = build_suggested_buys_prompt(policy_report, candidates)
            model = gemini_model_name()
            resp = gemini.models.generate_content(model=model, contents=prompt)
            parsed = parse_suggested_buys_json(resp.text or "")
            if allowed:
                parsed = [s for s in parsed if s.get("symbol") in allowed]
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
    "generate_ai_summary",
    "generate_suggested_buys",
    "_build_ai_prompt",
    "_build_suggested_buys_prompt",
    "_generate_ai_summary",
    "_generate_suggested_buys",
    "_gemini_model_name",
    "_create_gemini_client",
]
