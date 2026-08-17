import React, { useMemo } from 'react';
import { money } from '../format.js';

function dipLabel(level) {
  const n = Number(level || 0);
  if (n >= 3) return 'L3 deep';
  if (n >= 2) return 'L2';
  if (n >= 1) return 'L1 mild';
  return 'L0 none';
}

export default function OverviewTab({
  loading,
  totals,
  warnings,
  sectorBreakdown,
  holdingsMix,
  dip,
  cashFloorPct,
}) {
  const mix = useMemo(() => {
    const rows = Array.isArray(holdingsMix) ? [...holdingsMix] : [];
    rows.sort((a, b) => Number(b.weight_pct || 0) - Number(a.weight_pct || 0));
    return rows.slice(0, 8);
  }, [holdingsMix]);

  const sectors = useMemo(() => {
    const rows = Array.isArray(sectorBreakdown) ? sectorBreakdown : [];
    const known = rows.filter((s) => s.sector && s.sector !== 'Unknown');
    const unknownPct = rows
      .filter((s) => !s.sector || s.sector === 'Unknown')
      .reduce((sum, s) => sum + Number(s.weight_pct || 0), 0);
    return { known: known.slice(0, 6), unknownPct };
  }, [sectorBreakdown]);

  if (!totals && !loading) {
    return <p className="empty">Run Analyze to see where the money sits.</p>;
  }
  if (loading && !totals) {
    return (
      <p className="empty">
        Analyzing… First run after idle can take 30–60 seconds while Render and Gemini wake up.
      </p>
    );
  }

  const cashPct = Number(totals.cash_pct ?? 0);
  const floorPct = Number(cashFloorPct ?? 0.15) * 100;
  const underFloor = cashPct + 0.05 < floorPct;
  const qqq = dip?.qqq || {};
  const spy = dip?.spy || {};
  const maxBar = Math.max(12, ...mix.map((r) => Number(r.weight_pct || 0)));

  return (
    <>
      {loading ? (
        <p className="meta" style={{ marginBottom: 10 }}>
          Updating… last result stays visible until the new Analyze finishes.
        </p>
      ) : null}
      <div className="stats">
        <div className="stat">
          <span className="label">Market value</span>
          <span className="value">{money(totals.total_value)}</span>
        </div>
        <div className="stat">
          <span className="label">Cash</span>
          <span className="value">
            {money(totals.cash_usd)} ({cashPct.toFixed(1)}%)
          </span>
        </div>
        <div className="stat">
          <span className="label">Unrealized P&amp;L</span>
          <span className="value">{money(totals.total_pnl)}</span>
        </div>
        <div className="stat">
          <span className="label">Deploy budget</span>
          <span className="value">{money(totals.deploy_budget_usd)}</span>
        </div>
      </div>

      <h3 className="section-title">Cash vs floor</h3>
      <div className="floor-meter" title={`Floor ${floorPct.toFixed(0)}%`}>
        <div className="weight-track">
          <div
            className={`weight-fill${underFloor ? ' short' : ' cash'}`}
            style={{ width: `${Math.min(100, cashPct)}%` }}
          />
          <span className="floor-mark" style={{ left: `${Math.min(98, floorPct)}%` }} />
        </div>
        <p className="meta">
          {cashPct.toFixed(1)}% cash · floor {floorPct.toFixed(0)}%
          {underFloor && Number(totals.cash_needed_usd) > 0
            ? ` · short ${money(totals.cash_needed_usd)}`
            : Number(totals.excess_cash_usd) > 0
              ? ` · excess ${money(totals.excess_cash_usd)}`
              : ''}
        </p>
      </div>

      <h3 className="section-title">Market dip</h3>
      <p className="dip-line">
        Book {dipLabel(dip?.combined)}
        <span className="meta">
          {' '}
          · QQQ {dipLabel(qqq.dip_level)} (6m {Number(qqq.drawdown_6m_pct || 0).toFixed(1)}% / 12m{' '}
          {Number(qqq.drawdown_12m_pct || 0).toFixed(1)}%)
          {' '}
          · SPY {dipLabel(spy.dip_level)} (6m {Number(spy.drawdown_6m_pct || 0).toFixed(1)}% / 12m{' '}
          {Number(spy.drawdown_12m_pct || 0).toFixed(1)}%)
        </span>
      </p>

      {warnings.length > 0 && (
        <ul className="warn-list" style={{ color: 'var(--danger)', marginBottom: 12 }}>
          {warnings.map((warning, idx) => (
            <li key={`${warning}-${idx}`}>{warning}</li>
          ))}
        </ul>
      )}

      {mix.length > 0 && (
        <>
          <h3 className="section-title">Concentration</h3>
          <div className="weight-bars">
            {mix.map((row) => {
              const w = Number(row.weight_pct || 0);
              const pnl = Number(row.pnl || 0);
              return (
                <div className="weight-row" key={row.symbol}>
                  <span className="weight-sym">{row.symbol}</span>
                  <div className="weight-track">
                    <div
                      className={`weight-fill${row.isCash ? ' cash' : ''}`}
                      style={{ width: `${maxBar > 0 ? (w / maxBar) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="weight-pct">{w.toFixed(1)}%</span>
                  <span className={`weight-pnl${row.isCash ? '' : pnl >= 0 ? ' ok' : ' down'}`}>
                    {row.isCash ? '—' : money(pnl)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h3 className="section-title">Sectors</h3>
      {sectors.known.length === 0 ? (
        <p className="meta">Sector labels are mostly unknown from Yahoo — use concentration by ticker instead.</p>
      ) : (
        <ul className="sector-list">
          {sectors.known.map((s) => (
            <li key={s.sector}>
              <span>{s.sector}</span>
              <span>{Number(s.weight_pct || 0).toFixed(1)}%</span>
            </li>
          ))}
          {sectors.unknownPct >= 5 ? (
            <li className="meta">
              <span>Unknown</span>
              <span>{sectors.unknownPct.toFixed(1)}%</span>
            </li>
          ) : null}
        </ul>
      )}
    </>
  );
}
