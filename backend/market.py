"""Yahoo quotes, RSI/MA, history cache, and file-backed market snapshots."""
from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:
    import yfinance as yf  # type: ignore
except Exception:  # pragma: no cover
    yf = None  # type: ignore


def _normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper().replace(".", "-")


_CASH_SYMBOLS: Tuple[str, ...] = ("CASH", "USD", "USD-CASH", "USDCASH")


def _is_cash_symbol(symbol: str) -> bool:
    return _normalize_symbol(symbol) in _CASH_SYMBOLS


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _project_root() -> str:
    """US Stock/ project root (parent of backend/)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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


def _snapshot_ttl_seconds() -> int:
    return int(os.getenv("SNAPSHOT_TTL_SECONDS", str(6 * 60 * 60)))


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
    ttl = _snapshot_ttl_seconds() if max_age_seconds is None else max_age_seconds
    if ttl > 0 and (time.time() - ts) > ttl:
        return None
    metrics = entry.get("metrics")
    return metrics if isinstance(metrics, dict) else None


def snapshot_price_map(store: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
    """Last known Yahoo prices from snapshots.json (no TTL). Empty after a fresh Render boot."""
    data = store if isinstance(store, dict) else _load_snapshot_store()
    symbols = data.get("symbols") or {}
    quotes: Dict[str, float] = {}
    if not isinstance(symbols, dict):
        return quotes
    for raw_sym, entry in symbols.items():
        if not isinstance(entry, dict):
            continue
        metrics = entry.get("metrics")
        blob = metrics if isinstance(metrics, dict) else entry
        px = _safe_float(blob.get("current_price"), 0.0)
        sym = _normalize_symbol(str(raw_sym))
        if sym and not _is_cash_symbol(sym) and px > 0:
            quotes[sym] = round(px, 2)
    return quotes


def snapshot_store_meta() -> Dict[str, Any]:
    store = _load_snapshot_store()
    symbols = store.get("symbols") or {}
    return {
        "updated_at": store.get("updated_at"),
        "symbol_count": len(symbols) if isinstance(symbols, dict) else 0,
        "ttl_seconds": _snapshot_ttl_seconds(),
        "quotes": snapshot_price_map(store),
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
        from backend.service import nasdaq100_universe

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
                "short_history": bool(metrics.get("short_history")),
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
        "quotes": snapshot_price_map(store),
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
                "short_history": bool(snap.get("short_history")),
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


def _calc_position_metrics(symbol: str, shares: float, cost_basis: float) -> Dict[str, Any]:
    sym = _normalize_symbol(symbol)
    if yf is None:  # pragma: no cover
        raise RuntimeError("yfinance is not installed")
    hist = yf.Ticker(sym).history(period="1y", auto_adjust=True)
    if "Close" not in hist:
        raise ValueError(f"{sym}: no price history.")
    close_series = hist["Close"].dropna()
    n = int(close_series.shape[0])
    if n < 1:
        raise ValueError(f"{sym}: not enough price history.")

    current = float(close_series.iloc[-1])
    # New listings (e.g. SKHY) often have a last close but <60 US sessions.
    # Keep last price; only skip 52-week take-profit until a fuller year exists.
    short_history = n < 60

    ma20 = 0.0
    if n >= 20:
        ma20 = float(close_series.rolling(window=20).mean().iloc[-1])

    rsi = 0.0
    if n >= 20:
        rsi_series = calculate_rsi(close_series).dropna()
        if not rsi_series.empty:
            rsi = float(rsi_series.iloc[-1])

    if short_history:
        pctile, near_high = 0.0, 1.0
    else:
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
        "short_history": short_history,
    }


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


__all__ = [
    "calculate_rsi",
    "_stock_quote_payload",
    "_calc_position_metrics",
    "_calc_position_metrics_cached",
    "refresh_market_snapshots",
    "get_symbol_snapshot",
    "snapshot_store_meta",
    "_download_history_cached",
    "_yfinance_sector_label",
]
