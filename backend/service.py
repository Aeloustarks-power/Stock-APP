from __future__ import annotations

import os
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from supabase import Client  # type: ignore[import-untyped]

try:
    import yfinance as yf  # type: ignore
except Exception:  # pragma: no cover
    yf = None  # type: ignore

try:
    from dotenv import load_dotenv  # type: ignore
except Exception:  # pragma: no cover
    load_dotenv = None  # type: ignore

try:
    from fastapi import Body, FastAPI, HTTPException, Query, Request, status  # type: ignore
    from fastapi.exceptions import RequestValidationError  # type: ignore
    from fastapi.middleware.cors import CORSMiddleware  # type: ignore
    from fastapi.responses import JSONResponse  # type: ignore
except Exception:  # pragma: no cover
    Body = None  # type: ignore
    FastAPI = None  # type: ignore
    HTTPException = None  # type: ignore
    Query = None  # type: ignore
    Request = None  # type: ignore
    status = None  # type: ignore
    RequestValidationError = None  # type: ignore
    CORSMiddleware = None  # type: ignore
    JSONResponse = None  # type: ignore

try:
    from google import genai  # type: ignore
except Exception:  # pragma: no cover
    genai = None  # type: ignore

try:
    from pydantic import BaseModel, Field, field_validator  # type: ignore
except Exception:  # pragma: no cover
    BaseModel = object  # type: ignore
    Field = None  # type: ignore
    field_validator = None  # type: ignore

try:
    from postgrest.exceptions import APIError as PostgrestAPIError  # type: ignore
except Exception:  # pragma: no cover
    PostgrestAPIError = None  # type: ignore

try:
    from supabase import create_client  # type: ignore
except Exception:  # pragma: no cover
    create_client = None  # type: ignore


