import React from 'react';
import OverviewTab from './OverviewTab.jsx';
import ActionsTab from './ActionsTab.jsx';
import IdeasTab from './IdeasTab.jsx';
import AiTab from './AiTab.jsx';
import ToolsTab from './ToolsTab.jsx';
import { formatSavedAt } from '../lastAnalysis.js';
import { t } from '../i18n.js';

/**
 * Right-hand analysis column. App.jsx still owns Analyze results and tab id.
 * This file only switches which tab to draw.
 */
export default function AnalysisPane({
  lang,
  chineseNames = {},
  activeTab,
  onTabChange,
  loading,
  totals,
  warnings,
  sectorBreakdown,
  ruleActions,
  suggestedBuys,
  aiNote,
  holdingsMix,
  dip,
  cashFloorPct,
  whyNoActions,
  peekSymbol,
  onPeekSymbolChange,
  onPeek,
  quoteLoading,
  stockData,
  bulkText,
  onBulkTextChange,
  onApplyBulkPaste,
  editing,
  onMoreIdeas,
  moreLoading,
  webhook,
  savedAt,
}) {
  const tabs = [
    { id: 'overview', key: 'tabOverview' },
    { id: 'actions', key: 'tabActions' },
    { id: 'ideas', key: 'tabIdeas' },
    { id: 'ai', key: 'tabAi' },
    { id: 'tools', key: 'tabTools' },
  ];

  return (
    <section className="pane" aria-label={t(lang, 'analysis')}>
      <div className="pane-header">
        <div className="tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              {t(lang, tab.key)}
            </button>
          ))}
        </div>
        {savedAt ? (
          <span className="meta last-saved">
            {t(lang, 'lastSaved', { t: formatSavedAt(savedAt, lang) })}
          </span>
        ) : null}
      </div>

      <div className="tab-body" role="tabpanel">
        {activeTab === 'overview' && (
          <OverviewTab
            lang={lang}
            chineseNames={chineseNames}
            loading={loading}
            totals={totals}
            warnings={warnings}
            sectorBreakdown={sectorBreakdown}
            holdingsMix={holdingsMix}
            dip={dip}
            cashFloorPct={cashFloorPct}
          />
        )}
        {activeTab === 'actions' && (
          <ActionsTab
            lang={lang}
            chineseNames={chineseNames}
            loading={loading}
            ruleActions={ruleActions}
            whyNoActions={whyNoActions}
          />
        )}
        {activeTab === 'ideas' && (
          <IdeasTab
            lang={lang}
            chineseNames={chineseNames}
            loading={loading}
            suggestedBuys={suggestedBuys}
            onMoreIdeas={onMoreIdeas}
            moreLoading={moreLoading}
            webhook={webhook}
          />
        )}
        {activeTab === 'ai' && <AiTab lang={lang} loading={loading} note={aiNote} />}
        {activeTab === 'tools' && (
          <ToolsTab
            lang={lang}
            chineseNames={chineseNames}
            peekSymbol={peekSymbol}
            onPeekSymbolChange={onPeekSymbolChange}
            onPeek={onPeek}
            quoteLoading={quoteLoading}
            stockData={stockData}
            bulkText={bulkText}
            onBulkTextChange={onBulkTextChange}
            onApplyBulkPaste={onApplyBulkPaste}
            editing={editing}
          />
        )}
      </div>
    </section>
  );
}
