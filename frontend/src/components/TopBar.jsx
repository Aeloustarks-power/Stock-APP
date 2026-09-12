import React from 'react';
import { BarChart3, Plus, RefreshCw, Lock, Pencil } from 'lucide-react';
import LangToggle from './LangToggle.jsx';
import { t } from '../i18n.js';

/**
 * Top strip only. App.jsx still owns portfolio, cash, save, analyze, lock.
 * Cash / add-row / save stay disabled until `editing` is on.
 */
export default function TopBar({
  lang,
  onLangChange,
  profiles,
  selectedPortfolio,
  onPortfolioChange,
  cashUsd,
  onCashChange,
  snapshotMeta,
  onRefresh,
  refreshing,
  editing,
  onToggleEdit,
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
        <h1>{t(lang, 'brand')}</h1>
        <LangToggle lang={lang} onChange={onLangChange} />
      </div>

      <div className="topbar-controls">
        <div className="field">
          <label htmlFor="portfolio">{t(lang, 'portfolio')}</label>
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
          <label htmlFor="cash">{t(lang, 'cash')}</label>
          <input
            id="cash"
            className="mono"
            type={editing ? 'number' : 'text'}
            inputMode={editing ? 'decimal' : undefined}
            min="0"
            step="any"
            value={cashUsd}
            readOnly={!editing}
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
          className={`btn${editing ? ' btn-primary' : ' btn-ghost'}`}
          onClick={onToggleEdit}
        >
          <Pencil size={14} />
          {editing ? t(lang, 'done') : t(lang, 'edit')}
        </button>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={14} />
          {refreshing ? '…' : t(lang, 'refresh')}
        </button>

        {editing ? (
          <button type="button" className="btn" onClick={onAddRow}>
            <Plus size={14} /> {t(lang, 'row')}
          </button>
        ) : null}

        {editing ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSaveAll}
            disabled={saving || loading}
          >
            {saving ? t(lang, 'saving') : t(lang, 'saveAll')}
          </button>
        ) : null}

        <button
          type="button"
          className="btn btn-primary"
          onClick={onAnalyze}
          disabled={analyzing || loading}
        >
          {analyzing ? t(lang, 'analyzing') : t(lang, 'analyze')}
        </button>

        <button type="button" className="btn btn-ghost" onClick={onLock} title={t(lang, 'lockTitle')}>
          <Lock size={14} />
          {t(lang, 'lock')}
        </button>
      </div>
    </header>
  );
}