def _project_root() -> str:
    """US Stock/ project root (parent of backend/)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_env() -> None:
    if load_dotenv is None:  # pragma: no cover
        return
    root = _project_root()
    module_dir = os.path.dirname(__file__)
    candidate_paths = [
        os.path.join(root, ".env"),
        os.path.join(module_dir, ".env"),
        os.path.join(os.getcwd(), ".env"),
    ]
    for p in candidate_paths:
        if os.path.exists(p):
            load_dotenv(p, override=False)


_load_env()


def hello(name: str) -> str:
    # Kept for the minimal-project scaffold + unit tests.
    return f"Hello, {name}!"


@dataclass(frozen=True)
class PolicyConfig:
    cash_floor_pct: float = 0.15
    max_holdings: int = 18
    underweight_pct: float = 0.04
    overweight_pct: float = 0.07
    hard_cap_pct: float = 0.12
    trim_target_after_hard_cap_pct: float = 0.10
    trim_target_after_take_profit_pct: float = 0.06
    take_profit_52w_percentile: float = 0.90
    take_profit_near_high_pct: float = 0.05
    dip_l1_6m_drawdown_pct: float = 0.08
    dip_l2_12m_drawdown_pct: float = 0.15
    dip_l3_12m_drawdown_pct: float = 0.25
    deploy_pct_l1: float = 0.30
    deploy_pct_l2: float = 0.60
    deploy_pct_l3: float = 1.00
    min_trade_usd: float = 200.0
    allow_fractional_shares: bool = True


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def load_policy_config_from_env() -> PolicyConfig:
    def f(name: str, default: float) -> float:
        raw = os.getenv(name)
        return default if raw is None or raw.strip() == "" else float(raw)

    def i(name: str, default: int) -> int:
        raw = os.getenv(name)
        return default if raw is None or raw.strip() == "" else int(raw)

    base = PolicyConfig()
    return PolicyConfig(
        cash_floor_pct=f("POLICY_CASH_FLOOR_PCT", base.cash_floor_pct),
        max_holdings=i("POLICY_MAX_HOLDINGS", base.max_holdings),
        underweight_pct=f("POLICY_UNDERWEIGHT_PCT", base.underweight_pct),
        overweight_pct=f("POLICY_OVERWEIGHT_PCT", base.overweight_pct),
        hard_cap_pct=f("POLICY_HARD_CAP_PCT", base.hard_cap_pct),
        trim_target_after_hard_cap_pct=f(
            "POLICY_TRIM_TARGET_AFTER_HARD_CAP_PCT", base.trim_target_after_hard_cap_pct
        ),
        trim_target_after_take_profit_pct=f(
            "POLICY_TRIM_TARGET_AFTER_TAKE_PROFIT_PCT", base.trim_target_after_take_profit_pct
        ),
        take_profit_52w_percentile=f(
            "POLICY_TAKE_PROFIT_52W_PERCENTILE", base.take_profit_52w_percentile
        ),
        take_profit_near_high_pct=f(
            "POLICY_TAKE_PROFIT_NEAR_HIGH_PCT", base.take_profit_near_high_pct
        ),
        dip_l1_6m_drawdown_pct=f("POLICY_DIP_L1_6M_DD_PCT", base.dip_l1_6m_drawdown_pct),
        dip_l2_12m_drawdown_pct=f("POLICY_DIP_L2_12M_DD_PCT", base.dip_l2_12m_drawdown_pct),
        dip_l3_12m_drawdown_pct=f("POLICY_DIP_L3_12M_DD_PCT", base.dip_l3_12m_drawdown_pct),
        deploy_pct_l1=f("POLICY_DEPLOY_PCT_L1", base.deploy_pct_l1),
        deploy_pct_l2=f("POLICY_DEPLOY_PCT_L2", base.deploy_pct_l2),
        deploy_pct_l3=f("POLICY_DEPLOY_PCT_L3", base.deploy_pct_l3),
        min_trade_usd=f("POLICY_MIN_TRADE_USD", base.min_trade_usd),
        allow_fractional_shares=_bool_env(
            "ALLOW_FRACTIONAL_SHARES", base.allow_fractional_shares
        ),
    )


def _load_nasdaq100_from_data_file() -> Tuple[str, ...]:
    """Prefer data/nasdaq100.json so the universe is editable without code changes."""
    import json

    path = os.path.join(_project_root(), "data", "nasdaq100.json")
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw, list) and raw:
            items = [str(t).strip().upper() for t in raw if str(t).strip()]
            return tuple(dict.fromkeys(items))
    except Exception:
        pass
    return ()


# Fallback static list if data/nasdaq100.json is missing (can be overridden by env).
_NASDAQ100_TICKERS: Tuple[str, ...] = _load_nasdaq100_from_data_file() or (
    "AAPL",
    "ABNB",
    "ADBE",
    "ADI",
    "ADP",
    "ADSK",
    "AEP",
    "AMAT",
    "AMD",
    "AMGN",
    "AMZN",
    "ANSS",
    "APP",
    "ARM",
    "ASML",
    "AVGO",
    "AZN",
    "BIIB",
    "BKNG",
    "BKR",
    "CCEP",
    "CDNS",
    "CDW",
    "CEG",
    "CHTR",
    "CMCSA",
    "COST",
    "CPRT",
    "CRWD",
    "CSCO",
    "CSX",
    "CTAS",
    "CTSH",
    "DASH",
    "DDOG",
    "DXCM",
    "EA",
    "EXC",
    "FANG",
    "FAST",
    "FTNT",
    "GFS",
    "GILD",
    "GOOG",
    "GOOGL",
    "HON",
    "IDXX",
    "ILMN",
    "INTC",
    "INTU",
    "ISRG",
    "KDP",
    "KHC",
    "KLAC",
    "LRCX",
    "LULU",
    "MAR",
    "MCHP",
    "MDLZ",
    "MELI",
    "META",
    "MNST",
    "MRNA",
    "MRVL",
    "MSFT",
    "MU",
    "NFLX",
    "NVDA",
    "NXPI",
    "ODFL",
    "ON",
    "ORLY",
    "PANW",
    "PAYX",
    "PCAR",
    "PDD",
    "PEP",
    "PLTR",
    "PYPL",
    "QCOM",
    "REGN",
    "ROP",
    "ROST",
    "SBUX",
    "SNPS",
    "TEAM",
    "TMUS",
    "TSLA",
    "TTD",
    "TTWO",
    "TXN",
    "VRSK",
    "VRTX",
    "WBD",
    "WDAY",
    "XEL",
    "ZS",
)


def nasdaq100_universe() -> Tuple[str, ...]:
    raw = os.getenv("NASDAQ100_TICKERS")
    if raw and raw.strip():
        items = [t.strip().upper() for t in raw.split(",") if t.strip()]
        return tuple(dict.fromkeys(items))
    return _NASDAQ100_TICKERS


def _normalize_symbol(symbol: str) -> str:
    s = symbol.strip().upper()
    # Yahoo convention: BRK.B -> BRK-B
    s = s.replace(".", "-")
    return s


_CASH_SYMBOLS: Tuple[str, ...] = ("CASH", "USD", "USD-CASH", "USDCASH")


def _is_cash_symbol(symbol: str) -> bool:
    return _normalize_symbol(symbol) in _CASH_SYMBOLS


def _normalize_portfolio_id_value(v: Any) -> Optional[str]:
    """String portfolio ids (e.g. 'Eric'); supports numeric ids stored as int/str in DB."""
    if v is None or v == "":
        return None
    s = str(v).strip()
    return s if s else None


def _coerce_portfolio_id_field(v: Any) -> Optional[str]:
    """For JSON bodies: accept scalars; reject objects/arrays so Pydantic does not fail on wrong shapes."""
    if v is None:
        return None
    if isinstance(v, (list, tuple, set, dict)):
        return None
    return _normalize_portfolio_id_value(v)


# Module-level models so FastAPI + Pydantic v2 TypeAdapter(Body(...)) resolve fully;
# nested classes inside create_app() trigger ForwardRef / "class not fully defined" errors.
if BaseModel is not object and Field is not None and field_validator is not None:
    class PortfolioPayload(BaseModel):
        symbol: str
        shares: float = Field(gt=0)
        cost_basis: float = Field(ge=0)
        portfolio_id: Optional[str] = None

        @field_validator("portfolio_id", mode="before")
        @classmethod
        def _portfolio_id_from_json(cls, v: Any) -> Optional[str]:
            return _coerce_portfolio_id_field(v)

    class PortfolioHoldingItem(BaseModel):
        symbol: str
        shares: float = Field(gt=0)
        cost_basis: float = Field(ge=0)

    class PortfolioReplacePayload(BaseModel):
        """Full portfolio replace: holdings + cash in one save."""

        holdings: List[PortfolioHoldingItem] = Field(default_factory=list)
        cash_usd: float = Field(ge=0, default=0.0)
        portfolio_id: Optional[str] = None

        @field_validator("portfolio_id", mode="before")
        @classmethod
        def _portfolio_id_from_json(cls, v: Any) -> Optional[str]:
            return _coerce_portfolio_id_field(v)

    class PortfolioResponse(BaseModel):
        items: List[Dict[str, Any]]
        cash_usd: float = 0.0
else:  # pragma: no cover
    PortfolioPayload = None  # type: ignore[misc, assignment]
    PortfolioHoldingItem = None  # type: ignore[misc, assignment]
    PortfolioReplacePayload = None  # type: ignore[misc, assignment]
    PortfolioResponse = None  # type: ignore[misc, assignment]


def _format_pydantic_request_errors(errors: Any) -> str:
    """Turn FastAPI/Pydantic validation errors into a single human-readable string."""
    if not isinstance(errors, list):
        return str(errors)
    parts: List[str] = []
    for err in errors:
        if not isinstance(err, dict):
            continue
        loc = err.get("loc") or ()
        where = ".".join(str(x) for x in loc if x != "body")
        msg = str(err.get("msg", "") or "")
        if where:
            parts.append(f"{where}: {msg}".strip())
        elif msg:
            parts.append(msg)
    return "; ".join(parts) if parts else "Invalid request"


def _postgrest_error_message(exc: Any) -> str:
    """Readable message from Supabase PostgREST client errors (often surface as HTTP 400/409/422)."""
    parts: List[str] = []
    for attr in ("message", "details", "hint", "code"):
        val = getattr(exc, attr, None)
        if val:
            parts.append(str(val))
    if parts:
        return " — ".join(parts)
    return str(exc)


def _portfolio_id_from_env() -> Optional[str]:
    """When set, analysis and API default to this portfolio (multi-row portfolios)."""
    return _normalize_portfolio_id_value(os.getenv("PORTFOLIO_ID"))


def _row_matches_portfolio(row: Dict[str, Any], portfolio_id: Optional[str]) -> bool:
    if portfolio_id is None:
        return True
    rid = _normalize_portfolio_id_value(row.get("portfolio_id"))
    if rid is None:
        return False
    return rid == portfolio_id


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _round_shares(shares: float, allow_fractional: bool) -> float:
    if allow_fractional:
        return round(shares, 3)
    return float(int(shares))


def trade_value_to_shares(
    trade_usd: float, price: float, allow_fractional_shares: bool
) -> float:
    if trade_usd <= 0 or price <= 0:
        return 0.0
    return _round_shares(trade_usd / price, allow_fractional_shares)


def compute_dip_level(
    close: float,
    high_6m: float,
    high_12m: float,
    cfg: PolicyConfig,
) -> Tuple[int, Dict[str, float]]:
    dd_6m = 0.0 if high_6m <= 0 else max(0.0, (high_6m - close) / high_6m)
    dd_12m = 0.0 if high_12m <= 0 else max(0.0, (high_12m - close) / high_12m)

    level = 0
    if dd_12m >= cfg.dip_l3_12m_drawdown_pct:
        level = 3
    elif dd_12m >= cfg.dip_l2_12m_drawdown_pct:
        level = 2
    elif dd_6m >= cfg.dip_l1_6m_drawdown_pct:
        level = 1
    return level, {"drawdown_6m": dd_6m, "drawdown_12m": dd_12m}


def _deploy_pct_for_level(level: int, cfg: PolicyConfig) -> float:
    if level == 3:
        return cfg.deploy_pct_l3
    if level == 2:
        return cfg.deploy_pct_l2
    if level == 1:
        return cfg.deploy_pct_l1
    return 0.0


def calculate_rsi(close_series, window: int = 14):
    delta = close_series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=window).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=window).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))


def _stock_quote_payload(symbol: str) -> Dict[str, Any]:
    sym = _normalize_symbol(symbol)
    if yf is None:  # pragma: no cover
        raise RuntimeError("yfinance is not installed")

    hist = yf.Ticker(sym).history(period="60d", auto_adjust=True)
    if "Close" not in hist:
        raise ValueError("No price history available")

    close_series = hist["Close"].dropna()
    if close_series.shape[0] < 20:
        raise ValueError("Not enough historical data")

    current_price = float(close_series.iloc[-1])
    ma20_series = close_series.rolling(window=20).mean().dropna()
    if ma20_series.empty:
        raise ValueError("Unable to compute MA20")
    ma20 = float(ma20_series.iloc[-1])

    rsi_series = calculate_rsi(close_series).dropna()
    if rsi_series.empty:
        raise ValueError("Unable to compute RSI")
    rsi = float(rsi_series.iloc[-1])

    daily_change_pct = None
    daily_change = None
    if close_series.shape[0] >= 2:
        prev = float(close_series.iloc[-2])
        if prev != 0:
            daily_change = current_price - prev
            daily_change_pct = (daily_change / prev) * 100

    if rsi < 35:
        advice = "BUY - Market is Oversold (Fearful)"
    elif rsi > 65:
        advice = "SELL - Market is Overbought (Euphoric)"
    elif current_price > ma20:
        advice = "HOLD - Upward Trend"
    else:
        advice = "HOLD - Downward Trend"

    return {
        "symbol": sym,
        "price": round(current_price, 2),
        "ma20": round(ma20, 2),
        "rsi": round(rsi, 2),
        "advice": advice,
        "regularMarketChangePercent": None if daily_change_pct is None else round(daily_change_pct, 4),
        "regularMarketChange": None if daily_change is None else round(daily_change, 4),
    }


def _cache_get(cache: Dict[str, Any], key: str, ttl_seconds: int) -> Optional[Any]:
    now = time.time()
    item = cache.get(key)
    if not item:
        return None
    ts, value = item
    if now - ts > ttl_seconds:
        return None
    return value


def _cache_set(cache: Dict[str, Any], key: str, value: Any) -> None:
    cache[key] = (time.time(), value)


_HISTORY_CACHE: Dict[str, Any] = {}

# --- Market snapshot cache (file-backed) ----------------------------------------

_SNAPSHOT_TTL_SECONDS = int(os.getenv("SNAPSHOT_TTL_SECONDS", str(6 * 60 * 60)))


def _snapshot_file_path() -> str:
    return os.path.join(_project_root(), "data", "snapshots.json")


def _load_snapshot_store() -> Dict[str, Any]:
    import json

    path = _snapshot_file_path()
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {"updated_at": None, "symbols": {}}
    except Exception:
        return {"updated_at": None, "symbols": {}}


def _save_snapshot_store(store: Dict[str, Any]) -> None:
    import json

    path = _snapshot_file_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)
    os.replace(tmp, path)


def get_symbol_snapshot(
    symbol: str, *, max_age_seconds: Optional[int] = None
) -> Optional[Dict[str, Any]]:
    sym = _normalize_symbol(symbol)
    store = _load_snapshot_store()
    entry = (store.get("symbols") or {}).get(sym)
    if not isinstance(entry, dict):
        return None
    ts = _safe_float(entry.get("ts"), 0.0)
    ttl = _SNAPSHOT_TTL_SECONDS if max_age_seconds is None else max_age_seconds
    if ttl > 0 and (time.time() - ts) > ttl:
        return None
    metrics = entry.get("metrics")
    return metrics if isinstance(metrics, dict) else None


def snapshot_store_meta() -> Dict[str, Any]:
    store = _load_snapshot_store()
    symbols = store.get("symbols") or {}
    return {
        "updated_at": store.get("updated_at"),
        "symbol_count": len(symbols) if isinstance(symbols, dict) else 0,
        "ttl_seconds": _SNAPSHOT_TTL_SECONDS,
    }


def refresh_market_snapshots(
    symbols: Optional[Sequence[str]] = None,
    *,
    include_benchmarks: bool = True,
    include_universe: bool = False,
) -> Dict[str, Any]:
    """Fetch Yahoo metrics and persist to data/snapshots.json."""
    store = _load_snapshot_store()
    sym_map: Dict[str, Any] = dict(store.get("symbols") or {})
    targets: List[str] = []
    if symbols:
        targets.extend(_normalize_symbol(s) for s in symbols)
    if include_benchmarks:
        targets.extend(["QQQ", "SPY"])
    if include_universe:
        targets.extend(list(nasdaq100_universe()))
    targets = list(dict.fromkeys(t for t in targets if t and not _is_cash_symbol(t)))

    errors: List[str] = []
    updated = 0
    now = time.time()
    for sym in targets:
        try:
            metrics = _calc_position_metrics(sym, shares=1.0, cost_basis=0.0)
            snap = {
                "symbol": metrics["symbol"],
                "current_price": metrics["current_price"],
                "ma20": metrics["ma20"],
                "rsi": metrics["rsi"],
                "high_52w_percentile": metrics["high_52w_percentile"],
                "near_52w_high_pct": metrics["near_52w_high_pct"],
            }
            sym_map[sym] = {"ts": now, "metrics": snap}
            updated += 1
        except Exception as e:
            errors.append(f"{sym}: {e}")

    store = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
        "symbols": sym_map,
    }
    _save_snapshot_store(store)
    return {
        "updated_at": store["updated_at"],
        "updated_count": updated,
        "requested_count": len(targets),
        "errors": errors[:20],
        "symbol_count": len(sym_map),
    }


def _calc_position_metrics_cached(
    symbol: str, shares: float, cost_basis: float, *, force_live: bool = False
) -> Dict[str, Any]:
    """Prefer snapshot for price/RSI/MA; recompute P&L from shares/cost."""
    if not force_live:
        snap = get_symbol_snapshot(symbol)
        if snap and snap.get("current_price") is not None:
            current = _safe_float(snap.get("current_price"))
            position_value = shares * current
            total_cost = shares * cost_basis
            return {
                "symbol": _normalize_symbol(symbol),
                "shares": shares,
                "cost_basis": cost_basis,
                "current_price": round(current, 2),
                "ma20": round(_safe_float(snap.get("ma20")), 2),
                "rsi": round(_safe_float(snap.get("rsi")), 2),
                "position_value": round(position_value, 2),
                "total_cost": round(total_cost, 2),
                "pnl": round(position_value - total_cost, 2),
                "high_52w_percentile": round(
                    _safe_float(snap.get("high_52w_percentile")), 4
                ),
                "near_52w_high_pct": round(_safe_float(snap.get("near_52w_high_pct")), 4),
                "from_snapshot": True,
            }
    live = _calc_position_metrics(symbol, shares, cost_basis)
    live["from_snapshot"] = False
    return live


def _download_history_cached(
    tickers: Sequence[str],
    *,
    period: str,
    interval: str = "1d",
    ttl_seconds: int = 6 * 60 * 60,
):
    key = f"hist:{interval}:{period}:{','.join(tickers)}"
    cached = _cache_get(_HISTORY_CACHE, key, ttl_seconds=ttl_seconds)
    if cached is not None:
        return cached
    if yf is None:  # pragma: no cover
        raise RuntimeError("yfinance is not installed")
    data = yf.download(
        list(tickers),
        period=period,
        interval=interval,
        auto_adjust=True,
        group_by="ticker",
        threads=True,
        progress=False,
    )
    _cache_set(_HISTORY_CACHE, key, data)
    return data


def _get_single_close_history(symbol: str, period: str):
    data = _download_history_cached([symbol], period=period)
    if isinstance(data.columns, list) or len(getattr(data, "columns", [])) == 0:
        return data
    # When only one ticker is requested, yfinance returns single-level columns.
    return data


def _position_52w_high_percentile(history_1y) -> Tuple[float, float, float]:
    """
    Returns (pctile_in_range_0_1, close, high_52w).
    pctile is (close - low) / (high - low), clamped.
    """
    close_series = history_1y["Close"].dropna()
    if close_series.empty:
        return 0.0, 0.0, 0.0
    close = float(close_series.iloc[-1])
    high = float(close_series.max())
    low = float(close_series.min())
    denom = max(1e-9, high - low)
    pctile = max(0.0, min(1.0, (close - low) / denom))
    return pctile, close, high


def _extract_cash_from_rows(
    rows: List[Dict[str, Any]],
    *,
    portfolio_id: Optional[str] = None,
) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Supports an optional CASH row inside the same table:
      - symbol == CASH or USD treated as cash balance in 'shares' (USD).
    When portfolio_id is set, only rows with matching portfolio_id are used (multi-tenant).
    If no cash rows contribute a positive total, falls back to PORTFOLIO_CASH_USD env (default 0).
    """
    cash = 0.0
    keep: List[Dict[str, Any]] = []
    for r in rows:
        if not _row_matches_portfolio(r, portfolio_id):
            continue
        sym = _normalize_symbol(str(r.get("symbol", "")))
        if _is_cash_symbol(sym):
            cash += _safe_float(r.get("shares", 0.0), 0.0)
            continue
        keep.append(r)
    if cash <= 0.0:
        cash = _safe_float(os.getenv("PORTFOLIO_CASH_USD", "0"), 0.0)
    return cash, keep


