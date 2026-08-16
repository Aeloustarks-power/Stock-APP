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

export default function AiTab({ loading, analysis }) {
  if (loading) return <p className="empty">Generating summary…</p>;
  if (!analysis) return <p className="empty">AI narrative appears here after Analyze.</p>;
  return (
    <div className="ai-md">
      <ReactMarkdown components={markdownComponents}>{analysis}</ReactMarkdown>
    </div>
  );
}
