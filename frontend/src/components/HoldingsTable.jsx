import React from 'react';
import { Trash2 } from 'lucide-react';
import { money } from '../format.js';
import { t } from '../i18n.js';
import { chineseName, displayName } from '../tickerNames.js';

function lastPriceFor(symbol, lastQuotes) {
  const ticker = String(symbol || '').trim().toUpperCase();
  if (!ticker || ticker === 'CASH') return null;
  const px = Number(lastQuotes?.[ticker]);
  return Number.isFinite(px) && px > 0 ? px : null;
}

/**
 * Holdings list. Read-only until App turns on `editing` (avoids fat-finger edits on phones).
 */
export default function HoldingsTable({
  lang,
  rows,
  loading,
  editing,
  onUpdateRow,
  onRemoveRow,
  onRetry,
  onSaveChineseName,
  nameRev = 0,
  chineseNames = {},
  lastQuotes = {},
  loadError,
}) {
  const namedCount = rows.filter((r) => r.symbol.trim()).length;

  const handleRemove = (row) => {
    const label = row.symbol.trim() || t(lang, 'thisRow');
    if (window.confirm(t(lang, 'removeConfirm', { s: label }))) {
      onRemoveRow(row.id);
    }
  };

  return (
    <section className={`pane${editing ? ' pane-editing' : ''}`} aria-label={t(lang, 'holdings')}>
      <div className="pane-header">
        <h2>{t(lang, 'holdings')}</h2>
        <span className="meta">
          {loading ? t(lang, 'loading') : t(lang, 'namesCount', { n: namedCount })}
          {editing ? ` · ${t(lang, 'editing')}` : ''}
        </span>
      </div>
      {editing ? <p className="meta chinese-name-hint">{t(lang, 'chineseNameHint')}</p> : null}
      <div className="table-wrap">
        {loadError && !loading ? (
          <div className="empty" style={{ padding: 12 }}>
            <p>{loadError}</p>
            {onRetry && (
              <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={onRetry}>
                {t(lang, 'retry')}
              </button>
            )}
          </div>
        ) : loading ? (
          <p className="empty" style={{ padding: 12 }}>
            {t(lang, 'loadingHoldings')}
          </p>
        ) : (
          <table className="holdings-table">
            <thead>
              <tr>
                <th className="col-symbol">{t(lang, 'symbol')}</th>
                <th className="col-shares">{t(lang, 'shares')}</th>
                <th className="col-cost">{t(lang, 'costShare')}</th>
                <th className="col-price">{t(lang, 'lastPrice')}</th>
                {editing ? <th className="col-actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const name = displayName(row.symbol, lang, chineseNames);
                const lastPx = lastPriceFor(row.symbol, lastQuotes);
                return (
                  <tr key={row.id}>
                    <td className="col-symbol">
                      <input
                        className="mono ticker-input"
                        value={row.symbol}
                        readOnly={!editing}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck={false}
                        lang="en"
                        enterKeyHint={editing ? 'next' : undefined}
                        onChange={(e) => onUpdateRow(row.id, 'symbol', e.target.value)}
                        onBlur={(e) => {
                          const next = e.currentTarget.value.trim().toUpperCase();
                          if (next !== row.symbol) onUpdateRow(row.id, 'symbol', next);
                        }}
                        placeholder="AAPL"
                      />
                      {editing && row.symbol.trim() ? (
                        <input
                          key={`${row.id}-${row.symbol}-${nameRev}`}
                          className="chinese-name-input"
                          defaultValue={chineseName(row.symbol, chineseNames)}
                          placeholder={t(lang, 'chineseName')}
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                          lang="zh"
                          onBlur={(e) => onSaveChineseName?.(row.symbol, e.currentTarget.value)}
                        />
                      ) : name ? (
                        <div className="ticker-name">{name}</div>
                      ) : null}
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
                    <td className="col-price">
                      <span className="mono last-price">{lastPx != null ? money(lastPx) : '—'}</span>
                    </td>
                    {editing ? (
                      <td className="col-actions">
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => handleRemove(row)}
                          aria-label={t(lang, 'removeRow', { s: row.symbol || t(lang, 'thisRow') })}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