def _calc_position_metrics(symbol: str, shares: float, cost_basis: float) -> Dict[str, Any]:
    sym = _normalize_symbol(symbol)
    if yf is None:  # pragma: no cover
        raise RuntimeError("yfinance is not installed")
    hist = yf.Ticker(sym).history(period="1y", auto_adjust=True)
    if "Close" not in hist or hist["Close"].dropna().shape[0] < 60:
        raise ValueError(f"{sym}: not enough price history.")

    close_series = hist["Close"].dropna()
    current = float(close_series.iloc[-1])
    ma20 = float(close_series.rolling(window=20).mean().iloc[-1])
    rsi = float(calculate_rsi(close_series).iloc[-1])

    pctile, _, high_52w = _position_52w_high_percentile(hist)
    near_high = 0.0 if high_52w <= 0 else (high_52w - current) / high_52w

    position_value = shares * current
    total_cost = shares * cost_basis
    pnl = position_value - total_cost

    return {
        "symbol": sym,
        "shares": shares,
        "cost_basis": cost_basis,
        "current_price": round(current, 2),
        "ma20": round(ma20, 2),
        "rsi": round(rsi, 2),
        "position_value": round(position_value, 2),
        "total_cost": round(total_cost, 2),
        "pnl": round(pnl, 2),
        "high_52w_percentile": round(pctile, 4),
        "near_52w_high_pct": round(near_high, 4),
    }


def _portfolio_sector_from_row(row: Dict[str, Any]) -> Optional[str]:
    raw = row.get("sector")
    if raw is None:
        return None
    s = str(raw).strip()
    return s if s else None


def _yfinance_sector_label(symbol: str) -> str:
    """Sector (or industry) from Yahoo metadata; 'Unknown' if missing or on error."""
    sym = _normalize_symbol(symbol)
    if yf is None:  # pragma: no cover
        return "Unknown"
    try:
        info = yf.Ticker(sym).info or {}
        raw = info.get("sector") or info.get("industry") or ""
        s = str(raw).strip()
        return s if s else "Unknown"
    except Exception:
        return "Unknown"


def _try_persist_portfolio_sector(
    sb: Any,
    portfolio_table: str,
    symbol: str,
    sector: str,
    *,
    portfolio_id: Optional[str] = None,
) -> None:
    """Write sector to Supabase when we learned it from the network (column must exist)."""
    if _bool_env("SUPABASE_SKIP_SECTOR_PERSIST", False):
        return
    if not sector or sector == "Unknown":
        return
    try:
        q = sb.table(portfolio_table).update({"sector": sector}).eq("symbol", symbol)
        if portfolio_id is not None:
            q = q.eq("portfolio_id", portfolio_id)
        q.execute()
    except Exception:
        pass


