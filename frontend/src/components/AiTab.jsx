import React from 'react';
import ReactMarkdown from 'react-markdown';

const markdownComponents = {
  h1: ({ children }) => <h2>{children}</h2>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  p: ({ children }) => <p>{children}</p>,
  li: ({ children }) => <li>{children}</li>,
  ul: ({ children }) => <ul>{children}</ul>,
  ol: ({ children }) => <ol>{children}</ol>,
};

function hasNote(note) {
  return Boolean(note && (note.crowding || note.catalyst || note.risk));
}

export default function AiTab({ loading, note, analysis }) {
  if (loading && !hasNote(note) && !analysis) {
    return (
      <p className="empty">
        Generating note… This can take up to a minute if the API was asleep.
      </p>
    );
  }
  if (!hasNote(note) && !analysis) {
    return <p className="empty">AI crowding, catalyst, and risk appear here after Analyze.</p>;
  }

  return (
    <div className="ai-md">
      {loading ? (
        <p className="meta" style={{ marginBottom: 10 }}>
          Updating… last note stays visible until Gemini finishes.
        </p>
      ) : null}
      {hasNote(note) ? (
        <div className="idea-list">
          {note.crowding ? (
            <article className="idea-card">
              <div className="head">Crowding</div>
              <p>{note.crowding}</p>
              {note.crowding_zh ? <p className="zh">{note.crowding_zh}</p> : null}
            </article>
          ) : null}
          {note.catalyst ? (
            <article className="idea-card">
              <div className="head">Catalyst</div>
              <p>{note.catalyst}</p>
              {note.catalyst_zh ? <p className="zh">{note.catalyst_zh}</p> : null}
            </article>
          ) : null}
          {note.risk ? (
            <article className="idea-card">
              <div className="head">Risk</div>
              <p>{note.risk}</p>
              {note.risk_zh ? <p className="zh">{note.risk_zh}</p> : null}
            </article>
          ) : null}
        </div>
      ) : (
        <ReactMarkdown components={markdownComponents}>{analysis}</ReactMarkdown>
      )}
      <p className="meta" style={{ marginTop: 12 }}>
        Not financial advice. New names stay on the Ideas tab.
      </p>
    </div>
  );
}
