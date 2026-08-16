import React from 'react';

export default function IdeasTab({
  loading,
  suggestedBuys,
  onMoreIdeas,
  moreLoading,
}) {
  return (
    <>
      <div className="ideas-toolbar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onMoreIdeas}
          disabled={loading || moreLoading}
        >
          {moreLoading ? 'Finding ideas…' : 'More ideas'}
        </button>
        <span className="meta">
          Skips holdings and names already shown this visit. Catalyst + risk from Gemini.
        </span>
      </div>
      {!loading && !moreLoading && suggestedBuys.length === 0 && (
        <p className="empty">Tap More ideas (or Analyze) for portfolio-aware suggested buys.</p>
      )}
      {(loading || moreLoading) && suggestedBuys.length === 0 && (
        <p className="empty">Screening Nasdaq-100 then ranking with Gemini. Can take up to a minute.</p>
      )}
      <div className="idea-list">
        {suggestedBuys.slice(0, 3).map((s) => (
          <article key={s.symbol} className="idea-card">
            <div className="head">
              <span>{s.symbol}</span>
              <span>
                {(Number(s.confidence || 0) * 100).toFixed(0)}%
                {s.metrics?.price != null ? ` · $${s.metrics.price}` : ''}
                {s.metrics?.rsi != null ? ` · RSI ${s.metrics.rsi}` : ''}
              </span>
            </div>
            <p><strong>Thesis:</strong> {s.thesis || '—'}</p>
            {s.thesis_zh ? <p className="zh">{s.thesis_zh}</p> : null}
            <p><strong>Fit:</strong> {s.fit || '—'}</p>
            {s.fit_zh ? <p className="zh">{s.fit_zh}</p> : null}
            <p><strong>Catalyst:</strong> {s.catalyst || '—'}</p>
            {s.catalyst_zh ? <p className="zh">{s.catalyst_zh}</p> : null}
            <p><strong>Risk:</strong> {s.risk || '—'}</p>
            {s.risk_zh ? <p className="zh">{s.risk_zh}</p> : null}
          </article>
        ))}
      </div>
    </>
  );
}