def _sector_breakdown(positions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Sector is best-effort only; yfinance frequently omits it.
    sector_value: Dict[str, float] = defaultdict(float)
    for p in positions:
        sec = p.get("sector") or "Unknown"
        sector_value[sec] += _safe_float(p.get("position_value"), 0.0)
    total = sum(sector_value.values()) or 1.0
    rows = []
    for sec, val in sorted(sector_value.items(), key=lambda x: -x[1]):
        rows.append(
            {
                "sector": sec,
                "value": round(val, 2),
                "weight_pct": round(val / total * 100, 2),
            }
        )
    return rows


def _rank_new_candidates(
    excluded_symbols: Iterable[str],
    *,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    A lightweight Nasdaq-100 screener using only price/volume history.
    Returns up to `limit` candidates ranked by "buy-the-dip but not broken" score.
    """
    excluded = {_normalize_symbol(s) for s in excluded_symbols}
    universe = [t for t in nasdaq100_universe() if _normalize_symbol(t) not in excluded]
    if not universe:
        return []

    data = _download_history_cached(universe, period="1y", ttl_seconds=12 * 60 * 60)
    out: List[Dict[str, Any]] = []

    # yfinance returns MultiIndex columns when many tickers are requested.
    if getattr(data.columns, "nlevels", 1) < 2:
        return []

    for t in universe:
        try:
            px = data[t].dropna()
            if px.empty:
                continue
            if "Close" not in px or "Volume" not in px:
                continue
            close_series = px["Close"].dropna()
            vol_series = px["Volume"].dropna()
            if close_series.shape[0] < 200:
                continue

            close = float(close_series.iloc[-1])
            high = float(close_series.max())
            start = float(close_series.iloc[0])
            if high <= 0 or start <= 0:
                continue

            dd = (high - close) / high  # positive drawdown from high
            ret_1y = (close / start) - 1.0

            last30 = min(30, close_series.shape[0])
            avg_dollar_vol = float((close_series.iloc[-last30:] * vol_series.iloc[-last30:]).mean())

            # "Not broken": positive 1y return; "dip": at least 10% off highs; liquidity: $ volume
            if ret_1y < 0.05:
                continue
            if dd < 0.10:
                continue
            if avg_dollar_vol < 50_000_000:
                continue

            score = dd * 100.0 + ret_1y * 10.0
            out.append(
                {
                    "symbol": _normalize_symbol(t),
                    "score": round(score, 3),
                    "drawdown_from_52w_high_pct": round(dd * 100, 2),
                    "return_1y_pct": round(ret_1y * 100, 2),
                    "avg_dollar_vol_30d": round(avg_dollar_vol, 0),
                }
            )
        except Exception:
            continue

    out.sort(key=lambda r: (-_safe_float(r.get("score"), 0.0), r["symbol"]))
    return out[:limit]


def _policy_actions(
    positions: List[Dict[str, Any]],
    *,
    cash_usd: float,
    qqq_info: Dict[str, Any],
    cfg: PolicyConfig,
) -> Dict[str, Any]:
    total_invested = sum(_safe_float(p.get("position_value"), 0.0) for p in positions)
    total_value = total_invested + cash_usd
    total_value = max(total_value, 1e-9)

    cash_pct = cash_usd / total_value
    cash_floor_usd = cfg.cash_floor_pct * total_value
    cash_needed_usd = max(0.0, cash_floor_usd - cash_usd)

    holdings_count = len({p["symbol"] for p in positions})
    max_new_buys = max(0, cfg.max_holdings - holdings_count)

    # Enrich weights
    for p in positions:
        p["weight_pct"] = round(_safe_float(p.get("position_value")) / total_value * 100, 3)

    positions_sorted = sorted(positions, key=lambda p: -_safe_float(p.get("weight_pct"), 0.0))

    actions: List[Dict[str, Any]] = []
    notes: List[str] = []

    # 1) Hard cap trims first
    planned_trim_usd = 0.0
    for p in positions_sorted:
        w = _safe_float(p.get("weight_pct"), 0.0) / 100.0
        if w <= cfg.hard_cap_pct:
            continue
        target = cfg.trim_target_after_hard_cap_pct
        trim_usd = max(0.0, (w - target) * total_value)
        if trim_usd < cfg.min_trade_usd:
            continue
        planned_trim_usd += trim_usd
        actions.append(
            {
                "type": "TRIM",
                "symbol": p["symbol"],
                "reason": f"Hard cap breach: {w*100:.1f}% > {cfg.hard_cap_pct*100:.0f}%",
                "rule_trigger": f"hard_cap_pct={cfg.hard_cap_pct*100:.0f}% breached (weight={w*100:.1f}%)",
                "trade_usd": round(trim_usd, 2),
                "approx_shares": trade_value_to_shares(
                    trim_usd, _safe_float(p.get("current_price")), cfg.allow_fractional_shares
                ),
                "target_weight_pct": round(target * 100, 2),
            }
        )

    # 2) If cash is below floor, raise cash by trimming largest positions (prefer already-high)
    if cash_needed_usd > 0:
        remaining = cash_needed_usd
        for p in positions_sorted:
            if remaining <= 0:
                break
            price = _safe_float(p.get("current_price"))
            if price <= 0:
                continue
            # Trim up to 20% of the position value in one go to avoid drastic moves.
            max_trim = 0.20 * _safe_float(p.get("position_value"))
            trim_usd = min(remaining, max_trim)
            if trim_usd < cfg.min_trade_usd:
                continue
            remaining -= trim_usd
            planned_trim_usd += trim_usd
            actions.append(
                {
                    "type": "RAISE_CASH",
                    "symbol": p["symbol"],
                    "reason": f"Restore cash to {cfg.cash_floor_pct*100:.0f}% floor",
                    "rule_trigger": f"cash_floor_pct={cfg.cash_floor_pct*100:.0f}% shortfall (need ${cash_needed_usd:,.0f})",
                    "trade_usd": round(trim_usd, 2),
                    "approx_shares": trade_value_to_shares(
                        trim_usd, price, cfg.allow_fractional_shares
                    ),
                }
            )
        if remaining > 0:
            notes.append(
                f"Cash floor shortfall remains (${remaining:,.0f}) after planned trims; "
                "consider allowing larger trims or adding cash."
            )

    # Project cash after trims (policy allows buying using excess above the cash floor)
    projected_cash = cash_usd + planned_trim_usd
    excess_cash = max(0.0, projected_cash - cash_floor_usd)
    deploy_pct = _deploy_pct_for_level(int(qqq_info.get("dip_level", 0)), cfg)
    deploy_budget = excess_cash * deploy_pct

    # 3) Take-profit trims (high + overweight) (only if not already too many actions)
    for p in positions_sorted:
        if len(actions) >= 8:
            break
        w = _safe_float(p.get("weight_pct"), 0.0) / 100.0
        if w <= cfg.overweight_pct:
            continue
        pctile = _safe_float(p.get("high_52w_percentile"), 0.0)
        near_high = _safe_float(p.get("near_52w_high_pct"), 1.0)
        is_high = (pctile >= cfg.take_profit_52w_percentile) or (
            near_high <= cfg.take_profit_near_high_pct
        )
        if not is_high:
            continue
        target = cfg.trim_target_after_take_profit_pct
        trim_usd = max(0.0, (w - target) * total_value)
        if trim_usd < cfg.min_trade_usd:
            continue
        actions.append(
            {
                "type": "TAKE_PROFIT_TRIM",
                "symbol": p["symbol"],
                "reason": "Near 52-week high + overweight",
                "rule_trigger": (
                    f"take_profit(high_52w_percentile>={cfg.take_profit_52w_percentile:.2f} "
                    f"or near_52w_high_pct<={cfg.take_profit_near_high_pct:.2f}) "
                    f"AND overweight_pct>{cfg.overweight_pct*100:.0f}% (weight={w*100:.1f}%)"
                ),
                "trade_usd": round(trim_usd, 2),
                "approx_shares": trade_value_to_shares(
                    trim_usd, _safe_float(p.get("current_price")), cfg.allow_fractional_shares
                ),
                "target_weight_pct": round(target * 100, 2),
            }
        )

    # 4) Buys: only from excess cash above the 15% floor, and only when dip L1+
    buy_picks: List[Dict[str, Any]] = []
    dip_level = int(qqq_info.get("dip_level", 0))
    if dip_level >= 1 and deploy_budget >= cfg.min_trade_usd:
        # Underweight existing holdings first (simple diversification)
        under = [
            p
            for p in positions
            if (_safe_float(p.get("weight_pct"), 0.0) / 100.0) < cfg.underweight_pct
        ]
        under.sort(key=lambda p: _safe_float(p.get("weight_pct"), 0.0))
        for p in under[:2]:
            buy_picks.append({"type": "BUY_EXISTING", "symbol": p["symbol"], "price": p["current_price"]})

        # New-stock candidates: mechanical dip screener is demoted to optional fallback only.
        # Primary new-name suggestions come from grounded Gemini in run_portfolio_analysis.
        use_mechanical = _bool_env("POLICY_MECHANICAL_BUY_NEW", False)
        if use_mechanical and max_new_buys > 0:
            new_candidates = _rank_new_candidates([p["symbol"] for p in positions], limit=5)
            for c in new_candidates[: max(0, 3 - len(buy_picks))]:
                buy_picks.append(
                    {
                        "type": "BUY_NEW",
                        "symbol": c["symbol"],
                        "price": None,
                        "candidate": {**c, "source": "mechanical_dip"},
                    }
                )

        if use_mechanical and not buy_picks and max_new_buys > 0:
            new_candidates = _rank_new_candidates([p["symbol"] for p in positions], limit=3)
            for c in new_candidates[:1]:
                buy_picks.append(
                    {
                        "type": "BUY_NEW",
                        "symbol": c["symbol"],
                        "price": None,
                        "candidate": {**c, "source": "mechanical_dip"},
                    }
                )

    if buy_picks:
        per = deploy_budget / len(buy_picks)
        for pick in buy_picks:
            symbol = pick["symbol"]
            price = pick.get("price")
            if price is None:
                # best-effort current price for share estimation
                try:
                    px = yf.Ticker(symbol).history(period="5d", auto_adjust=True)["Close"].dropna()
                    price = float(px.iloc[-1]) if not px.empty else 0.0
                except Exception:
                    price = 0.0
            trade_usd = per
            if trade_usd < cfg.min_trade_usd:
                continue
            actions.append(
                {
                    "type": pick["type"],
                    "symbol": symbol,
                    "reason": (
                        f"Dip L{dip_level} + excess cash (deploy {deploy_pct*100:.0f}% of excess)"
                        if pick["type"] == "BUY_NEW"
                        else f"Underweight + Dip L{dip_level}"
                    ),
                    "rule_trigger": (
                        f"dip_level>=1 (L{dip_level}) AND excess_cash_usd>0; deploy={deploy_pct*100:.0f}%"
                        if pick["type"] == "BUY_NEW"
                        else f"underweight_pct<{cfg.underweight_pct*100:.0f}% AND dip_level>=1 (L{dip_level})"
                    ),
                    "trade_usd": round(trade_usd, 2),
                    "approx_shares": trade_value_to_shares(
                        trade_usd, _safe_float(price), cfg.allow_fractional_shares
                    ),
                    "price_used": round(_safe_float(price), 2),
                    "candidate": pick.get("candidate"),
                }
            )

    # De-duplicate same (type,symbol) by keeping the larger trade
    dedup: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for a in actions:
        k = (a.get("type", ""), a.get("symbol", ""))
        if k not in dedup or _safe_float(a.get("trade_usd")) > _safe_float(dedup[k].get("trade_usd")):
            dedup[k] = a
    actions = list(dedup.values())

    # Sort: breach fixes and trims first, then buys
    order = {
        "TRIM": 0,
        "RAISE_CASH": 1,
        "TAKE_PROFIT_TRIM": 2,
        "BUY_EXISTING": 3,
        "BUY_NEW": 4,
    }
    actions.sort(key=lambda a: (order.get(a.get("type", ""), 9), -_safe_float(a.get("trade_usd"), 0.0)))

    return {
        "totals": {
            "total_value": round(total_value, 2),
            "total_invested": round(total_invested, 2),
            "cash_usd": round(cash_usd, 2),
            "cash_pct": round(cash_pct * 100, 3),
            "cash_floor_usd": round(cash_floor_usd, 2),
            "cash_needed_usd": round(cash_needed_usd, 2),
            "excess_cash_usd": round(excess_cash, 2),
            "deploy_budget_usd": round(deploy_budget, 2),
        },
        "constraints": {
            "cash_floor_pct": cfg.cash_floor_pct,
            "max_holdings": cfg.max_holdings,
            "underweight_pct": cfg.underweight_pct,
            "overweight_pct": cfg.overweight_pct,
            "hard_cap_pct": cfg.hard_cap_pct,
            "min_trade_usd": cfg.min_trade_usd,
            "allow_fractional_shares": cfg.allow_fractional_shares,
        },
        "holdings_count": holdings_count,
        "max_new_buys": max_new_buys,
        "recommended_actions": actions,
        "notes": notes,
    }


def _build_ai_prompt(policy_report: Dict[str, Any]) -> str:
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
Only in the final watchlist line may you mention 1–2 additional well-known U.S. tickers (not already listed) if you justify them with a brief macro catalyst—never invent exact prices.

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

Output format (numbered lines, no markdown tables):
1) Status: OK / Attention / Action.
2) Market: one line (dip level + brief context; mention QQQ/SPY if useful).
3) Cash: one line (cash%, floor, excess or shortfall vs floor).
4) Actions: line 1 — "SYMBOL — ACTION — $ — ~shares — (Rule: ...)" or (none).
5) Actions: line 2 — same format or (none).
6) Actions: line 3 — same format or (none).
7) Why: one line (consolidate "why no other actions").
8) Uncertainty: one short sentence.
9) Disclaimer: Not financial advice; rules are heuristic.
10) Portfolio: one line (size, deploy budget, largest concentration if obvious from the list).
11) Holdings: 2–4 short lines on top names by weight (symbols from "Top holdings" only).
12) Sectors: 1–2 lines on mix (or note if sector data is mostly Unknown).
13) Risks / data: one line (warnings or "none").
14) Optional: one line on RSI/MA20 for a top holding if notable (numbers from the list only).
15) Watchlist: "Ticker — theme" for 1–2 potential buys outside the current portfolio, justified by macro/sector context (no fabricated prices).
Keep total under ~22 short lines; stay factual.
"""


def rules_only_summary_from_policy(policy_report: Dict[str, Any]) -> str:
    """Deterministic 9-part summary matching the Gemini prompt format (rules-only)."""
    policy = policy_report.get("policy") or {}
    actions = list(policy.get("recommended_actions") or [])[:3]
    qqq = policy_report.get("qqq") or {}
    spy = policy_report.get("spy") or {}
    combined = int(policy_report.get("combined_dip_level", 0))
    why_list = list(policy_report.get("why_no_other_actions") or [])
    unc_list = list(policy_report.get("uncertainty_notes") or [])
    warnings = policy_report.get("warnings") or []
    totals = policy.get("totals") or {}
    constraints = policy.get("constraints") or {}

    cash_floor_pct = float(constraints.get("cash_floor_pct", 0.15))
    has_actions = len(actions) > 0
    data_issues = bool(qqq.get("error") or spy.get("error") or warnings)
    if has_actions:
        status = "Action"
    elif data_issues:
        status = "Attention"
    else:
        status = "OK"

    q_l = int(qqq.get("dip_level", 0))
    s_l = int(spy.get("dip_level", 0))
    market_body = (
        f"Combined dip L{combined} (max of QQQ L{q_l} and SPY L{s_l}); "
        f"QQQ 6M/12M DD {qqq.get('drawdown_6m_pct', 0):.2f}% / {qqq.get('drawdown_12m_pct', 0):.2f}%; "
        f"SPY 6M/12M DD {spy.get('drawdown_6m_pct', 0):.2f}% / {spy.get('drawdown_12m_pct', 0):.2f}%."
    )

    cash_body = (
        f"${totals.get('cash_usd', 0):.2f} ({totals.get('cash_pct', 0):.2f}% of portfolio); "
        f"floor {cash_floor_pct*100:.0f}% of portfolio."
    )

    action_lines: List[str] = []
    for a in actions:
        sym = a.get("symbol", "?")
        typ = str(a.get("type", "?"))
        usd = a.get("trade_usd", 0)
        sh = a.get("approx_shares", 0)
        rule = a.get("rule_trigger", "n/a")
        action_lines.append(f"{sym} — {typ} — ${usd} — ~{sh} sh — (Rule: {rule})")
    while len(action_lines) < 3:
        action_lines.append("(none)")

    why_text = why_list[0] if why_list else "No additional rule triggers apply."
    unc_text = unc_list[0] if unc_list else "Data looks complete; monitoring only."
    disclaimer = "Not financial advice; rules are heuristic."

    parts = [
        f"1) Status: {status}.",
        f"2) Market: {market_body}",
        f"3) Cash: {cash_body}",
        f"4) Actions: {action_lines[0]}",
        f"5) Actions: {action_lines[1]}",
        f"6) Actions: {action_lines[2]}",
        f"7) Why: {why_text}",
        f"8) Uncertainty: {unc_text}",
        f"9) Disclaimer: {disclaimer}",
    ]
    return "\n".join(parts)


def rules_full_summary_from_policy(policy_report: Dict[str, Any]) -> str:
    """
    Deterministic 15-part summary matching the AI prompt's numbered-line format.
    This is used as a fallback when Gemini output is unavailable.
    """
    policy = policy_report.get("policy") or {}
    actions = list(policy.get("recommended_actions") or [])[:3]
    qqq = policy_report.get("qqq") or {}
    spy = policy_report.get("spy") or {}
    combined = int(policy_report.get("combined_dip_level", 0))
    why_list = list(policy_report.get("why_no_other_actions") or [])
    unc_list = list(policy_report.get("uncertainty_notes") or [])
    warnings = list(policy_report.get("warnings") or [])
    totals = policy.get("totals") or {}
    constraints = policy.get("constraints") or {}
    positions = list(policy_report.get("positions") or [])
    sectors = list(policy_report.get("sector_breakdown") or [])

    cash_floor_pct = float(constraints.get("cash_floor_pct", 0.15))
    has_actions = len(actions) > 0
    data_issues = bool(qqq.get("error") or spy.get("error") or warnings)
    if has_actions:
        status = "Action"
    elif data_issues:
        status = "Attention"
    else:
        status = "OK"

    q_l = int(qqq.get("dip_level", 0))
    s_l = int(spy.get("dip_level", 0))
    market_body = f"Combined dip L{combined} (max of QQQ L{q_l} and SPY L{s_l})."

    cash_pct = float(totals.get("cash_pct", 0.0))
    cash_body = (
        f"${totals.get('cash_usd', 0):.2f} ({cash_pct:.2f}%); "
        f"floor {cash_floor_pct*100:.0f}%; "
        f"gap ${totals.get('cash_needed_usd', 0):.2f}; excess ${totals.get('excess_cash_usd', 0):.2f}."
    )

    def fmt_action(a: Dict[str, Any]) -> str:
        sym = a.get("symbol", "?")
        typ = str(a.get("type", "?"))
        usd = a.get("trade_usd", 0)
        sh = a.get("approx_shares", 0)
        rule = a.get("rule_trigger", "n/a")
        return f"{sym} — {typ} — ${usd} — ~{sh} sh — (Rule: {rule})"

    action_lines = [fmt_action(a) for a in actions]
    while len(action_lines) < 3:
        action_lines.append("(none)")

    why_text = why_list[0] if why_list else "No additional rule triggers apply."
    unc_text = unc_list[0] if unc_list else "Data looks complete; monitoring only."
    disclaimer = "Not financial advice; rules are heuristic."

    total_value = float(totals.get("total_value", 0.0))
    deploy_budget = float(totals.get("deploy_budget_usd", 0.0))
    top_weight = 0.0
    top_sym = "n/a"
    if positions:
        top = max(positions, key=lambda p: _safe_float(p.get("weight_pct"), 0.0))
        top_weight = _safe_float(top.get("weight_pct"), 0.0)
        top_sym = str(top.get("symbol", "n/a"))
    portfolio_line = (
        f"Total ${total_value:,.0f}; deploy budget ${deploy_budget:,.0f}; "
        f"largest concentration {top_sym} {top_weight:.2f}%."
    )

    top_holdings = sorted(positions, key=lambda p: -_safe_float(p.get("weight_pct"), 0.0))[:4]
    holding_lines = []
    for p in top_holdings:
        sym = p.get("symbol", "?")
        w = _safe_float(p.get("weight_pct"), 0.0)
        pnl = _safe_float(p.get("pnl"), 0.0)
        holding_lines.append(f"{sym} {w:.2f}% (P/L ${pnl:+,.0f})")
    while len(holding_lines) < 2:
        holding_lines.append("(none)")

    sector_sorted = sorted(sectors, key=lambda s: -_safe_float(s.get("weight_pct"), 0.0))
    sector_lines = []
    for s in sector_sorted[:2]:
        sector_lines.append(f"{s.get('sector', '?')}: {float(s.get('weight_pct', 0.0)):.1f}%")
    if not sector_lines:
        sector_lines = ["Unknown / not grouped."]

    warn_line = warnings[0] if warnings else "none"

    rsi_line = "(none)"
    if top_holdings:
        p = top_holdings[0]
        sym = p.get("symbol", "?")
        rsi = _safe_float(p.get("rsi"), 0.0)
        px = _safe_float(p.get("current_price"), 0.0)
        ma = _safe_float(p.get("ma20"), 0.0)
        vs = "above" if px >= ma else "below"
        if rsi > 0 and ma > 0:
            rsi_line = f"{sym}: RSI {rsi:.0f}, {vs} MA20."

    parts = [
        f"1) Status: {status}.",
        f"2) Market: {market_body}",
        f"3) Cash: {cash_body}",
        f"4) Actions: {action_lines[0]}",
        f"5) Actions: {action_lines[1]}",
        f"6) Actions: {action_lines[2]}",
        f"7) Why: {why_text}",
        f"8) Uncertainty: {unc_text}",
        f"9) Disclaimer: {disclaimer}",
        f"10) Portfolio: {portfolio_line}",
        f"11) Holdings: {holding_lines[0]}",
        f"12) Holdings: {holding_lines[1]}",
        f"13) Sectors: {sector_lines[0]}",
        f"14) Risks / data: {warn_line}",
        "15) Watchlist: (none)",
    ]
    return "\n".join(parts)


def rules_only_full_summary_from_policy(policy_report: Dict[str, Any]) -> str:
    """
    Deterministic 15-part summary matching the Gemini prompt format (rules-only).
    Used as a fallback when AI summary is unavailable (e.g., missing GEMINI_API_KEY).
    """
    policy = policy_report.get("policy") or {}
    actions_all = list(policy.get("recommended_actions") or [])
    actions = actions_all[:3]
    qqq = policy_report.get("qqq") or {}
    spy = policy_report.get("spy") or {}
    combined = int(policy_report.get("combined_dip_level", 0))
    why_list = list(policy_report.get("why_no_other_actions") or [])
    unc_list = list(policy_report.get("uncertainty_notes") or [])
    warnings = list(policy_report.get("warnings") or [])
    totals = policy.get("totals") or {}
    constraints = policy.get("constraints") or {}
    positions = list(policy_report.get("positions") or [])
    sectors = list(policy_report.get("sector_breakdown") or [])

    cash_floor_pct = float(constraints.get("cash_floor_pct", 0.15))
    has_actions = len(actions) > 0
    data_issues = bool(qqq.get("error") or spy.get("error") or warnings)
    if has_actions:
        status = "Action"
    elif data_issues:
        status = "Attention"
    else:
        status = "OK"

    q_l = int(qqq.get("dip_level", 0))
    s_l = int(spy.get("dip_level", 0))
    market_body = (
        f"Combined dip L{combined} (max of QQQ L{q_l} and SPY L{s_l}); "
        f"QQQ 6M/12M DD {qqq.get('drawdown_6m_pct', 0):.2f}% / {qqq.get('drawdown_12m_pct', 0):.2f}%; "
        f"SPY 6M/12M DD {spy.get('drawdown_6m_pct', 0):.2f}% / {spy.get('drawdown_12m_pct', 0):.2f}%."
    )

    cash_pct = float(totals.get("cash_pct", 0.0) or 0.0)
    cash_needed = float(totals.get("cash_needed_usd", 0.0) or 0.0)
    excess_cash = float(totals.get("excess_cash_usd", 0.0) or 0.0)
    cash_detail = ""
    if cash_needed > 0:
        cash_detail = f" Shortfall vs floor: ${cash_needed:,.0f}."
    elif excess_cash > 0:
        cash_detail = f" Excess above floor: ${excess_cash:,.0f}."
    cash_body = (
        f"${totals.get('cash_usd', 0):.2f} ({cash_pct:.2f}% of portfolio); "
        f"floor {cash_floor_pct*100:.0f}% of portfolio.{cash_detail}"
    )

    action_lines: List[str] = []
    for a in actions:
        sym = a.get("symbol", "?")
        typ = str(a.get("type", "?"))
        usd = a.get("trade_usd", 0)
        sh = a.get("approx_shares", 0)
        rule = a.get("rule_trigger", "n/a")
        action_lines.append(f"{sym} — {typ} — ${usd} — ~{sh} sh — (Rule: {rule})")
    while len(action_lines) < 3:
        action_lines.append("(none)")

    why_text = why_list[0] if why_list else "No additional rule triggers apply."
    unc_text = unc_list[0] if unc_list else "Data looks complete; monitoring only."
    disclaimer = "Not financial advice; rules are heuristic."

    total_value = float(totals.get("total_value", 0.0) or 0.0)
    deploy_budget = float(totals.get("deploy_budget_usd", 0.0) or 0.0)
    invested = float(totals.get("total_invested", 0.0) or 0.0)
    holdings_count = int(policy.get("holdings_count", len({p.get('symbol') for p in positions}) or 0))
    max_holdings = int(constraints.get("max_holdings", 18))

    # Largest concentration heuristic: use top weight_pct when available
    top_w = 0.0
    top_sym = ""
    for p in positions:
        w = _safe_float(p.get("weight_pct"), 0.0)
        if w > top_w:
            top_w = w
            top_sym = str(p.get("symbol") or "").strip()

    port_line = f"Value ${total_value:,.0f}; deploy budget ${deploy_budget:,.0f}; invested ${invested:,.0f}."
    if top_sym and top_w > 0:
        port_line += f" Largest weight {top_sym} at {top_w:.1f}%."

    # Holdings narrative: 2–4 short lines on top names by weight
    pos_sorted = sorted(positions, key=lambda p: -_safe_float(p.get("weight_pct"), 0.0))
    hold_lines: List[str] = []
    for p in pos_sorted[:4]:
        sym = p.get("symbol", "?")
        w = _safe_float(p.get("weight_pct"), 0.0)
        pnl = _safe_float(p.get("pnl"), 0.0)
        rsi = _safe_float(p.get("rsi"), 0.0)
        px = _safe_float(p.get("current_price"), 0.0)
        ma = _safe_float(p.get("ma20"), 0.0)
        vs = "above" if px >= ma else "below"
        hold_lines.append(f"{sym}: {w:.1f}% weight, P/L ${pnl:+,.0f}, RSI {rsi:.0f}, {vs} MA20.")
    if not hold_lines:
        hold_lines = ["(none)"]

    # Sectors: 1–2 lines
    sec_lines: List[str] = []
    for s in sectors[:2]:
        sec = s.get("sector", "?")
        pct = _safe_float(s.get("weight_pct"), 0.0)
        sec_lines.append(f"{sec}: {pct:.1f}%.")
    if not sec_lines:
        sec_lines = ["Sector data mostly Unknown."]

    risk_line = "Warnings: " + (warnings[0] if warnings else "none.")

    # Optional RSI/MA20 notable line: use the top holding if its RSI extreme
    optional_line = "(n/a)"
    if pos_sorted:
        p0 = pos_sorted[0]
        sym0 = p0.get("symbol", "?")
        rsi0 = _safe_float(p0.get("rsi"), 0.0)
        px0 = _safe_float(p0.get("current_price"), 0.0)
        ma0 = _safe_float(p0.get("ma20"), 0.0)
        if rsi0 <= 35 or rsi0 >= 65:
            optional_line = f"{sym0}: RSI {rsi0:.0f}; price ${px0:.2f} vs MA20 ${ma0:.2f}."

    # Watchlist: avoid fabricating; deterministic placeholders (no extra tickers)
    watchlist = "Watchlist: (manual review) — no extra tickers suggested in rules-only mode."

    parts = [
        f"1) Status: {status}.",
        f"2) Market: {market_body}",
        f"3) Cash: {cash_body}",
        f"4) Actions: {action_lines[0]}",
        f"5) Actions: {action_lines[1]}",
        f"6) Actions: {action_lines[2]}",
        f"7) Why: {why_text}",
        f"8) Uncertainty: {unc_text}",
        f"9) Disclaimer: {disclaimer}",
        f"10) Portfolio: {port_line}",
        f"11) Holdings: {hold_lines[0]}",
        f"12) Sectors: {sec_lines[0]}",
        f"13) Risks / data: {risk_line}",
        f"14) Optional: {optional_line}",
        f"15) {watchlist}",
    ]
    # Ensure lines 11-12 include remaining holding/sector lines, but keep numbering stable.
    if len(hold_lines) > 1:
        parts[10] = parts[10] + " " + " ".join(hold_lines[1:])
    if len(sec_lines) > 1:
        parts[11] = parts[11] + " " + " ".join(sec_lines[1:])
    return "\n".join(parts)


def rich_policy_appendix(policy_report: Dict[str, Any]) -> str:
    """Structured snapshot from policy_report (plain lines, no markdown tables). For email/API extras."""
    pol = policy_report.get("policy") or {}
    totals = pol.get("totals") or {}
    constraints = pol.get("constraints") or {}
    positions = list(policy_report.get("positions") or [])
    sectors = list(policy_report.get("sector_breakdown") or [])
    notes = list(pol.get("notes") or [])
    warnings = list(policy_report.get("warnings") or [])
    qqq = policy_report.get("qqq") or {}
    spy = policy_report.get("spy") or {}
    holdings_count = int(pol.get("holdings_count", len({p.get("symbol") for p in positions}) or 0))
    max_h = int(constraints.get("max_holdings", 18))

    lines: List[str] = ["--- Portfolio snapshot ---"]
    lines.append(
        f"Total ${totals.get('total_value', 0):,.2f} (invested ${totals.get('total_invested', 0):,.2f}). "
        f"Holdings {holdings_count} / cap {max_h}, new-buy slots {pol.get('max_new_buys', 0)}."
    )
    lines.append(
        f"Cash floor gap ${totals.get('cash_needed_usd', 0):,.2f}; excess ${totals.get('excess_cash_usd', 0):,.2f}; "
        f"deploy budget ${totals.get('deploy_budget_usd', 0):,.2f}."
    )
    if not qqq.get("error") and qqq.get("close") is not None:
        qs = f"QQQ ${qqq.get('close')}"
        if not spy.get("error") and spy.get("close") is not None:
            qs += f", SPY ${spy.get('close')}"
        lines.append(f"Benchmark last close: {qs}.")

    pos_sorted = sorted(positions, key=lambda p: -_safe_float(p.get("weight_pct"), 0.0))[:8]
    if pos_sorted:
        lines.append("Top holdings (weight, value, P/L, RSI vs MA20):")
        for p in pos_sorted:
            sym = p.get("symbol", "?")
            w = _safe_float(p.get("weight_pct"), 0.0)
            val = _safe_float(p.get("position_value"), 0.0)
            pnl = _safe_float(p.get("pnl"), 0.0)
            rsi = _safe_float(p.get("rsi"), 0.0)
            px = _safe_float(p.get("current_price"), 0.0)
            ma = _safe_float(p.get("ma20"), 0.0)
            vs = "above" if px >= ma else "below"
            lines.append(f"  {sym}: {w:.2f}%  ${val:,.0f}  P/L ${pnl:+,.0f}  RSI {rsi:.0f}  {vs} MA20")

    if sectors:
        lines.append("Sector mix:")
        for s in sectors[:6]:
            lines.append(
                f"  {s.get('sector', '?')}: {s.get('weight_pct', 0):.1f}% (${s.get('value', 0):,.0f})"
            )

    if notes:
        lines.append("Policy notes:")
        for n in notes[:5]:
            lines.append(f"  - {n}")

    if warnings:
        lines.append("Data warnings:")
        for w in warnings[:10]:
            lines.append(f"  - {w}")

    return "\n".join(lines)


def _gemini_model_name() -> str:
    return (
        # Free-tier friendly default. gemini-3.1-pro* is paid-only (quota limit 0 on free).
        os.getenv("GEMINI_MODEL", "gemini-2.5-flash") or "gemini-2.5-flash"
    ).split("/")[-1]


def _build_suggested_buys_prompt(policy_report: Dict[str, Any]) -> str:
    pol = policy_report.get("policy") or {}
    totals = pol.get("totals") or {}
    constraints = pol.get("constraints") or {}
    positions = list(policy_report.get("positions") or [])
    sectors = list(policy_report.get("sector_breakdown") or [])
    held = sorted({_normalize_symbol(str(p.get("symbol", ""))) for p in positions if p.get("symbol")})
    pos_lines = [
        f"- {p.get('symbol')}: weight { _safe_float(p.get('weight_pct')):.1f}%, "
        f"sector {p.get('sector', 'Unknown')}, RSI {_safe_float(p.get('rsi')):.0f}"
        for p in sorted(positions, key=lambda x: -_safe_float(x.get("weight_pct")))[:12]
    ]
    sec_lines = [
        f"- {s.get('sector')}: { _safe_float(s.get('weight_pct')):.1f}%"
        for s in sectors[:8]
    ]
    return f"""You are a US equities portfolio research assistant.
Propose 2-3 NEW liquid US-listed stocks (large/mid cap preferred) that are NOT already held.
Use Google Search for recent catalysts (earnings, product, regulation, sector rotation). Do NOT invent prices.

Already held (do not suggest these or near-duplicates like GOOG if GOOGL held): {', '.join(held) or '(none)'}

Portfolio context:
- Total value ${ _safe_float(totals.get('total_value')):,.0f}, cash ${ _safe_float(totals.get('cash_usd')):,.0f} ({ _safe_float(totals.get('cash_pct')):.1f}%)
- Excess cash ${ _safe_float(totals.get('excess_cash_usd')):,.0f}, deploy budget ${ _safe_float(totals.get('deploy_budget_usd')):,.0f}
- Dip level L{int(policy_report.get('combined_dip_level', 0))}, holdings {pol.get('holdings_count')}/{constraints.get('max_holdings', 18)}
- Cash floor { _safe_float(constraints.get('cash_floor_pct'), 0.15)*100:.0f}%

Top holdings:
{chr(10).join(pos_lines) if pos_lines else '- (none)'}

Sector mix:
{chr(10).join(sec_lines) if sec_lines else '- Unknown'}

Return ONLY valid JSON (no markdown fences) with this shape:
{{
  "suggestions": [
    {{
      "symbol": "TICKER",
      "thesis": "one sentence",
      "fit": "why it fits THIS portfolio (gap or diversification)",
      "catalyst": "recent searchable catalyst",
      "risk": "key risk",
      "confidence": 0.0
    }}
  ]
}}
confidence is 0-1. Prefer names that fill a sector/theme gap or offer a clear asymmetric catalyst.
"""


def _parse_suggested_buys_json(text: str) -> List[Dict[str, Any]]:
    import json
    import re

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
                "fit": str(item.get("fit") or "").strip(),
                "catalyst": str(item.get("catalyst") or "").strip(),
                "risk": str(item.get("risk") or "").strip(),
                "confidence": round(min(1.0, max(0.0, _safe_float(item.get("confidence"), 0.5))), 3),
                "source": "gemini_grounded",
            }
        )
    return out[:3]


