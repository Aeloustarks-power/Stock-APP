import React from 'react';

function hasNote(note) {
  return Boolean(note && (note.crowding || note.catalyst || note.risk));
}

export default function AiTab({ loading, note }) {
  if (loading && !hasNote(note)) {
    return (
      <p className="empty">
        Generating note… This can take up to a minute if the API was asleep.
        <span className="zh-inline"> 生成笔记中… API 休眠后可能要一分钟。</span>
      </p>
    );
  }

  if (!hasNote(note)) {
    return (
      <p className="empty">
        Crowding, catalyst, and risk for names you already hold appear here after Analyze.
        The old 9-line recap is gone — tap Analyze if this is empty.
        <span className="zh-block">
          Analyze 之后会显示已持仓的集中度、催化剂和风险。旧的 9 条摘要已去掉，若这里是空的请再点一次 Analyze。
        </span>
      </p>
    );
  }

  return (
    <div className="ai-md">
      {loading ? (
        <p className="meta" style={{ marginBottom: 10 }}>
          Updating… last note stays visible until Gemini finishes.
          <span className="zh-inline"> 更新中… 上次笔记会留到新结果出来。</span>
        </p>
      ) : null}
      <div className="idea-list">
        {note.crowding ? (
          <article className="idea-card">
            <div className="head">
              Crowding <span className="zh-title">集中度</span>
            </div>
            <p>{note.crowding}</p>
            {note.crowding_zh ? <p className="zh">{note.crowding_zh}</p> : null}
          </article>
        ) : null}
        {note.catalyst ? (
          <article className="idea-card">
            <div className="head">
              Catalyst <span className="zh-title">催化剂</span>
            </div>
            <p>{note.catalyst}</p>
            {note.catalyst_zh ? <p className="zh">{note.catalyst_zh}</p> : null}
          </article>
        ) : null}
        {note.risk ? (
          <article className="idea-card">
            <div className="head">
              Risk <span className="zh-title">风险</span>
            </div>
            <p>{note.risk}</p>
            {note.risk_zh ? <p className="zh">{note.risk_zh}</p> : null}
          </article>
        ) : null}
      </div>
      <p className="meta" style={{ marginTop: 12 }}>
        Not financial advice. New names stay on the Ideas tab.
        <span className="zh-inline"> 非投资建议。新股票在 Ideas。</span>
      </p>
    </div>
  );
}
