import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, ShieldAlert, Plus, Trash2, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';
const PROFILES = [
  { id: 'Eric', label: 'Eric' },
  { id: 'Vivien', label: 'Vivien' },
];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'actions', label: 'Actions' },
  { id: 'ideas', label: 'Ideas' },
  { id: 'ai', label: 'AI' },
  { id: 'tools', label: 'Tools' },
];

const CHART_COLORS = ['#5D4037', '#8D6E63', '#A1887F', '#BCAAA4', '#6D4C41', '#3E2723', '#E8C547', '#827717'];

function formatApiErrorDetail(detail) {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item == null) return '';
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && 'msg' in item) {
          const loc = Array.isArray(item.loc) ? item.loc.filter((x) => x !== 'body').join('.') : '';
          return loc ? `${loc}: ${item.msg}` : String(item.msg);
        }
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join('; ');
  }
  if (typeof detail === 'object') {
    if ('msg' in detail) return String(detail.msg);
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
}

function emptyRow() {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, symbol: '', shares: '', cost_basis: '' };
}

function parseBulkPaste(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('symbol') || lower.startsWith('ticker')) continue;
    const parts = line.split(/[\t,]+/).map((p) => p.trim());
    if (parts.length < 2) continue;
    const symbol = parts[0].toUpperCase().replace(/\./g, '-');
    const shares = Number(parts[1]);
    const cost_basis = parts.length >= 3 ? Number(parts[2]) : 0;
    if (!symbol || !Number.isFinite(shares) || shares <= 0) continue;
    if (!Number.isFinite(cost_basis) || cost_basis < 0) continue;
    rows.push({
      id: `${Date.now()}-${symbol}-${Math.random().toString(16).slice(2)}`,
      symbol,
      shares: String(shares),
      cost_basis: String(cost_basis),
    });
  }
  return rows;
}

