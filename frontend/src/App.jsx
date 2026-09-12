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
import { loadLastAnalysis, saveLastAnalysis } from './lastAnalysis.js';
import { loadLang, saveLang, t, remapKnownError } from './i18n.js';

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

function holdingsMixFromReport(report, totals) {
  const positions = Array.isArray(report?.positions) ? report.positions : [];
  const rows = positions
    .map((p) => ({
      symbol: String(p.symbol || '').toUpperCase(),
      weight_pct: Number(p.weight_pct || 0),
      pnl: Number(p.pnl || 0),
      isCash: false,
    }))
    .filter((r) => r.symbol);
  rows.push({
    symbol: 'CASH',
    weight_pct: Number(totals?.cash_pct ?? 0),
    pnl: 0,
    isCash: true,
  });
  return rows;
}

function dipFromReport(report) {
  return {
    combined: Number(report?.combined_dip_level || 0),
    qqq: report?.qqq || {},
    spy: report?.spy || {},
  };
}

function App() {
  const [lang, setLang] = useState(loadLang);
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
  const [analysisSavedAt, setAnalysisSavedAt] = useState(null);
  const [aiNote, setAiNote] = useState(null);
  const [holdingsMix, setHoldingsMix] = useState([]);
  const [dip, setDip] = useState(null);
  const [cashFloorPct, setCashFloorPct] = useState(0.15);
  const [whyNoActions, setWhyNoActions] = useState([]);
  const [ideasWebhook, setIdeasWebhook] = useState(null);
  const [nameRev, setNameRev] = useState(0);
  const [chineseNames, setChineseNames] = useState({});

  const handleLangChange = (next) => {
    const nextLang = next === 'zh' ? 'zh' : 'en';
    setLang(nextLang);
    saveLang(nextLang);
    setAuthError((prev) => (prev ? remapKnownError(prev, nextLang) : prev));
    setError((prev) => (prev ? remapKnownError(prev, nextLang) : prev));
    setPortfolioError((prev) => (prev ? remapKnownError(prev, nextLang) : prev));
    setAiError((prev) => (prev ? remapKnownError(prev, nextLang) : prev));
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const fetchPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    setPortfolioError(null);
    try {
      const response = await apiFetch(
        `/api/portfolio?portfolio_id=${encodeURIComponent(selectedPortfolio)}`
      );
      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(formatApiErrorDetail(errPayload?.detail) || t(lang, 'requestFailed'));
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
      setPortfolioError(friendlyNetworkError(err, lang));
    } finally {
      setPortfolioLoading(false);
    }
  }, [selectedPortfolio, lang]);

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
          setAuthError(friendlyNetworkError(err, lang));
        }
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authNonce]);

  const fetchTickerNames = useCallback(async () => {
    try {
      const response = await apiFetch('/api/ticker-names');
      if (!response.ok) {
        if (response.status === 503) return;
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(formatApiErrorDetail(errPayload?.detail) || t(lang, 'requestFailed'));
      }
      const data = await response.json();
      const next = {};
      for (const item of Array.isArray(data?.items) ? data.items : []) {
        const sym = String(item?.symbol || '').trim().toUpperCase();
        const zh = String(item?.name_zh || '').trim();
        if (sym && zh) next[sym] = zh;
      }
      setChineseNames(next);
    } catch (err) {
      setError(friendlyNetworkError(err, lang));
    }
  }, [lang]);

  useEffect(() => {
    if (!unlocked) return;
    setEditingHoldings(false);
    fetchPortfolio();
  }, [fetchPortfolio, unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    fetchTickerNames();
  }, [fetchTickerNames, unlocked]);

  useEffect(() => {
    const saved = loadLastAnalysis(selectedPortfolio);
    setAiAnalysis(saved?.aiAnalysis ?? null);
    setAiTotals(saved?.totals ?? null);
    setAiWarnings(Array.isArray(saved?.warnings) ? saved.warnings : []);
    setRuleActions(Array.isArray(saved?.ruleActions) ? saved.ruleActions : []);
    setSuggestedBuys(Array.isArray(saved?.suggestedBuys) ? saved.suggestedBuys : []);
    setSectorBreakdown(Array.isArray(saved?.sectorBreakdown) ? saved.sectorBreakdown : []);
    setSnapshotMeta(saved?.snapshotMeta ?? null);
    setSeenIdeaSymbols(Array.isArray(saved?.seenIdeaSymbols) ? saved.seenIdeaSymbols : []);
    setAnalysisSavedAt(saved?.savedAt ?? null);
    setAiNote(saved?.aiNote && typeof saved.aiNote === 'object' ? saved.aiNote : null);
    setHoldingsMix(Array.isArray(saved?.holdingsMix) ? saved.holdingsMix : []);
    setDip(saved?.dip && typeof saved.dip === 'object' ? saved.dip : null);
    setCashFloorPct(Number(saved?.cashFloorPct ?? 0.15) || 0.15);
    setWhyNoActions(Array.isArray(saved?.whyNoActions) ? saved.whyNoActions : []);
  }, [selectedPortfolio]);

  const updateRow = (id, field, value) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        return { ...row, [field]: value };
      })
    );
  };

  const toggleEdit = () => {
    if (editingHoldings) {
      setRows((prev) =>
        prev.map((row) => ({ ...row, symbol: String(row.symbol).trim().toUpperCase() }))
      );
    }
    setEditingHoldings((on) => !on);
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
      setError(t(lang, 'tapEditBeforePaste'));
      return;
    }
    const parsed = parseBulkPaste(bulkText);
    if (!parsed.length) {
      setError(t(lang, 'bulkNeedsLines'));
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
        setError(t(lang, 'sharesPositive', { s: symbol }));
        return;
      }
      if (!Number.isFinite(cost_basis) || cost_basis < 0) {
        setError(t(lang, 'costNonNeg', { s: symbol }));
        return;
      }
      holdings.push({ symbol, shares, cost_basis });
    }
    const cash = Number(cashUsd);
    if (!Number.isFinite(cash) || cash < 0) {
      setError(t(lang, 'cashNonNeg'));
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
      setError(friendlyNetworkError(err, lang));
    } finally {
      setPortfolioSaving(false);
    }
  };

  const fetchStockData = async (overrideSymbol) => {
    const resolvedSymbol = (overrideSymbol ?? peekSymbol).trim().toUpperCase();
    if (!resolvedSymbol) return;
    if (!overrideSymbol) setPeekSymbol(resolvedSymbol);
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
      setError(friendlyNetworkError(err, lang));
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleAnalyzePortfolio = async () => {
    setAiLoading(true);
    setAiError(null);
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
      const nextAnalysis = data?.ai_summary || null;
      const nextWarnings = Array.isArray(data?.warnings)
        ? data.warnings
        : Array.isArray(report?.warnings)
          ? report.warnings
          : [];
      const nextTotals = data?.totals ?? report?.policy?.totals ?? null;
      const nextActions = Array.isArray(data?.rule_actions)
        ? data.rule_actions
        : Array.isArray(report?.policy?.recommended_actions)
          ? report.policy.recommended_actions
          : [];
      const nextBuys = Array.isArray(data?.suggested_buys) ? data.suggested_buys : [];
      const nextSectors = Array.isArray(data?.sector_breakdown)
        ? data.sector_breakdown
        : Array.isArray(report?.sector_breakdown)
          ? report.sector_breakdown
          : [];
      const nextSnap = data?.snapshot_meta ?? report?.snapshot_meta ?? null;
      const nextSeen = new Set(seenIdeaSymbols);
      for (const s of nextBuys) {
        if (s?.symbol) nextSeen.add(String(s.symbol).toUpperCase());
      }
      const seenList = Array.from(nextSeen);
      const nextNote =
        data?.ai_note && typeof data.ai_note === 'object' && (data.ai_note.crowding || data.ai_note.catalyst || data.ai_note.risk)
          ? data.ai_note
          : null;
      const nextMix = holdingsMixFromReport(report, nextTotals);
      const nextDip = dipFromReport(report);
      const nextFloor = Number(report?.policy?.constraints?.cash_floor_pct ?? 0.15) || 0.15;
      const nextWhy = Array.isArray(report?.why_no_other_actions) ? report.why_no_other_actions : [];
      setAiAnalysis(nextAnalysis);
      setAiNote(nextNote);
      setAiWarnings(nextWarnings);
      setAiTotals(nextTotals);
      setRuleActions(nextActions);
      setSuggestedBuys(nextBuys);
      setSeenIdeaSymbols(seenList);
      setSectorBreakdown(nextSectors);
      setSnapshotMeta(nextSnap);
      setHoldingsMix(nextMix);
      setDip(nextDip);
      setCashFloorPct(nextFloor);
      setWhyNoActions(nextWhy);
      setAiError(data?.ai_error || data?.suggest_error || null);
      setIdeasWebhook(data?.webhook || null);
      const stored = saveLastAnalysis(selectedPortfolio, {
        aiAnalysis: nextAnalysis,
        aiNote: nextNote,
        warnings: nextWarnings,
        totals: nextTotals,
        ruleActions: nextActions,
        suggestedBuys: nextBuys,
        sectorBreakdown: nextSectors,
        snapshotMeta: nextSnap,
        seenIdeaSymbols: seenList,
        holdingsMix: nextMix,
        dip: nextDip,
        cashFloorPct: nextFloor,
        whyNoActions: nextWhy,
      });
      setAnalysisSavedAt(stored.savedAt);
    } catch (err) {
      setAiError(friendlyNetworkError(err, lang));
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
            t(lang, 'noNewNames')
        );
      }
      setSuggestedBuys(next);
      const seenList = (() => {
        const merged = new Set(seenIdeaSymbols);
        for (const s of next) {
          if (s?.symbol) merged.add(String(s.symbol).toUpperCase());
        }
        return Array.from(merged);
      })();
      setSeenIdeaSymbols(seenList);
      if (data?.suggest_error) setAiError(data.suggest_error);
      setIdeasWebhook(data?.webhook || null);
      const stored = saveLastAnalysis(selectedPortfolio, {
        suggestedBuys: next,
        seenIdeaSymbols: seenList,
      });
      setAnalysisSavedAt(stored.savedAt);
    } catch (err) {
      setAiError(friendlyNetworkError(err, lang));
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
      setError(friendlyNetworkError(err, lang));
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
        throw new Error(formatApiErrorDetail(payload?.detail) || t(lang, 'wrongPassword'));
      }
      if (payload.required === false) {
        setSiteToken('');
        setUnlocked(true);
        setPasswordInput('');
        return;
      }
      if (!payload.token) {
        throw new Error(t(lang, 'wrongPassword'));
      }
      setSiteToken(payload.token);
      setUnlocked(true);
      setPasswordInput('');
    } catch (err) {
      setAuthError(friendlyNetworkError(err, lang) || t(lang, 'wrongPassword'));
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
        lang={lang}
        onLangChange={handleLangChange}
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
        lang={lang}
        onLangChange={handleLangChange}
        profiles={PROFILES}
        selectedPortfolio={selectedPortfolio}
        onPortfolioChange={setSelectedPortfolio}
        cashUsd={cashUsd}
        onCashChange={setCashUsd}
        snapshotMeta={snapshotMeta}
        onRefresh={handleRefreshSnapshots}
        refreshing={refreshingSnapshots}
        editing={editingHoldings}
        onToggleEdit={toggleEdit}
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
          {t(lang, 'waking')}
        </div>
      )}

      {banner && (
        <div className="banner" role="alert">
          <ShieldAlert size={16} />
          <span>{banner}</span>
          {portfolioError ? (
            <button type="button" className="btn" onClick={fetchPortfolio}>
              {t(lang, 'retry')}
            </button>
          ) : null}
        </div>
      )}

      <div className="workspace">
        <HoldingsTable
          lang={lang}
          rows={rows}
          loading={portfolioLoading}
          editing={editingHoldings}
          loadError={null}
          nameRev={nameRev}
          chineseNames={chineseNames}
          onUpdateRow={updateRow}
          onRemoveRow={removeRow}
          onRetry={fetchPortfolio}
          onSaveChineseName={async (symbol, zh) => {
            const ticker = String(symbol || '').trim().toUpperCase();
            if (!ticker) return;
            setError(null);
            try {
              const response = await apiFetch('/api/ticker-names', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: ticker, name_zh: zh }),
              });
              if (!response.ok) {
                const errPayload = await response.json().catch(() => ({}));
                throw new Error(formatApiErrorDetail(errPayload?.detail) || t(lang, 'requestFailed'));
              }
              const data = await response.json();
              const saved = String(data?.name_zh || '').trim();
              setChineseNames((prev) => {
                const next = { ...prev };
                if (saved) next[ticker] = saved;
                else delete next[ticker];
                return next;
              });
              setNameRev((n) => n + 1);
            } catch (err) {
              setError(friendlyNetworkError(err, lang));
            }
          }}
        />

        <AnalysisPane
          lang={lang}
          chineseNames={chineseNames}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          loading={aiLoading}
          totals={aiTotals}
          warnings={aiWarnings}
          sectorBreakdown={sectorBreakdown}
          ruleActions={ruleActions}
          suggestedBuys={suggestedBuys}
          aiNote={aiNote}
          holdingsMix={holdingsMix}
          dip={dip}
          cashFloorPct={cashFloorPct}
          whyNoActions={whyNoActions}
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
          webhook={ideasWebhook}
          savedAt={analysisSavedAt}
        />
      </div>
    </div>
  );
}

export default App;
