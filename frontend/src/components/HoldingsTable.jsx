import React from 'react';
import { Trash2 } from 'lucide-react';

/**
 * Holdings editor only. App.jsx still owns the rows and save/analyze.
 * This file draws the table and calls back when a cell or delete is used.
 */
export default function HoldingsTable({ rows, loading, onUpdateRow, onRemoveRow }) {
  const namedCount = rows.filter((r) => r.symbol.trim()).length;

  return (
    <section className="pane" aria-label="Holdings">
      <div className="pane-header">
        <h2>Holdings</h2>
        <span className="meta">{loading ? 'Loading…' : `${namedCount} names`}</span>
      </div>
      <div className="table-wrap">
        {loading ? (
          <p className="empty" style={{ padding: 12 }}>Loading…</p>
        ) : (
          <table className="holdings-table">
            <thead>
              <tr>
                <th className="col-symbol">Symbol</th>
                <th className="col-shares">Shares</th>
                <th className="col-cost">Cost / share</th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="col-symbol">
                    <input
                      className="mono"
                      value={row.symbol}
                      onChange={(e) => onUpdateRow(row.id, 'symbol', e.target.value)}
                      placeholder="AAPL"
                    />
                  </td>
                  <td className="col-shares">
                    <input
                      className="mono"
                      type="number"
                      min="0"
                      step="any"
                      value={row.shares}
                      onChange={(e) => onUpdateRow(row.id, 'shares', e.target.value)}
                    />
                  </td>
                  <td className="col-cost">
                    <input
                      className="mono"
                      type="number"
                      min="0"
                      step="any"
                      value={row.cost_basis}
                      onChange={(e) => onUpdateRow(row.id, 'cost_basis', e.target.value)}
                    />
                  </td>
                  <td className="col-actions">
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => onRemoveRow(row.id)}
                      aria-label="Remove row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
