import React from 'react';
import { BarChart3, Plus, RefreshCw, Lock } from 'lucide-react';

/**
 * Top strip only. App.jsx still owns portfolio, cash, save, analyze, lock.
 */
export default function TopBar({
  profiles,
  selectedPortfolio,
  onPortfolioChange,
  cashUsd,
  onCashChange,
  snapshotMeta,
  onRefresh,
  refreshing,
  onAddRow,
  onSaveAll,
  saving,
  loading,
  onAnalyze,
  analyzing,
  onLock,
}) {
  return (
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
            onChange={(e) => onPortfolioChange(e.target.value)}
          >
            {profiles.map((profile) => (
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
            onChange={(e) => onCashChange(e.target.value)}
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
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={14} />
          {refreshing ? '…' : 'Refresh'}
        </button>

        <button type="button" className="btn" onClick={onAddRow}>
          <Plus size={14} /> Row
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onSaveAll}
          disabled={saving || loading}
        >
          {saving ? 'Saving…' : 'Save all'}
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onAnalyze}
          disabled={analyzing || loading}
        >
          {analyzing ? 'Analyzing…' : 'Analyze'}
        </button>

        <button type="button" className="btn btn-ghost" onClick={onLock} title="Lock site">
          <Lock size={14} />
          Lock
        </button>
      </div>
    </header>
  );
}
