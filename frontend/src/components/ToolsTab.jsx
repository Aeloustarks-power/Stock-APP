import React from 'react';
import { t } from '../i18n.js';
import { displayName } from '../tickerNames.js';

export default function ToolsTab({
  lang,
  chineseNames = {},
  peekSymbol,
  onPeekSymbolChange,
  onPeek,
  quoteLoading,
  stockData,
  bulkText,
  onBulkTextChange,
  onApplyBulkPaste,
  editing,
}) {
  const ticker = stockData?.symbol || '';
  const mapped = displayName(ticker, lang, chineseNames);
  const displaySymbol = mapped || stockData?.shortName || ticker;
  const displayPrice = stockData?.price ?? stockData?.regularMarketPrice;
  const inferredAdvice =
    stockData?.advice ??
    (() => {
      const pct = stockData?.regularMarketChangePercent;
      if (typeof pct !== 'number') return 'N/A';
      const pctStr = `${pct.toFixed(2)}%`;
      return pct >= 0 ? `GAIN (${pctStr})` : `LOSS (${pctStr})`;
    })();
  const adviceOk =
    typeof stockData?.advice === 'string'
      ? stockData.advice.includes('BUY')
      : typeof stockData?.regularMarketChangePercent === 'number' &&
        stockData.regularMarketChangePercent >= 0;

  return (
    <div className="tools-stack">
      <div>
        <h3 className="section-title">{t(lang, 'quickQuote')}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input mono ticker-input"
            value={peekSymbol}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            lang="en"
            enterKeyHint="search"
            onChange={(e) => onPeekSymbolChange(e.target.value)}
            onBlur={(e) => {
              const next = e.currentTarget.value.trim().toUpperCase();
              if (next !== peekSymbol) onPeekSymbolChange(next);
            }}
            placeholder={t(lang, 'ticker')}
            style={{ width: 140 }}
          />
          <button type="button" className="btn btn-primary" onClick={onPeek}>
            {quoteLoading ? '…' : t(lang, 'peek')}
          </button>
        </div>
        {stockData && (
          <div className="quote-grid">
            <div>
              <div style={{ fontFamily: 'var(--font-brand)', fontWeight: 700 }}>
                {ticker ? `${ticker}${mapped ? ` · ${mapped}` : ''}` : displaySymbol}
              </div>
              <div className="quote-price">{displayPrice != null ? `$${displayPrice}` : '—'}</div>
              <div className={adviceOk ? 'advice-ok' : 'advice-warn'}>
                <strong>{t(lang, 'advice')}:</strong> {inferredAdvice}
              </div>
            </div>
            <div className="mono" style={{ fontSize: 13 }}>
              <div>MA20: ${stockData.ma20 ?? '—'}</div>
              <div>RSI: {stockData.rsi ?? '—'}</div>
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="section-title">{t(lang, 'bulkPaste')}</h3>
        <p className="empty" style={{ marginBottom: 8 }}>
          {editing ? (
            <>
              {t(lang, 'bulkLinesLike')} <span className="mono">AAPL,10,180.5</span>
            </>
          ) : (
            t(lang, 'bulkNeedEdit')
          )}
        </p>
        <textarea
          className="textarea"
          value={bulkText}
          onChange={(e) => onBulkTextChange(e.target.value)}
          placeholder={'AAPL,10,180.5\nMSFT,5,400'}
          rows={4}
          readOnly={!editing}
        />
        <button
          type="button"
          className="btn"
          style={{ marginTop: 8 }}
          onClick={onApplyBulkPaste}
          disabled={!editing}
        >
          {t(lang, 'applyPaste')}
        </button>
      </div>
    </div>
  );
}
