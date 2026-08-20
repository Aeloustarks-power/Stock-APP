import React from 'react';
import { money } from '../format.js';

const TYPE_COPY = {
  TRIM: {
    en: 'Trim — sell some',
    zh: '减仓 — 卖掉一部分',
  },
  RAISE_CASH: {
    en: 'Raise cash — sell to refill cash',
    zh: '卖出补现金',
  },
  TAKE_PROFIT_TRIM: {
    en: 'Take profit — sell some of a winner',
    zh: '止盈 — 卖掉一部分盈利股',
  },
  BUY_EXISTING: {
    en: 'Add — buy more of a name you already hold',
    zh: '加仓 — 买入已有股票',
  },
  BUY_NEW: {
    en: 'Buy new — a name you do not hold yet',
    zh: '买入新股票',
  },
};

const WHY_COPY = [
  {
    match: 'Dip level is L0',
    en: 'No dip (L0): Nasdaq/S&P are not down enough, so rules will not buy.',
    zh: '未回撤（L0）：纳指/标普没有明显下跌，规则现在不会买。',
  },
  {
    match: 'No hard-cap breaches and no take-profit',
    en: 'No holding is over the size cap, and none is both overweight and near a 52-week high.',
    zh: '没有个股超上限，也没有又偏重、又接近一年高点的股票需要止盈。',
  },
  {
    match: 'No eligible actions met minimum trade size',
    en: 'Possible trades were smaller than the $200 minimum, so none are listed.',
    zh: '可能的交易小于最低 $200，所以没有列出。',
  },
  {
    match: 'Only the highest-priority rule triggers',
    en: 'Only the top rule suggestions are shown (not every tiny tweak).',
    zh: '只列出最优先的规则建议（不是每一笔小调整）。',
  },
  {
    match: 'Cash floor shortfall remains',
    en: 'Even after these sales, cash may still sit under the floor.',
    zh: '按这些卖出做完，现金仍可能低于底线。',
  },
];

function humanWhy(line) {
  const raw = String(line || '').trim();
  const hit = WHY_COPY.find((row) => raw.includes(row.match));
  if (hit) return hit;
  return { en: raw, zh: '' };
}

function explainAction(a) {
  const usd = money(a.trade_usd);
  const target =
    a.target_weight_pct != null && Number.isFinite(Number(a.target_weight_pct))
      ? Number(a.target_weight_pct)
      : null;
  const sym = a.symbol || 'this name';

  switch (a.type) {
    case 'TRIM':
      return {
        en: `${sym} is too large a slice of this book. Sell about ${usd}${
          target != null ? ` to bring it toward ${target.toFixed(0)}%` : ''
        }.`,
        zh: `${sym} 在组合里占比过高。卖掉约 ${usd}${
          target != null ? `，把权重压到约 ${target.toFixed(0)}%` : ''
        }。`,
      };
    case 'RAISE_CASH':
      return {
        en: `Cash is below the floor. Sell about ${usd} of ${sym} to refill cash.`,
        zh: `现金低于底线。卖掉约 ${usd} 的 ${sym} 来补现金。`,
      };
    case 'TAKE_PROFIT_TRIM':
      return {
        en: `${sym} is overweight and near a 52-week high. Sell about ${usd} to lock some gain.`,
        zh: `${sym} 占比偏高且接近一年高点。卖掉约 ${usd}，落袋一部分利润。`,
      };
    case 'BUY_EXISTING':
      return {
        en: `${sym} is a small slice. On this dip, add about ${usd}.`,
        zh: `${sym} 占比偏低。这次回撤里加仓约 ${usd}。`,
      };
    case 'BUY_NEW':
      return {
        en: `There is extra cash and a market dip. Rules would put about ${usd} into ${sym}.`,
        zh: `有多余现金且大盘回撤。规则会拿出约 ${usd} 买 ${sym}。`,
      };
    default:
      return {
        en: a.reason || 'Rule suggestion.',
        zh: '规则建议。',
      };
  }
}

function shareLine(approx) {
  if (approx == null || !Number.isFinite(Number(approx))) return '';
  const n = Number(approx);
  return `About ${n} shares / 约 ${n} 股`;
}

export default function ActionsTab({ loading, ruleActions, whyNoActions }) {
  const actions = Array.isArray(ruleActions) ? ruleActions : [];
  const why = Array.isArray(whyNoActions) ? whyNoActions : [];

  const intro = (
    <p className="stat-hint">
      Rule suggestions after Analyze — the app does not place trades.
      <span className="zh-block">这些是 Analyze 之后的规则建议，应用不会自动下单。</span>
    </p>
  );

  if (actions.length === 0) {
    if (loading && why.length === 0) {
      return (
        <p className="empty">
          Analyzing…
          <span className="zh-inline"> 分析中…</span>
        </p>
      );
    }
    return (
      <>
        {loading ? (
          <p className="meta" style={{ marginBottom: 10 }}>
            Updating… last result stays visible until Analyze finishes.
            <span className="zh-inline"> 更新中… 上次结果会留到新分析完成。</span>
          </p>
        ) : null}
        {intro}
        <p className="empty">
          Nothing to trade right now.
          <span className="zh-inline"> 现在没有建议操作。</span>
        </p>
        {why.length > 0 ? (
          <ul className="why-list">
            {why.map((line, idx) => {
              const copy = humanWhy(line);
              return (
                <li key={`${line}-${idx}`}>
                  <span>{copy.en}</span>
                  {copy.zh ? <span className="zh-block">{copy.zh}</span> : null}
                </li>
              );
            })}
          </ul>
        ) : !loading ? (
          <p className="meta">
            Run Analyze to see whether the rules would sell, refill cash, or buy.
            <span className="zh-inline"> 点 Analyze 查看规则会不会减仓、补现金或买入。</span>
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      {loading ? (
        <p className="meta" style={{ marginBottom: 10 }}>
          Updating… last actions stay visible until Analyze finishes.
          <span className="zh-inline"> 更新中… 上次建议会留到新分析完成。</span>
        </p>
      ) : null}
      {intro}
      <ul className="action-list">
        {actions.map((a, idx) => {
          const type = TYPE_COPY[a.type] || { en: a.type, zh: a.type };
          const whyDo = explainAction(a);
          const shares = shareLine(a.approx_shares);
          return (
            <li key={`${a.type}-${a.symbol}-${idx}`} className="action-item">
              <div className="head">
                <span>{a.symbol}</span>
                <span>{money(a.trade_usd)}</span>
              </div>
              {shares ? (
                <p className="meta" style={{ marginTop: 4 }}>
                  {shares}
                </p>
              ) : null}
              <p className="action-verb">
                {type.en}
                <span className="zh-block">{type.zh}</span>
              </p>
              <p className="reason">{whyDo.en}</p>
              {whyDo.zh ? <p className="zh">{whyDo.zh}</p> : null}
            </li>
          );
        })}
      </ul>
      {why.length > 0 ? (
        <ul className="why-list" style={{ marginTop: 12 }}>
          {why.map((line, idx) => {
            const copy = humanWhy(line);
            return (
              <li key={`${line}-${idx}`}>
                <span>{copy.en}</span>
                {copy.zh ? <span className="zh-block">{copy.zh}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
