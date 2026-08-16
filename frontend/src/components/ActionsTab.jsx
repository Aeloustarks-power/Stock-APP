import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { money } from '../format.js';

export default function ActionsTab({ loading, ruleActions }) {
  const actionChartData = useMemo(
    () =>
      (ruleActions || []).map((a) => ({
        name: `${a.symbol}`,
        type: a.type,
        usd: Number(a.trade_usd || 0),
      })),
    [ruleActions]
  );

  if (!loading && ruleActions.length === 0) {
    return <p className="empty">No rule actions yet. Run Analyze.</p>;
  }
  if (ruleActions.length === 0) return null;

  return (
    <>
      <ul className="action-list">
        {ruleActions.map((a, idx) => (
          <li key={`${a.type}-${a.symbol}-${idx}`} className="action-item">
            <div className="head">
              <span>
                {a.symbol} · {a.type}
              </span>
              <span>
                {money(a.trade_usd)}
                {a.approx_shares != null ? ` · ~${a.approx_shares} sh` : ''}
              </span>
            </div>
            <div className="reason">{a.reason}</div>
          </li>
        ))}
      </ul>
      {actionChartData.length > 0 && (
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={actionChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d6cbc0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="usd" fill="#5D4037" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
