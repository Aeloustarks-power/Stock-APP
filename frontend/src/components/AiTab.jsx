import React from 'react';
import { pickField, t } from '../i18n.js';

function hasNote(note) {
  return Boolean(note && (note.crowding || note.catalyst || note.risk));
}

export default function AiTab({ lang, loading, note }) {
  if (loading && !hasNote(note)) {
    return <p className="empty">{t(lang, 'aiGenerating')}</p>;
  }

  if (!hasNote(note)) {
    return <p className="empty">{t(lang, 'aiEmpty')}</p>;
  }

  const blocks = [
    { key: 'crowding', labelKey: 'crowding' },
    { key: 'catalyst', labelKey: 'catalyst' },
    { key: 'risk', labelKey: 'risk' },
  ];

  return (
    <div className="ai-md">
      {loading ? (
        <p className="meta" style={{ marginBottom: 10 }}>
          {t(lang, 'aiUpdating')}
        </p>
      ) : null}
      <div className="idea-list">
        {blocks.map((block) => {
          const body = pickField(note, block.key, lang);
          if (!body) return null;
          return (
            <article key={block.key} className="idea-card">
              <div className="head">{t(lang, block.labelKey)}</div>
              <p>{body}</p>
            </article>
          );
        })}
      </div>
      <p className="meta" style={{ marginTop: 12 }}>
        {t(lang, 'notAdvice')}
      </p>
    </div>
  );
}
