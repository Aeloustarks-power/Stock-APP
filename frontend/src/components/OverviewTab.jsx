import React, { useMemo } from 'react';
import { money } from '../format.js';

function dipCopy(level) {
  const n = Number(level || 0);
  if (n >= 3) {
    return { en: 'Deep dip (L3)', zh: '深回撤（L3）', level: 3 };
  }
  if (n >= 2) {
    return { en: 'Medium dip (L2)', zh: '中等回撤（L2）', level: 2 };
  }
  if (n >= 1) {
    return { en: 'Mild dip (L1)', zh: '小回撤（L1）', level: 1 };
  }
  return { en: 'No dip (L0)', zh: '未回撤（L0）', level: 0 };
}

function drawdownLine(bench, ticker) {
  if (bench?.error) {
    return `${ticker}: price data missing · 行情数据缺失`;
  }
  const d6 = Number(bench?.drawdown_6m_pct || 0);
  const d12 = Number(bench?.drawdown_12m_pct || 0);
  const dip = dipCopy(bench?.dip_level);
  return `${ticker}: ${dip.en} / ${dip.zh} · 6m ${d6.toFixed(1)}% / 12m ${d12.toFixed(1)}% off high · 距高点`;
}

function StatRow({ en, zh, children }) {
  return (
    <div className="stat">
      <span className="label">
        <span className="en">{en}</span>
        <span className="zh">{zh}</span>
      </span>
      <span className="value">{children}</span>
    </div>
  );
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
    return (
      <p className="empty">
        Run Analyze to see where the money sits.
        <span className="zh-inline"> 点 Analyze 查看资金分布。</span>
      </p>
    );
  }
  if (loading && !totals) {
    return (
      <p className="empty">
        Analyzing… First run after idle can take 30–60 seconds while Render and Gemini wake up.
        <span className="zh-inline"> 分析中… API 休眠后首次可能要 30–60 秒。</span>
      </p>
    );
  }

  const cashPct = Number(totals.cash_pct ?? 0);
  const floorPct = Number(cashFloorPct ?? 0.15) * 100;
  const underFloor = cashPct + 0.05 < floorPct;
  const qqq = dip?.qqq || {};
  const spy = dip?.spy || {};
  const bookDip = dipCopy(dip?.combined);
  const deployUsd = Number(totals.deploy_budget_usd ?? 0);
  const maxBar = Math.max(12, ...mix.map((r) => Number(r.weight_pct || 0)));
  const pnl = Number(totals.total_pnl ?? 0);
  const pnlWord = pnl >= 0 ? 'profit / 盈利' : 'loss / 亏损';

  return (
    <>
      {loading ? (
        <p className="meta" style={{ marginBottom: 10 }}>
          Updating… last result stays visible until the new Analyze finishes.
          <span className="zh-inline"> 更新中… 上次结果会留到新分析完成。</span>
        </p>
      ) : null}
      <div className="stats">
        <StatRow en="Market value" zh="市值">
          {money(totals.total_value)}
        </StatRow>
        <StatRow en="Cash" zh="现金">
          {money(totals.cash_usd)} ({cashPct.toFixed(1)}%)
        </StatRow>
        <StatRow en="Paper P&L" zh="账面盈亏">
          {money(pnl)}
        </StatRow>
        <StatRow en="Buy budget" zh="可加仓额度">
          {money(deployUsd)}
        </StatRow>
      </div>
      <p className="stat-hint">
        Paper P&amp;L is {pnlWord} if you sold every holding now, vs what you paid. It is not cash
        in the bank.
        <span className="zh-block">账面盈亏 = 现在卖掉全部持股，相对买入成本的赚或亏。还没卖，所以不是口袋里的现金。</span>
      </p>
      <p className="stat-hint">
        {bookDip.level === 0
          ? 'Buy budget is $0 on L0: Nasdaq/S&P are not down enough, so rules keep extra cash.'
          : 'Buy budget is how much extra cash (above the 15% floor) rules may spend on this dip.'}
        <span className="zh-block">
          {bookDip.level === 0
            ? 'L0 时可加仓额度为 $0：纳指/标普没有明显下跌，多余现金先留着。'
            : '可加仓额度 = 现金底线（15%）以上、政策允许在这次回撤里花掉的钱。'}
        </span>
      </p>

      <h3 className="section-title">
        Cash vs floor <span className="zh-title">现金 vs 底线</span>
      </h3>
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
          <span className="zh-inline">
            {' '}
            · 现金 {cashPct.toFixed(1)}% · 底线 {floorPct.toFixed(0)}%
            {underFloor && Number(totals.cash_needed_usd) > 0
              ? ` · 还差 ${money(totals.cash_needed_usd)}`
              : Number(totals.excess_cash_usd) > 0
                ? ` · 超出 ${money(totals.excess_cash_usd)}`
                : ''}
          </span>
        </p>
      </div>

      <h3 className="section-title">
        Market dip <span className="zh-title">大盘回撤</span>
      </h3>
      <div className="dip-block">
        <p className="dip-line">
          {bookDip.en} <span className="zh-inline">/ {bookDip.zh}</span>
        </p>
        <p className="stat-hint">
          L0–L3 is how far QQQ and SPY sit below recent highs. This book uses the worse of the two.
          Buys only start at L1.
          <span className="zh-block">
            L0–L3 看纳指 QQQ 和标普 SPY 距近期高点跌了多少，取更差的一边。L1 起政策才允许买。
          </span>
        </p>
        <p className="meta dip-benches">
          {drawdownLine(qqq, 'QQQ')}
          <br />
          {drawdownLine(spy, 'SPY')}
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
          <h3 className="section-title">
            Concentration <span className="zh-title">持仓集中度</span>
          </h3>
          <div className="weight-bars">
            {mix.map((row) => {
              const w = Number(row.weight_pct || 0);
              const rowPnl = Number(row.pnl || 0);
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
                  <span className={`weight-pnl${row.isCash ? '' : rowPnl >= 0 ? ' ok' : ' down'}`}>
                    {row.isCash ? '—' : money(rowPnl)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h3 className="section-title">
        Sectors <span className="zh-title">行业</span>
      </h3>
      {sectors.known.length === 0 ? (
        <p className="meta">
          Sector labels are mostly unknown from Yahoo — use concentration by ticker instead.
          <span className="zh-inline"> 雅虎行业标签大多未知，看上面的个股权重即可。</span>
        </p>
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
              <span>Unknown / 未知</span>
              <span>{sectors.unknownPct.toFixed(1)}%</span>
            </li>
          ) : null}
        </ul>
      )}
    </>
  );
}