def _enrich_suggested_buys(
    suggestions: List[Dict[str, Any]], *, held: set
) -> List[Dict[str, Any]]:
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


def _generate_ai_summary(gemini: Any, policy_report: Dict[str, Any]) -> Tuple[str, str]:
    if not gemini or genai is None:
        return "", "Gemini is not configured (set GEMINI_API_KEY)."
    try:
        prompt = _build_ai_prompt(policy_report)
        model = _gemini_model_name()
        resp = gemini.models.generate_content(model=model, contents=prompt)
        return (resp.text or "").strip(), ""
    except Exception as e:
        return "", str(e)


def _generate_suggested_buys(gemini: Any, policy_report: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], str]:
    if not gemini or genai is None:
        return [], "Gemini is not configured (set GEMINI_API_KEY)."
    held = {
        _normalize_symbol(str(p.get("symbol", "")))
        for p in (policy_report.get("positions") or [])
        if p.get("symbol")
    }
    try:
        from google.genai import types  # type: ignore

        prompt = _build_suggested_buys_prompt(policy_report)
        model = _gemini_model_name()
        config = types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.4,
        )
        resp = gemini.models.generate_content(
            model=model, contents=prompt, config=config
        )
        parsed = _parse_suggested_buys_json(resp.text or "")
        return _enrich_suggested_buys(parsed, held=held), ""
    except Exception as e:
        # Retry without grounding if tool config fails
        try:
            prompt = _build_suggested_buys_prompt(policy_report)
            model = _gemini_model_name()
            resp = gemini.models.generate_content(model=model, contents=prompt)
            parsed = _parse_suggested_buys_json(resp.text or "")
            return _enrich_suggested_buys(parsed, held=held), f"grounding_fallback: {e}"
        except Exception as e2:
            return [], str(e2)


