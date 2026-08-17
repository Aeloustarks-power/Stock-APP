import React from 'react';
import { money } from '../format.js';

const TYPE_LABEL = {
  TRIM: 'Trim',
  RAISE_CASH: 'Raise cash',
  TAKE_PROFIT_TRIM: 'Take profit',
  BUY_EXISTING: 'Add to holding',
  BUY_NEW: 'Buy new',
};

export default function ActionsTab({ loading, ruleActions, whyNoActions }) {
  const actions = Array.isArray(ruleActions) ? ruleActions : [];
  const why = Array.isArray(whyNoActions) ? whyNoActions : [];

  if (actions.length === 0) {
    if (loading && why.length === 0) {
      return <p className="empty">Analyzing…</p>;
    }
    return (
      <>
        {loading ? (
          <p className="meta" style={{ marginBottom: 10 }}>
            Updating… last result stays visible until Analyze finishes.
          </p>
        ) : null}
        <p className="empty">No rule trades right now.</p>
        {why.length > 0 ? (
          <ul className="why-list">
            {why.map((line, idx) => (
              <li key={`${line}-${idx}`}>{line}</li>
            ))}
          </ul>
        ) : !loading ? (
          <p className="meta">Run Analyze to see whether the policy would trim, raise cash, or buy.</p>
        ) : null}
      </>
    );
  }

  return (
    <>
      {loading ? (
        <p className="meta" style={{ marginBottom: 10 }}>
          Updating… last actions stay visible until Analyze finishes.
        </p>
      ) : null}
      <ul className="action-list">
        {actions.map((a, idx) => (
          <li key={`${a.type}-${a.symbol}-${idx}`} className="action-item">
            <div className="head">
              <span>
                {a.symbol} · {TYPE_LABEL[a.type] || a.type}
              </span>
              <span>
                {money(a.trade_usd)}
                {a.approx_shares != null ? ` · ~${a.approx_shares} sh` : ''}
              </span>
            </div>
            <div className="reason">{a.reason}</div>
            {a.rule_trigger ? <div className="meta">{a.rule_trigger}</div> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
