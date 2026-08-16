import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import LockScreen from './components/LockScreen.jsx';
import HoldingsTable from './components/HoldingsTable.jsx';
import AnalysisPane from './components/AnalysisPane.jsx';
import TopBar from './components/TopBar.jsx';
import {
  apiFetch,
  formatApiErrorDetail,
  friendlyNetworkError,
  getSiteToken,
  setSiteToken,
} from './api.js';

const PROFILES = [
  { id: 'Eric', label: 'Eric' },
  { id: 'Vivien', label: 'Vivien' },
];

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

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authNonce, setAuthNonce] = useState(0);
  const [wakingServer, setWakingServer] = useState(false);
  const [editingHoldings, setEditingHoldings] = useState(false);
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
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [seenIdeaSymbols, setSeenIdeaSymbols] = useState([]);

  const fetchPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    setPortfolioError(null);
    try {
      const response = await apiFetch(
        `/api/portfolio?portfolio_id=${encodeURIComponent(selectedPortfolio)}`
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
      setPortfolioError(friendlyNetworkError(err));
    } finally {
      setPortfolioLoading(false);
    }
  }, [selectedPortfolio]);

  useEffect(() => {
    const lock = () => setUnlocked(false);
    const slow = () => setWakingServer(true);
    const slowEnd = () => setWakingServer(false);
    window.addEventListener('site-lock', lock);
    window.addEventListener('api-slow', slow);
    window.addEventListener('api-slow-end', slowEnd);
    return () => {
      window.removeEventListener('site-lock', lock);
      window.removeEventListener('api-slow', slow);
      window.removeEventListener('api-slow-end', slowEnd);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAuthChecking(true);
      setAuthError(null);
      try {
        const statusRes = await apiFetch('/api/auth/status');
        const statusData = await statusRes.json().catch(() => ({ required: true }));
        if (!statusData.required) {
          if (!cancelled) setUnlocked(true);
          return;
        }
        const token = getSiteToken();
        if (!token) {
          if (!cancelled) setUnlocked(false);
          return;
        }
        const probe = await apiFetch('/api/snapshots');
        if (!cancelled) setUnlocked(probe.ok);
        if (!probe.ok) setSiteToken('');
      } catch (err) {
        if (!cancelled) {
          setUnlocked(false);
          setAuthError(friendlyNetworkError(err));
        }
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authNonce]);

  useEffect(() => {
    if (!unlocked) return;
    setEditingHoldings(false);
    fetchPortfolio();
  }, [fetchPortfolio, unlocked]);

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
    if (!editingHoldings) {
      setError('Tap Edit before pasting holdings.');
      return;
    }
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
      const response = await apiFetch(
        `/api/portfolio?portfolio_id=${encodeURIComponent(selectedPortfolio)}`,
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
      setEditingHoldings(false);
    } catch (err) {
      setError(friendlyNetworkError(err));
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
      const response = await apiFetch(`/api/stock/${resolvedSymbol.toUpperCase()}`);
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
      setError(friendlyNetworkError(err));
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
      const response = await apiFetch(
        `/api/analyze-portfolio?portfolio_id=${encodeURIComponent(selectedPortfolio)}`,
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
      setSeenIdeaSymbols((prev) => {
        const next = new Set(prev);
        for (const s of data?.suggested_buys || []) {
          if (s?.symbol) next.add(String(s.symbol).toUpperCase());
        }
        return Array.from(next);
      });
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
      setAiError(friendlyNetworkError(err));
    } finally {
      setAiLoading(false);
    }
  };

  const handleMoreIdeas = async () => {
    setIdeasLoading(true);
    setAiError(null);
    setActiveTab('ideas');
    try {
      const exclude = seenIdeaSymbols
        .concat((suggestedBuys || []).map((s) => s.symbol))
        .filter(Boolean)
        .join(',');
      const qs = new URLSearchParams({
        portfolio_id: selectedPortfolio,
      });
      if (exclude) qs.set('exclude', exclude);
      const response = await apiFetch(`/api/ideas?${qs.toString()}`, { method: 'POST' });
      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(formatApiErrorDetail(errPayload?.detail) || 'Failed to fetch ideas');
      }
      const data = await response.json();
      const next = Array.isArray(data?.suggested_buys) ? data.suggested_buys : [];
      if (!next.length) {
        throw new Error(
          data?.suggest_error ||
            'No new names in the screen. Try again later or run Analyze first.'
        );
      }
      setSuggestedBuys(next);
      setSeenIdeaSymbols((prev) => {
        const merged = new Set(prev);
        for (const s of next) {
          if (s?.symbol) merged.add(String(s.symbol).toUpperCase());
        }
        return Array.from(merged);
      });
      if (data?.suggest_error) setAiError(data.suggest_error);
    } catch (err) {
      setAiError(friendlyNetworkError(err));
    } finally {
      setIdeasLoading(false);
    }
  };

  const handleRefreshSnapshots = async () => {
    setRefreshingSnapshots(true);
    setError(null);
    try {
      const response = await apiFetch(
        `/api/snapshots/refresh?portfolio_id=${encodeURIComponent(selectedPortfolio)}`,
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
      setError(friendlyNetworkError(err));
    } finally {
      setRefreshingSnapshots(false);
    }
  };

  const handleUnlock = async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(formatApiErrorDetail(payload?.detail) || 'Wrong password');
      }
      if (payload.required === false) {
        setSiteToken('');
        setUnlocked(true);
        setPasswordInput('');
        return;
      }
      if (!payload.token) {
        throw new Error('Wrong password');
      }
      setSiteToken(payload.token);
      setUnlocked(true);
      setPasswordInput('');
    } catch (err) {
      setAuthError(friendlyNetworkError(err) || 'Wrong password');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLock = () => {
    setSiteToken('');
    setUnlocked(false);
    setPasswordInput('');
    setAuthError(null);
    setAuthChecking(false);
    setEditingHoldings(false);
  };

  const banner = error || portfolioError || aiError;

  if (authChecking || !unlocked) {
    return (
      <LockScreen
        checking={authChecking}
        password={passwordInput}
        error={authError}
        busy={authBusy}
        onPasswordChange={setPasswordInput}
        onSubmit={handleUnlock}
        onRetry={() => setAuthNonce((n) => n + 1)}
      />
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        profiles={PROFILES}
        selectedPortfolio={selectedPortfolio}
        onPortfolioChange={setSelectedPortfolio}
        cashUsd={cashUsd}
        onCashChange={setCashUsd}
        snapshotMeta={snapshotMeta}
        onRefresh={handleRefreshSnapshots}
        refreshing={refreshingSnapshots}
        editing={editingHoldings}
        onToggleEdit={() => setEditingHoldings((v) => !v)}
        onAddRow={addRow}
        onSaveAll={handleSaveAll}
        saving={portfolioSaving}
        loading={portfolioLoading}
        onAnalyze={handleAnalyzePortfolio}
        analyzing={aiLoading}
        onLock={handleLock}
      />

      {wakingServer && (
        <div className="banner banner-info" role="status">
          Waking the API… Render sleeps when idle. This can take 30–60 seconds.
        </div>
      )}

      {banner && (
        <div className="banner" role="alert">
          <ShieldAlert size={16} />
          <span>{banner}</span>
          {portfolioError ? (
            <button type="button" className="btn" onClick={fetchPortfolio}>
              Retry
            </button>
          ) : null}
        </div>
      )}

      <div className="workspace">
        <HoldingsTable
          rows={rows}
          loading={portfolioLoading}
          editing={editingHoldings}
          loadError={null}
          onUpdateRow={updateRow}
          onRemoveRow={removeRow}
          onRetry={fetchPortfolio}
        />

        <AnalysisPane
          activeTab={activeTab}
          onTabChange={setActiveTab}
          loading={aiLoading}
          totals={aiTotals}
          warnings={aiWarnings}
          sectorBreakdown={sectorBreakdown}
          ruleActions={ruleActions}
          suggestedBuys={suggestedBuys}
          aiAnalysis={aiAnalysis}
          peekSymbol={peekSymbol}
          onPeekSymbolChange={setPeekSymbol}
          onPeek={() => fetchStockData()}
          quoteLoading={quoteLoading}
          stockData={stockData}
          bulkText={bulkText}
          onBulkTextChange={setBulkText}
          onApplyBulkPaste={applyBulkPaste}
          editing={editingHoldings}
          onMoreIdeas={handleMoreIdeas}
          moreLoading={ideasLoading}
        />
      </div>
    </div>
  );
}

export default App;
