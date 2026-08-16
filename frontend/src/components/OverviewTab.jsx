import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { money } from '../format.js';

const CHART_COLORS = ['#5D4037', '#8D6E63', '#A1887F', '#BCAAA4', '#6D4C41', '#3E2723', '#E8C547', '#827717'];

export default function OverviewTab({ loading, totals, warnings, sectorBreakdown }) {
  const sectorChartData = useMemo(
    () =>
      (sectorBreakdown || []).map((s) => ({
        name: s.sector || 'Unknown',
        value: Number(s.weight_pct || 0),
      })),
    [sectorBreakdown]
  );

  if (!totals && !loading) {
    return <p className="empty">Run Analyze to see totals and sector mix.</p>;
  }
  if (loading) {
    return <p className="empty">Crunching numbers with Gemini…</p>;
  }

  return (
    <>
      <div className="stats">
        <div className="stat">
          <span className="label">Market value</span>
          <span className="value">{money(totals.total_value)}</span>
        </div>
        <div className="stat">
          <span className="label">Invested</span>
          <span className="value">{money(totals.total_invested)}</span>
        </div>
        <div className="stat">
          <span className="label">Cash</span>
          <span className="value">
            {money(totals.cash_usd)} ({Number(totals.cash_pct ?? 0).toFixed(1)}%)
          </span>
        </div>
        <div className="stat">
          <span className="label">Unrealized P&amp;L</span>
          <span className="value">{money(totals.total_pnl)}</span>
        </div>
        <div className="stat">
          <span className="label">Total cost</span>
          <span className="value">{money(totals.total_cost)}</span>
        </div>
        <div className="stat">
          <span className="label">Deploy budget</span>
          <span className="value">{money(totals.deploy_budget_usd)}</span>
        </div>
      </div>
      {warnings.length > 0 && (
        <ul className="warn-list" style={{ color: 'var(--danger)', marginBottom: 12 }}>
          {warnings.map((warning, idx) => (
            <li key={`${warning}-${idx}`}>{warning}</li>
          ))}
        </ul>
      )}
      {sectorChartData.length > 0 && (
        <>
          <h3 className="section-title">Sector mix</h3>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sectorChartData} dataKey="value" nameKey="name" outerRadius={72} label>
                  {sectorChartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </>
  );
}
