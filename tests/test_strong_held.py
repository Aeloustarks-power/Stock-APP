"""Ideas may repeat a holding only when it is a strong, in-trend winner."""
from backend.ai import build_suggested_buys_prompt
from backend.service import _strong_held_candidates, is_strong_held_performer


def _pos(**overrides):
    base = {
        "symbol": "NVDA",
        "shares": 10,
        "cost_basis": 100,
        "current_price": 150,
        "ma20": 140,
        "total_cost": 1000,
        "pnl": 500,
        "weight_pct": 5.0,
        "high_52w_percentile": 0.7,
        "near_52w_high_pct": 0.08,
        "short_history": False,
    }
    base.update(overrides)
    return base


def test_up_40pct_and_above_ma20_qualifies():
    assert is_strong_held_performer(_pos(pnl=400, total_cost=1000)) is True


def test_gain_just_under_40pct_stays_out():
    assert is_strong_held_performer(_pos(pnl=399, total_cost=1000)) is False


def test_winner_below_ma20_stays_out():
    assert is_strong_held_performer(_pos(current_price=130, ma20=140)) is False


def test_winner_at_hard_cap_stays_out():
    assert is_strong_held_performer(_pos(weight_pct=12)) is False
    assert is_strong_held_performer(_pos(weight_pct=11.9)) is True


def test_missing_cost_uses_52w_range():
    row = _pos(total_cost=0, cost_basis=0, shares=0, pnl=0, high_52w_percentile=0.8)
    assert is_strong_held_performer(row) is True
    row["high_52w_percentile"] = 0.79
    assert is_strong_held_performer(row) is False


def test_short_history_and_cash_stay_out():
    assert is_strong_held_performer(_pos(short_history=True)) is False
    assert is_strong_held_performer(_pos(symbol="CASH")) is False


def test_candidates_keep_only_strong_names_best_gain_first():
    rows = _strong_held_candidates(
        [
            _pos(symbol="MSFT", pnl=400, total_cost=1000),
            _pos(symbol="AAPL", pnl=100, total_cost=1000),
            _pos(symbol="NVDA", pnl=800, total_cost=1000),
        ]
    )
    assert [r["symbol"] for r in rows] == ["NVDA", "MSFT"]
    assert rows[0]["already_held"] is True
    assert rows[0]["gain_vs_cost_pct"] == 80.0


def test_prompt_lets_a_strong_holding_be_ranked():
    prompt = build_suggested_buys_prompt(
        {
            "policy": {"totals": {}, "constraints": {}},
            "positions": [{"symbol": "NVDA", "weight_pct": 4}],
        },
        [
            {
                "symbol": "NVDA",
                "already_held": True,
                "gain_vs_cost_pct": 50,
                "weight_pct": 4,
                "score": 50,
                "drawdown_from_52w_high_pct": 2,
                "return_1y_pct": None,
            }
        ],
    )
    assert "already_held=yes, gain_vs_cost=50%" in prompt
    assert "You MAY rank it" in prompt