function money(n) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function App() {
  const [selectedPortfolio, setSelectedPortfolio] = useState(PROFILES[0].id);
  const [activeTab, setActiveTab] = useState('overview');
  const [rows, setRows] = useState([emptyRow()]);
  const [cashUsd, setCashUsd] = useState('0');
  const [bulkText, setBulkText] = useState('');
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState(null);
  const [portfolioSaving, setPortfolioSaving] = useState(false);
  const [error, setError] = useState(null);

  const [peekSymbol, setPeekSymbol] = useState('');
  const [stockData, setStockData] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiTotals, setAiTotals] = useState(null);
  const [aiWarnings, setAiWarnings] = useState([]);
  const [ruleActions, setRuleActions] = useState([]);
  const [suggestedBuys, setSuggestedBuys] = useState([]);
  const [sectorBreakdown, setSectorBreakdown] = useState([]);
  const [snapshotMeta, setSnapshotMeta] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [refreshingSnapshots, setRefreshingSnapshots] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    setPortfolioError(null);
    try {
      const response = await fetch(
        `${API_BASE}/api/portfolio?portfolio_id=${encodeURIComponent(selectedPortfolio)}`
      );
      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(formatApiErrorDetail(errPayload?.detail) || 'Unable to load portfolio');
      }
      const data = await response.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      setCashUsd(String(data?.cash_usd ?? 0));
      setRows(
        items.length
          ? items.map((item) => ({
              id: `${item.symbol}-${Math.random().toString(16).slice(2)}`,
              symbol: String(item.symbol || '').toUpperCase(),
              shares: String(item.shares ?? ''),
              cost_basis: String(item.cost_basis ?? ''),
            }))
          : [emptyRow()]
      );
    } catch (err) {
      setPortfolioError(err.message);
    } finally {
      setPortfolioLoading(false);
    }
  }, [selectedPortfolio]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const updateRow = (id, field, value) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, [field]: value };
        if (field === 'symbol') next.symbol = String(value).toUpperCase();
        return next;
      })
    );
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (id) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [emptyRow()];
    });
  };

  const applyBulkPaste = () => {
    const parsed = parseBulkPaste(bulkText);
    if (!parsed.length) {
      setError('Bulk paste needs lines like AAPL,10,180.5');
      return;
    }
    setError(null);
    setRows((prev) => {
      const bySym = new Map();
      for (const r of prev) {
        if (r.symbol.trim()) bySym.set(r.symbol.trim().toUpperCase(), r);
      }
      for (const r of parsed) bySym.set(r.symbol, r);
      return Array.from(bySym.values());
    });
    setBulkText('');
    setActiveTab('overview');
  };

  const handleSaveAll = async () => {
    const holdings = [];
    for (const row of rows) {
      const symbol = row.symbol.trim().toUpperCase();
      if (!symbol) continue;
      const shares = Number(row.shares);
      const cost_basis = Number(row.cost_basis);
      if (!Number.isFinite(shares) || shares <= 0) {
        setError(`${symbol}: shares must be a positive number`);
        return;
      }
      if (!Number.isFinite(cost_basis) || cost_basis < 0) {
        setError(`${symbol}: cost basis must be >= 0`);
        return;
      }
      holdings.push({ symbol, shares, cost_basis });
    }
    const cash = Number(cashUsd);
    if (!Number.isFinite(cash) || cash < 0) {
      setError('Cash must be zero or a positive number');
      return;
    }

    setPortfolioSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/api/portfolio?portfolio_id=${encodeURIComponent(selectedPortfolio)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portfolio_id: selectedPortfolio,
            cash_usd: cash,
            holdings,
          }),
        }
      );
      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(formatApiErrorDetail(errPayload?.detail) || 'Failed to save portfolio');
      }
      const data = await response.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      setCashUsd(String(data?.cash_usd ?? cash));
      setRows(
        items.length
          ? items.map((item) => ({
              id: `${item.symbol}-${Math.random().toString(16).slice(2)}`,
              symbol: String(item.symbol || '').toUpperCase(),
              shares: String(item.shares ?? ''),
              cost_basis: String(item.cost_basis ?? ''),
            }))
          : [emptyRow()]
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setPortfolioSaving(false);
    }
  };

  const fetchStockData = async (overrideSymbol) => {
    const resolvedSymbol = (overrideSymbol ?? peekSymbol).trim();
    if (!resolvedSymbol) return;
    setQuoteLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/stock/${resolvedSymbol.toUpperCase()}`);
      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
          const err = await response.json();
          message = formatApiErrorDetail(err?.detail) || err?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      setStockData(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleAnalyzePortfolio = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiAnalysis(null);
    setAiWarnings([]);
    setAiTotals(null);
    setRuleActions([]);
    setSuggestedBuys([]);
    setSectorBreakdown([]);
    setActiveTab('overview');
    try {
      const response = await fetch(
        `${API_BASE}/api/analyze-portfolio?portfolio_id=${encodeURIComponent(selectedPortfolio)}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(formatApiErrorDetail(errPayload?.detail) || 'Failed to analyze portfolio');
      }
      const data = await response.json();
      const report = data?.policy_report || {};
      setAiAnalysis(data?.ai_summary ?? 'No response from AI');
      setAiWarnings(
        Array.isArray(data?.warnings)
          ? data.warnings
          : Array.isArray(report?.warnings)
            ? report.warnings
            : []
      );
      setAiTotals(data?.totals ?? report?.policy?.totals ?? null);
      setRuleActions(
        Array.isArray(data?.rule_actions)
          ? data.rule_actions
          : Array.isArray(report?.policy?.recommended_actions)
            ? report.policy.recommended_actions
            : []
      );
      setSuggestedBuys(Array.isArray(data?.suggested_buys) ? data.suggested_buys : []);
      setSectorBreakdown(
        Array.isArray(data?.sector_breakdown)
          ? data.sector_breakdown
          : Array.isArray(report?.sector_breakdown)
            ? report.sector_breakdown
            : []
      );
      setSnapshotMeta(data?.snapshot_meta ?? report?.snapshot_meta ?? null);
      setAiError(data?.ai_error || data?.suggest_error || null);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleRefreshSnapshots = async () => {
    setRefreshingSnapshots(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/api/snapshots/refresh?portfolio_id=${encodeURIComponent(selectedPortfolio)}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(formatApiErrorDetail(errPayload?.detail) || 'Snapshot refresh failed');
      }
      const data = await response.json();
      setSnapshotMeta({
        updated_at: data.updated_at,
        symbol_count: data.symbol_count,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshingSnapshots(false);
    }
  };

  const sectorChartData = useMemo(
    () =>
      (sectorBreakdown || []).map((s) => ({
        name: s.sector || 'Unknown',
        value: Number(s.weight_pct || 0),
      })),
    [sectorBreakdown]
  );

  const actionChartData = useMemo(
    () =>
      (ruleActions || []).map((a) => ({
        name: `${a.symbol}`,
        type: a.type,
        usd: Number(a.trade_usd || 0),
      })),
    [ruleActions]
  );

  const displaySymbol = stockData?.shortName ?? stockData?.symbol ?? '';
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

  const markdownComponents = {
    h1: ({ children }) => <h2>{children}</h2>,
    h2: ({ children }) => <h3>{children}</h3>,
    h3: ({ children }) => <h4>{children}</h4>,
    p: ({ children }) => <p>{children}</p>,
    li: ({ children }) => <li>{children}</li>,
    ul: ({ children }) => <ul>{children}</ul>,
    ol: ({ children }) => <ol>{children}</ol>,
  };

  const banner = error || portfolioError || aiError;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <BarChart3 size={26} color="#1c1917" />
          <h1>US Stock Sentinel</h1>
        </div>

        <div className="topbar-controls">
          <div className="field">
            <label htmlFor="portfolio">Portfolio</label>
            <select
              id="portfolio"
              value={selectedPortfolio}
              onChange={(e) => setSelectedPortfolio(e.target.value)}
            >
              {PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="cash">Cash</label>
            <input
              id="cash"
              className="mono"
              type="number"
              min="0"
              step="any"
              value={cashUsd}
              onChange={(e) => setCashUsd(e.target.value)}
              style={{ width: 110 }}
            />
          </div>

          {snapshotMeta?.updated_at && (
            <span className="meta" title="Market snapshot time">
              {snapshotMeta.updated_at}
              {snapshotMeta.symbol_count != null ? ` · ${snapshotMeta.symbol_count}` : ''}
            </span>
          )}

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleRefreshSnapshots}
            disabled={refreshingSnapshots}
          >
            <RefreshCw size={14} />
            {refreshingSnapshots ? '…' : 'Refresh'}
          </button>

          <button
            type="button"
            className="btn"
            onClick={addRow}
          >
            <Plus size={14} /> Row
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveAll}
            disabled={portfolioSaving || portfolioLoading}
          >
            {portfolioSaving ? 'Saving…' : 'Save all'}
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAnalyzePortfolio}
            disabled={aiLoading || portfolioLoading}
          >
            {aiLoading ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      </header>

      {banner && (
        <div className="banner" role="alert">
          <ShieldAlert size={16} />
          <span>{banner}</span>
        </div>
      )}

      <div className="workspace">
        <section className="pane" aria-label="Holdings">
          <div className="pane-header">
            <h2>Holdings</h2>
            <span className="meta">{portfolioLoading ? 'Loading…' : `${rows.filter((r) => r.symbol.trim()).length} names`}</span>
          </div>
          <div className="table-wrap">
            {portfolioLoading ? (
              <p className="empty" style={{ padding: 12 }}>Loading…</p>
            ) : (
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th className="col-symbol">Symbol</th>
                    <th className="col-shares">Shares</th>
                    <th className="col-cost">Cost / share</th>
                    <th className="col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="col-symbol">
                        <input
                          className="mono"
                          value={row.symbol}
                          onChange={(e) => updateRow(row.id, 'symbol', e.target.value)}
                          placeholder="AAPL"
                        />
                      </td>
                      <td className="col-shares">
                        <input
                          className="mono"
                          type="number"
                          min="0"
                          step="any"
                          value={row.shares}
                          onChange={(e) => updateRow(row.id, 'shares', e.target.value)}
                        />
                      </td>
                      <td className="col-cost">
                        <input
                          className="mono"
                          type="number"
                          min="0"
                          step="any"
                          value={row.cost_basis}
                          onChange={(e) => updateRow(row.id, 'cost_basis', e.target.value)}
                        />
                      </td>
                      <td className="col-actions">
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => removeRow(row.id)}
                          aria-label="Remove row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="pane" aria-label="Analysis">
          <div className="pane-header">
            <div className="tabs" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`tab${activeTab === tab.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="tab-body" role="tabpanel">
            {activeTab === 'overview' && (
              <>
                {!aiTotals && !aiLoading && (
                  <p className="empty">Run Analyze to see totals and sector mix.</p>
                )}
                {aiLoading && <p className="empty">Crunching numbers with Gemini 3.1 Pro…</p>}
                {aiTotals && (
                  <>
                    <div className="stats">
                      <div className="stat">
                        <span className="label">Market value</span>
                        <span className="value">{money(aiTotals.total_value)}</span>
                      </div>
                      <div className="stat">
                        <span className="label">Invested</span>
                        <span className="value">{money(aiTotals.total_invested)}</span>
                      </div>
                      <div className="stat">
                        <span className="label">Cash</span>
                        <span className="value">
                          {money(aiTotals.cash_usd)} ({Number(aiTotals.cash_pct ?? 0).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="stat">
                        <span className="label">Unrealized P&amp;L</span>
                        <span className="value">{money(aiTotals.total_pnl)}</span>
                      </div>
                      <div className="stat">
                        <span className="label">Total cost</span>
                        <span className="value">{money(aiTotals.total_cost)}</span>
                      </div>
                      <div className="stat">
                        <span className="label">Deploy budget</span>
                        <span className="value">{money(aiTotals.deploy_budget_usd)}</span>
                      </div>
                    </div>
                    {aiWarnings.length > 0 && (
                      <ul className="warn-list" style={{ color: 'var(--danger)', marginBottom: 12 }}>
                        {aiWarnings.map((warning, idx) => (
                          <li key={`${warning}-${idx}`}>{warning}</li>
                        ))}
                      </ul>
                    )}
                    {sectorChartData.length > 0 && (
                      <>
                        <h3 className="section-title">Sector mix</h3>
                        <div className="chart-box">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={sectorChartData} dataKey="value" nameKey="name" outerRadius={72} label>
                                {sectorChartData.map((_, i) => (
                                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {activeTab === 'actions' && (
              <>
                {!aiLoading && ruleActions.length === 0 && (
                  <p className="empty">No rule actions yet. Run Analyze.</p>
                )}
                {ruleActions.length > 0 && (
                  <>
                    <ul className="action-list">
                      {ruleActions.map((a, idx) => (
                        <li key={`${a.type}-${a.symbol}-${idx}`} className="action-item">
                          <div className="head">
                            <span>
                              {a.symbol} · {a.type}
                            </span>
                            <span>
                              {money(a.trade_usd)}
                              {a.approx_shares != null ? ` · ~${a.approx_shares} sh` : ''}
                            </span>
                          </div>
                          <div className="reason">{a.reason}</div>
                        </li>
                      ))}
                    </ul>
                    {actionChartData.length > 0 && (
                      <div className="chart-box">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={actionChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#d6cbc0" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="usd" fill="#5D4037" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {activeTab === 'ideas' && (
              <>
                {!aiLoading && suggestedBuys.length === 0 && (
                  <p className="empty">Run Analyze for portfolio-aware suggested buys.</p>
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
                      <p><strong>Fit:</strong> {s.fit || '—'}</p>
                      <p><strong>Catalyst:</strong> {s.catalyst || '—'}</p>
                      <p><strong>Risk:</strong> {s.risk || '—'}</p>
                    </article>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'ai' && (
              <>
                {aiLoading && <p className="empty">Generating summary…</p>}
                {!aiLoading && !aiAnalysis && (
                  <p className="empty">AI narrative appears here after Analyze.</p>
                )}
                {!aiLoading && aiAnalysis && (
                  <div className="ai-md">
                    <ReactMarkdown components={markdownComponents}>{aiAnalysis}</ReactMarkdown>
                  </div>
                )}
              </>
            )}

            {activeTab === 'tools' && (
              <div className="tools-stack">
                <div>
                  <h3 className="section-title">Quick quote</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      className="input mono"
                      value={peekSymbol}
                      onChange={(e) => setPeekSymbol(e.target.value.toUpperCase())}
                      placeholder="Ticker"
                      style={{ width: 140 }}
                    />
                    <button type="button" className="btn btn-primary" onClick={() => fetchStockData()}>
                      {quoteLoading ? '…' : 'Peek'}
                    </button>
                  </div>
                  {stockData && (
                    <div className="quote-grid">
                      <div>
                        <div style={{ fontFamily: 'var(--font-brand)', fontWeight: 700 }}>{displaySymbol}</div>
                        <div className="quote-price">{displayPrice != null ? `$${displayPrice}` : '—'}</div>
                        <div className={adviceOk ? 'advice-ok' : 'advice-warn'}>
                          <strong>ADVICE:</strong> {inferredAdvice}
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
                  <h3 className="section-title">Bulk paste</h3>
                  <p className="empty" style={{ marginBottom: 8 }}>
                    Lines like <span className="mono">AAPL,10,180.5</span>
                  </p>
                  <textarea
                    className="textarea"
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={'AAPL,10,180.5\nMSFT,5,400'}
                    rows={4}
                  />
                  <button type="button" className="btn" style={{ marginTop: 8 }} onClick={applyBulkPaste}>
                    Apply paste
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
