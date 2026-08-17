"""Supabase portfolio load/save, cash rows, and request/response payloads."""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from supabase import Client  # type: ignore[import-untyped]

try:
    from pydantic import BaseModel, Field, field_validator  # type: ignore
except Exception:  # pragma: no cover
    BaseModel = object  # type: ignore
    Field = None  # type: ignore
    field_validator = None  # type: ignore

try:
    from supabase import create_client  # type: ignore
except Exception:  # pragma: no cover
    create_client = None  # type: ignore


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


def _portfolio_sector_from_row(row: Dict[str, Any]) -> Optional[str]:
    raw = row.get("sector")
    if raw is None:
        return None
    s = str(raw).strip()
    return s if s else None


def _try_persist_portfolio_sector(
    sb: Any,
    portfolio_table: str,
    symbol: str,
    sector: str,
    *,
    portfolio_id: Optional[str] = None,
) -> None:
    """Write sector to Supabase when we learned it from the network (column must exist)."""
    from backend.service import _bool_env

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


def _create_supabase_client() -> Optional["Client"]:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        return None
    if create_client is None:  # pragma: no cover
        raise RuntimeError("supabase is not installed")
    return create_client(url, key)


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


__all__ = [
    "_extract_cash_from_rows",
    "_create_supabase_client",
    "_normalize_symbol",
    "_is_cash_symbol",
    "_normalize_portfolio_id_value",
    "_portfolio_id_from_env",
    "_row_matches_portfolio",
    "_portfolio_sector_from_row",
    "_try_persist_portfolio_sector",
    "_postgrest_error_message",
    "PortfolioPayload",
    "PortfolioReplacePayload",
    "PortfolioResponse",
]
