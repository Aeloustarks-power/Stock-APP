import React from 'react';

export default function IdeasTab({ loading, suggestedBuys }) {
  return (
    <>
      {!loading && suggestedBuys.length === 0 && (
        <p className="empty">Run Analyze for portfolio-aware suggested buys (screen → AI rank).</p>
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