def run_portfolio_analysis(
    portfolio_id: Optional[str] = None,
    *,
    force_live: bool = False,
) -> Dict[str, Any]:
    """
    Same analysis as POST /api/analyze-portfolio (no HTTP server).
    If portfolio_id is omitted, PORTFOLIO_ID from the environment is used (CLI / scripts).
    Raises:
        RuntimeError: Supabase or required deps missing.
        ValueError: Empty portfolio, no holdings, or no valid positions.
    """
    sb = _create_supabase_client()
    if not sb:
        raise RuntimeError(
            "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY)."
        )

    cfg = load_policy_config_from_env()
    gemini = _create_gemini_client()
    portfolio_table = os.getenv("SUPABASE_PORTFOLIO_TABLE", "portfolio")
    resolved_id = (
        _normalize_portfolio_id_value(portfolio_id)
        if portfolio_id is not None
        else _portfolio_id_from_env()
    )

    rows = sb.table(portfolio_table).select("*").execute().data or []
    if not rows:
        raise ValueError("Portfolio is empty.")

    if resolved_id is not None:
        rows = [r for r in rows if _row_matches_portfolio(r, resolved_id)]
        if not rows:
            raise ValueError(
                f"No rows for portfolio_id={resolved_id}. Check PORTFOLIO_ID or table data."
            )

    cash_usd, holding_rows = _extract_cash_from_rows(rows, portfolio_id=resolved_id)
    if not holding_rows:
        raise ValueError("No stock holdings found (only cash row?).")

    # Refresh stale snapshots for holdings before analyze (unless force_live)
    if not force_live:
        need_refresh = [
            _normalize_symbol(str(r.get("symbol", "")))
            for r in holding_rows
            if r.get("symbol") and get_symbol_snapshot(str(r["symbol"])) is None
        ]
        if need_refresh:
            try:
                refresh_market_snapshots(need_refresh, include_benchmarks=True)
            except Exception:
                pass

    positions: List[Dict[str, Any]] = []
    warnings: List[str] = []
    for row in holding_rows:
        try:
            sym = _normalize_symbol(row["symbol"])
            pos = _calc_position_metrics_cached(
                sym,
                _safe_float(row.get("shares"), 0.0),
                _safe_float(row.get("cost_basis"), 0.0),
                force_live=force_live,
            )
            stored_sec = _portfolio_sector_from_row(row)
            if stored_sec:
                pos["sector"] = stored_sec
            else:
                label = _yfinance_sector_label(sym)
                pos["sector"] = label
                if label != "Unknown":
                    _try_persist_portfolio_sector(
                        sb, portfolio_table, sym, label, portfolio_id=resolved_id
                    )
            positions.append(pos)
        except Exception as e:
            warnings.append(f"{row.get('symbol')}: data error — {str(e)}")

    if not positions:
        raise ValueError("No valid positions to analyze.")

    def benchmark_info(symbol: str) -> Dict[str, Any]:
        try:
            if yf is None:  # pragma: no cover
                raise RuntimeError("yfinance is not installed")
            hist = yf.Ticker(symbol).history(period="1y", auto_adjust=True)
            close_series = hist["Close"].dropna()
            if close_series.shape[0] < 60:
                raise ValueError(f"not enough {symbol} history")
            close = float(close_series.iloc[-1])
            high_6m = (
                float(close_series.iloc[-126:].max())
                if close_series.shape[0] >= 126
                else float(close_series.max())
            )
            high_12m = float(close_series.max())
            level, dd = compute_dip_level(close, high_6m, high_12m, cfg)
            return {
                "symbol": symbol,
                "close": round(close, 2),
                "high_6m": round(high_6m, 2),
                "high_12m": round(high_12m, 2),
                "dip_level": level,
                "drawdown_6m_pct": round(dd["drawdown_6m"] * 100, 2),
                "drawdown_12m_pct": round(dd["drawdown_12m"] * 100, 2),
            }
        except Exception as e:
            return {
                "symbol": symbol,
                "error": str(e),
                "dip_level": 0,
                "drawdown_6m_pct": 0.0,
                "drawdown_12m_pct": 0.0,
            }

    qqq_info = benchmark_info("QQQ")
    spy_info = benchmark_info("SPY")
    combined_dip_level = max(int(qqq_info.get("dip_level", 0)), int(spy_info.get("dip_level", 0)))

    policy = _policy_actions(
        positions, cash_usd=cash_usd, qqq_info={"dip_level": combined_dip_level}, cfg=cfg
    )
    sector_breakdown = _sector_breakdown(positions)

    why_no_other_actions: List[str] = []
    uncertainty_notes: List[str] = []

    if qqq_info.get("error"):
        uncertainty_notes.append(f"QQQ data issue: {qqq_info['error']}")
    if spy_info.get("error"):
        uncertainty_notes.append(f"SPY data issue: {spy_info['error']}")
    if warnings:
        uncertainty_notes.append(
            f"{len(warnings)} holding(s) missing/invalid data; actions may be incomplete."
        )

    if not policy.get("recommended_actions"):
        if combined_dip_level <= 0:
            why_no_other_actions.append("Dip level is L0, so buy budget is 0 by policy.")
        cash_needed = _safe_float(policy.get("totals", {}).get("cash_needed_usd"), 0.0)
        if cash_needed <= 0:
            why_no_other_actions.append(
                "No hard-cap breaches and no take-profit triggers met thresholds."
            )
        if not why_no_other_actions:
            why_no_other_actions.append(
                "No eligible actions met minimum trade size and policy gates."
            )
    else:
        why_no_other_actions.append(
            "Only the highest-priority rule triggers are shown (max 3 actions)."
        )

    policy_report = {
        "qqq": qqq_info,
        "spy": spy_info,
        "combined_dip_level": combined_dip_level,
        "combine_rule": "max(QQQ, SPY)",
        "why_no_other_actions": why_no_other_actions,
        "uncertainty_notes": uncertainty_notes,
        "positions": positions,
        "sector_breakdown": sector_breakdown,
        "policy": policy,
        "warnings": warnings,
        "snapshot_meta": snapshot_store_meta(),
    }

    ai_summary, ai_last_error = _generate_ai_summary(gemini, policy_report)
    suggested_buys, suggest_error = _generate_suggested_buys(gemini, policy_report)
    if suggest_error and not ai_last_error:
        # Non-fatal note for UI
        pass

    pol_totals = dict(policy.get("totals") or {})
    total_cost = round(sum(_safe_float(p.get("total_cost")) for p in positions), 2)
    total_pnl = round(sum(_safe_float(p.get("pnl")) for p in positions), 2)
    totals = {
        **pol_totals,
        "total_cost": total_cost,
        "total_pnl": total_pnl,
    }

    return {
        "ai_summary": ai_summary,
        "ai_error": ai_last_error,
        "suggest_error": suggest_error,
        "policy_report": policy_report,
        "warnings": warnings,
        "totals": totals,
        "rule_actions": list(policy.get("recommended_actions") or []),
        "suggested_buys": suggested_buys,
        "sector_breakdown": sector_breakdown,
        "snapshot_meta": snapshot_store_meta(),
    }


