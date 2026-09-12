import React, { useMemo } from 'react';
import { money } from '../format.js';
import { dipLabel, dipLevel, sectorLabel, t } from '../i18n.js';
import { displayName } from '../tickerNames.js';

function drawdownLine(bench, ticker, lang) {
  if (bench?.error) {
    return t(lang, 'priceMissing', { t: ticker });
  }
  const d6 = Number(bench?.drawdown_6m_pct || 0).toFixed(1);
  const d12 = Number(bench?.drawdown_12m_pct || 0).toFixed(1);
  return t(lang, 'drawdown', {
    t: ticker,
    dip: dipLabel(bench?.dip_level, lang),
    d6,
    d12,
  });
}

function StatRow({ lang, enKey, children }) {
  return (
    <div className="stat">
      <span className="label">
        <span className={lang === 'zh' ? 'zh-only' : 'en'}>{t(lang, enKey)}</span>
      </span>
      <span className="value">{children}</span>
    </div>
  );
}

function TickerStack({ symbol, lang, chineseNames }) {
  const ticker = String(symbol || '');
  const name = displayName(ticker, lang, chineseNames);
  if (!name || name === ticker) {
    return <span className="weight-sym">{ticker}</span>;
  }
  return (
    <span className="ticker-stack">
      <span className="weight-sym">{ticker}</span>
      <span className="ticker-name">{name}</span>
    </span>
  );
}

export default function OverviewTab({
  lang,
  chineseNames = {},
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
    return <p className="empty">{t(lang, 'overviewEmpty')}</p>;
  }
  if (loading && !totals) {
    return <p className="empty">{t(lang, 'overviewAnalyzing')}</p>;
  }

  const cashPct = Number(totals.cash_pct ?? 0);
  const floorPct = Number(cashFloorPct ?? 0.15) * 100;
  const underFloor = cashPct + 0.05 < floorPct;
  const qqq = dip?.qqq || {};
  const spy = dip?.spy || {};
  const bookLevel = dipLevel(dip?.combined);
  const deployUsd = Number(totals.deploy_budget_usd ?? 0);
  const maxBar = Math.max(12, ...mix.map((r) => Number(r.weight_pct || 0)));
  const pnl = Number(totals.total_pnl ?? 0);
  let cashExtra = '';
  if (underFloor && Number(totals.cash_needed_usd) > 0) {
    cashExtra = ` · ${t(lang, 'cashShort', { m: money(totals.cash_needed_usd) })}`;
  } else if (Number(totals.excess_cash_usd) > 0) {
    cashExtra = ` · ${t(lang, 'cashExcess', { m: money(totals.excess_cash_usd) })}`;
  }

  return (
    <>
      {loading ? (
        <p className="meta" style={{ marginBottom: 10 }}>
          {t(lang, 'overviewUpdating')}
        </p>
      ) : null}
      <div className="stats">
        <StatRow lang={lang} enKey="marketValue">
          {money(totals.total_value)}
        </StatRow>
        <StatRow lang={lang} enKey="cash">
          {money(totals.cash_usd)} ({cashPct.toFixed(1)}%)
        </StatRow>
        <StatRow lang={lang} enKey="paperPnl">
          {money(pnl)}
        </StatRow>
        <StatRow lang={lang} enKey="buyBudget">
          {money(deployUsd)}
        </StatRow>
      </div>
      <p className="stat-hint">{t(lang, pnl >= 0 ? 'paperPnlHintProfit' : 'paperPnlHintLoss')}</p>
      <p className="stat-hint">{t(lang, bookLevel === 0 ? 'buyBudgetL0' : 'buyBudgetDip')}</p>

      <h3 className="section-title">{t(lang, 'cashVsFloor')}</h3>
      <div className="floor-meter" title={`Floor ${floorPct.toFixed(0)}%`}>
        <div className="weight-track">
          <div
            className={`weight-fill${underFloor ? ' short' : ' cash'}`}
            style={{ width: `${Math.min(100, cashPct)}%` }}
          />
          <span className="floor-mark" style={{ left: `${Math.min(98, floorPct)}%` }} />
        </div>
        <p className="meta">
          {t(lang, 'cashFloorLine', { c: cashPct.toFixed(1), f: floorPct.toFixed(0) })}
          {cashExtra}
        </p>
      </div>

      <h3 className="section-title">{t(lang, 'marketDip')}</h3>
      <div className="dip-block">
        <p className="dip-line">{dipLabel(dip?.combined, lang)}</p>
        <p className="stat-hint">{t(lang, 'dipExplain')}</p>
        <p className="meta dip-benches">
          {drawdownLine(qqq, 'QQQ', lang)}
          <br />
          {drawdownLine(spy, 'SPY', lang)}
        </p>
      </div>

      {warnings.length > 0 && (
        <ul className="warn-list" style={{ color: 'var(--danger)', marginBottom: 12 }}>
          {warnings.map((warning, idx) => (
            <li key={`${warning}-${idx}`}>{warning}</li>
          ))}
        </ul>
      )}

      {mix.length > 0 && (
        <>
          <h3 className="section-title">{t(lang, 'concentration')}</h3>
          <div className="weight-bars">
            {mix.map((row) => {
              const w = Number(row.weight_pct || 0);
              const rowPnl = Number(row.pnl || 0);
              return (
                <div className="weight-row" key={row.symbol}>
                  <TickerStack symbol={row.symbol} lang={lang} chineseNames={chineseNames} />
                  <div className="weight-track">
                    <div
                      className={`weight-fill${row.isCash ? ' cash' : ''}`}
                      style={{ width: `${maxBar > 0 ? (w / maxBar) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="weight-pct">{w.toFixed(1)}%</span>
                  <span className={`weight-pnl${row.isCash ? '' : rowPnl >= 0 ? ' ok' : ' down'}`}>
                    {row.isCash ? '—' : money(rowPnl)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h3 className="section-title">{t(lang, 'sectors')}</h3>
      {sectors.known.length === 0 ? (
        <p className="meta">{t(lang, 'sectorsUnknownHint')}</p>
      ) : (
        <ul className="sector-list">
          {sectors.known.map((s) => (
            <li key={s.sector}>
              <span>{sectorLabel(s.sector, lang)}</span>
              <span>{Number(s.weight_pct || 0).toFixed(1)}%</span>
            </li>
          ))}
          {sectors.unknownPct >= 5 ? (
            <li className="meta">
              <span>{t(lang, 'unknown')}</span>
              <span>{sectors.unknownPct.toFixed(1)}%</span>
            </li>
          ) : null}
        </ul>
      )}
    </>
  );
}
