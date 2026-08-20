import React from 'react';
import { Trash2 } from 'lucide-react';

/**
 * Holdings list. Read-only until App turns on `editing` (avoids fat-finger edits on phones).
 */
export default function HoldingsTable({
  rows,
  loading,
  editing,
  onUpdateRow,
  onRemoveRow,
  onRetry,
  loadError,
}) {
  const namedCount = rows.filter((r) => r.symbol.trim()).length;

  const handleRemove = (row) => {
    const label = row.symbol.trim() || 'this row';
    if (window.confirm(`Remove ${label}? It is not saved until you tap Save all.`)) {
      onRemoveRow(row.id);
    }
  };

  return (
    <section className={`pane${editing ? ' pane-editing' : ''}`} aria-label="Holdings">
      <div className="pane-header">
        <h2>Holdings</h2>
        <span className="meta">
          {loading ? 'Loading…' : `${namedCount} names`}
          {editing ? ' · editing' : ''}
        </span>
      </div>
      <div className="table-wrap">
        {loadError && !loading ? (
          <div className="empty" style={{ padding: 12 }}>
            <p>{loadError}</p>
            {onRetry && (
              <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        ) : loading ? (
          <p className="empty" style={{ padding: 12 }}>
            Loading holdings… If this is the first visit after a while, the API may be waking (up to a minute).
          </p>
        ) : (
          <table className="holdings-table">
            <thead>
              <tr>
                <th className="col-symbol">Symbol</th>
                <th className="col-shares">Shares</th>
                <th className="col-cost">Cost / share</th>
                {editing ? <th className="col-actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="col-symbol">
                    <input
                      className="mono"
                      value={row.symbol}
                      readOnly={!editing}
                      onChange={(e) => onUpdateRow(row.id, 'symbol', e.target.value)}
                      placeholder="AAPL"
                    />
                  </td>
                  <td className="col-shares">
                    <input
                      className="mono"
                      type={editing ? 'number' : 'text'}
                      inputMode={editing ? 'decimal' : undefined}
                      min="0"
                      step="any"
                      value={row.shares}
                      readOnly={!editing}
                      onChange={(e) => onUpdateRow(row.id, 'shares', e.target.value)}
                    />
                  </td>
                  <td className="col-cost">
                    <input
                      className="mono"
                      type={editing ? 'number' : 'text'}
                      inputMode={editing ? 'decimal' : undefined}
                      min="0"
                      step="any"
                      value={row.cost_basis}
                      readOnly={!editing}
                      onChange={(e) => onUpdateRow(row.id, 'cost_basis', e.target.value)}
                    />
                  </td>
                  {editing ? (
                    <td className="col-actions">
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleRemove(row)}
                        aria-label={`Remove ${row.symbol || 'row'}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