def _create_supabase_client() -> Optional[Client]:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        return None
    if create_client is None:  # pragma: no cover
        raise RuntimeError("supabase is not installed")
    return create_client(url, key)


def _create_gemini_client() -> Optional[genai.Client]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    if genai is None:  # pragma: no cover
        raise RuntimeError("google-genai is not installed")
    return genai.Client(api_key=api_key)


def create_app() -> FastAPI:
    if (
        FastAPI is None
        or HTTPException is None
        or CORSMiddleware is None
        or Body is None
        or Query is None
    ):  # pragma: no cover
        raise RuntimeError("fastapi is not installed")
    app = FastAPI(title="Stock Portfolio Policy API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if (
        RequestValidationError is not None
        and JSONResponse is not None
        and Request is not None
        and status is not None
    ):

        @app.exception_handler(RequestValidationError)
        async def validation_exception_handler(
            request: Request, exc: RequestValidationError
        ) -> JSONResponse:
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content={"detail": _format_pydantic_request_errors(exc.errors())},
            )

    cfg = load_policy_config_from_env()
    supabase = _create_supabase_client()
    portfolio_table = os.getenv("SUPABASE_PORTFOLIO_TABLE", "portfolio")

    def require_supabase() -> Client:
        if not supabase:
            raise HTTPException(
                status_code=500,
                detail="Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY).",
            )
        return supabase

    if PortfolioPayload is None or PortfolioResponse is None:  # pragma: no cover
        raise RuntimeError("pydantic is not installed")

    def _effective_portfolio_id(
        payload_pid: Optional[str],
        query_pid: Optional[str] = None,
    ) -> Optional[str]:
        for candidate in (payload_pid, query_pid):
            if candidate is not None:
                val = _normalize_portfolio_id_value(candidate)
                if val is not None:
                    return val
        return _portfolio_id_from_env()

    @app.get("/api/stock/{symbol}")
    async def get_stock_quote(symbol: str):
        try:
            return _stock_quote_payload(symbol)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail="Failed to load quote") from e

    @app.get("/api/portfolio", response_model=PortfolioResponse)
    async def list_portfolio(portfolio_id: Optional[str] = Query(None)):
        sb = require_supabase()
        pid = (
            _normalize_portfolio_id_value(portfolio_id)
            if portfolio_id is not None
            else _portfolio_id_from_env()
        )
        q = sb.table(portfolio_table).select("*")
        if pid is not None:
            q = q.eq("portfolio_id", pid)
        try:
            response = q.order("symbol").execute()
        except Exception as exc:
            if PostgrestAPIError is not None and isinstance(exc, PostgrestAPIError):
                raise HTTPException(
                    status_code=400, detail=_postgrest_error_message(exc)
                ) from exc
            raise
        rows = response.data or []
        cash_usd, holding_rows = _extract_cash_from_rows(rows, portfolio_id=pid)
        return {"items": holding_rows, "cash_usd": cash_usd}

    @app.put("/api/portfolio")
    async def replace_portfolio(
        body: PortfolioReplacePayload = Body(...),
        portfolio_id: Optional[str] = Query(None),
    ):
        """Replace entire portfolio (holdings + cash) in one save.

        Uses delete-then-insert instead of upsert. Some Supabase RLS policies allow
        INSERT/DELETE for anon but reject UPSERT/UPDATE on existing rows (42501).
        """
        if PortfolioReplacePayload is None:  # pragma: no cover
            raise HTTPException(status_code=500, detail="pydantic is not installed")
        sb = require_supabase()
        pid = _effective_portfolio_id(body.portfolio_id, portfolio_id)

        # Load existing rows (preserve sector labels across rewrite when possible)
        q = sb.table(portfolio_table).select("*")
        if pid is not None:
            q = q.eq("portfolio_id", pid)
        try:
            existing = q.execute().data or []
        except Exception as exc:
            if PostgrestAPIError is not None and isinstance(exc, PostgrestAPIError):
                raise HTTPException(
                    status_code=400, detail=_postgrest_error_message(exc)
                ) from exc
            raise

        sector_by_sym = {
            _normalize_symbol(str(r.get("symbol", ""))): r.get("sector")
            for r in existing
            if r.get("symbol") and r.get("sector")
        }

        insert_rows: List[Dict[str, Any]] = []
        for h in body.holdings:
            sym = _normalize_symbol(h.symbol)
            if _is_cash_symbol(sym):
                continue
            row: Dict[str, Any] = {
                "symbol": sym,
                "shares": float(h.shares),
                "cost_basis": float(h.cost_basis),
            }
            if pid is not None:
                row["portfolio_id"] = pid
            if sector_by_sym.get(sym):
                row["sector"] = sector_by_sym[sym]
            insert_rows.append(row)

        if body.cash_usd > 0:
            cash_row: Dict[str, Any] = {
                "symbol": "CASH",
                "shares": float(body.cash_usd),
                "cost_basis": 0.0,
            }
            if pid is not None:
                cash_row["portfolio_id"] = pid
            insert_rows.append(cash_row)

        try:
            # Wipe current portfolio rows, then insert fresh (anon-safe under common RLS).
            dq = sb.table(portfolio_table).delete()
            if pid is not None:
                dq = dq.eq("portfolio_id", pid)
            else:
                # Without portfolio_id, only delete rows that will be replaced is unsafe;
                # require pid for full replace.
                raise HTTPException(
                    status_code=400,
                    detail="portfolio_id is required to save the full portfolio.",
                )
            dq.execute()

            if insert_rows:
                sb.table(portfolio_table).insert(insert_rows).execute()
        except HTTPException:
            raise
        except Exception as exc:
            if PostgrestAPIError is not None and isinstance(exc, PostgrestAPIError):
                raise HTTPException(
                    status_code=400, detail=_postgrest_error_message(exc)
                ) from exc
            raise

        # Return refreshed view
        q2 = sb.table(portfolio_table).select("*")
        if pid is not None:
            q2 = q2.eq("portfolio_id", pid)
        rows = q2.order("symbol").execute().data or []
        cash_usd, holding_rows = _extract_cash_from_rows(rows, portfolio_id=pid)
        return {"items": holding_rows, "cash_usd": cash_usd}

    @app.post("/api/portfolio")
    async def add_to_portfolio(
        body: PortfolioPayload = Body(...),
        portfolio_id: Optional[str] = Query(None),
    ):
        sb = require_supabase()
        symbol = _normalize_symbol(body.symbol)
        pid = _effective_portfolio_id(body.portfolio_id, portfolio_id)
        row: Dict[str, Any] = {
            "symbol": symbol,
            "shares": body.shares,
            "cost_basis": body.cost_basis,
        }
        if pid is not None:
            row["portfolio_id"] = pid
        try:
            # Prefer delete+insert over upsert: RLS often blocks UPDATE path on upsert.
            dq = sb.table(portfolio_table).delete().eq("symbol", symbol)
            if pid is not None:
                dq = dq.eq("portfolio_id", pid)
            dq.execute()
            response = sb.table(portfolio_table).insert(row).execute()
        except Exception as exc:
            if PostgrestAPIError is not None and isinstance(exc, PostgrestAPIError):
                raise HTTPException(
                    status_code=400, detail=_postgrest_error_message(exc)
                ) from exc
            raise
        return response.data

    @app.delete("/api/portfolio/{symbol}")
    async def remove_from_portfolio(
        symbol: str,
        portfolio_id: Optional[str] = Query(None),
    ):
        sb = require_supabase()
        sym = _normalize_symbol(symbol)
        pid = (
            _normalize_portfolio_id_value(portfolio_id)
            if portfolio_id is not None
            else _portfolio_id_from_env()
        )
        q = sb.table(portfolio_table).delete().eq("symbol", sym)
        if pid is not None:
            q = q.eq("portfolio_id", pid)
        try:
            q.execute()
        except Exception as exc:
            if PostgrestAPIError is not None and isinstance(exc, PostgrestAPIError):
                raise HTTPException(
                    status_code=400, detail=_postgrest_error_message(exc)
                ) from exc
            raise
        return {"status": "deleted"}

    @app.post("/api/analyze-portfolio")
    async def analyze_portfolio(
        portfolio_id: Optional[str] = Query(None),
        force_live: bool = Query(False),
    ):
        try:
            return run_portfolio_analysis(
                portfolio_id=portfolio_id, force_live=force_live
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.get("/api/snapshots")
    async def get_snapshots_meta():
        return snapshot_store_meta()

    @app.post("/api/snapshots/refresh")
    async def refresh_snapshots(
        portfolio_id: Optional[str] = Query(None),
        include_universe: bool = Query(False),
    ):
        sb = require_supabase()
        pid = (
            _normalize_portfolio_id_value(portfolio_id)
            if portfolio_id is not None
            else _portfolio_id_from_env()
        )
        q = sb.table(portfolio_table).select("symbol")
        if pid is not None:
            q = q.eq("portfolio_id", pid)
        rows = q.execute().data or []
        symbols = [
            _normalize_symbol(str(r["symbol"]))
            for r in rows
            if r.get("symbol") and not _is_cash_symbol(str(r["symbol"]))
        ]
        try:
            return refresh_market_snapshots(
                symbols, include_benchmarks=True, include_universe=include_universe
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return app


if (
    FastAPI is not None
    and HTTPException is not None
    and CORSMiddleware is not None
    and Body is not None
    and Query is not None
    and BaseModel is not object
    and Field is not None
    and field_validator is not None
    and PortfolioPayload is not None
    and PortfolioResponse is not None
):
    app = create_app()
else:  # pragma: no cover
    app = None


if __name__ == '__main__':
    import uvicorn  # type: ignore[import-untyped]

    uvicorn.run(create_app(), host="0.0.0.0", port=int(os.getenv("PORT", "8000")))