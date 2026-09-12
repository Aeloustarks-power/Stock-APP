import React from 'react';
import { pickField, t } from '../i18n.js';
import { displayName } from '../tickerNames.js';

export default function IdeasTab({
  lang,
  chineseNames = {},
  loading,
  suggestedBuys,
  onMoreIdeas,
  moreLoading,
  webhook,
}) {
  let webhookNote = '';
  if (webhook && webhook.skipped) {
    webhookNote = t(lang, 'webhookOff');
  } else if (webhook && webhook.ok) {
    webhookNote = t(lang, 'webhookOk');
  } else if (webhook && webhook.ok === false) {
    webhookNote = t(lang, 'webhookFail', {
      err: webhook.error ? `: ${webhook.error}` : '',
    });
  }

  return (
    <>
      <div className="ideas-toolbar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onMoreIdeas}
          disabled={loading || moreLoading}
        >
          {moreLoading ? t(lang, 'findingIdeas') : t(lang, 'moreIdeas')}
        </button>
        <span className="meta">{t(lang, 'ideasHint')}</span>
      </div>
      {webhookNote ? <p className="meta">{webhookNote}</p> : null}
      {!loading && !moreLoading && suggestedBuys.length === 0 && (
        <p className="empty">{t(lang, 'ideasEmpty')}</p>
      )}
      {(loading || moreLoading) && suggestedBuys.length === 0 && (
        <p className="empty">{t(lang, 'ideasScreening')}</p>
      )}
      <div className="idea-list">
        {suggestedBuys.slice(0, 3).map((s) => {
          const name = displayName(s.symbol, lang, chineseNames);
          return (
            <article key={s.symbol} className="idea-card">
              <div className="head">
                <span className="ticker-stack">
                  <span>{s.symbol}</span>
                  {name ? <span className="ticker-name">{name}</span> : null}
                </span>
                <span>
                  {(Number(s.confidence || 0) * 100).toFixed(0)}%
                  {s.metrics?.price != null ? ` · $${s.metrics.price}` : ''}
                  {s.metrics?.rsi != null ? ` · RSI ${s.metrics.rsi}` : ''}
                </span>
              </div>
              <p>
                <strong>{t(lang, 'thesis')}:</strong> {pickField(s, 'thesis', lang) || '—'}
              </p>
              <p>
                <strong>{t(lang, 'fit')}:</strong> {pickField(s, 'fit', lang) || '—'}
              </p>
              <p>
                <strong>{t(lang, 'catalyst')}:</strong> {pickField(s, 'catalyst', lang) || '—'}
              </p>
              <p>
                <strong>{t(lang, 'risk')}:</strong> {pickField(s, 'risk', lang) || '—'}
              </p>
            </article>
          );
        })}
      </div>
    </>
  );
}
