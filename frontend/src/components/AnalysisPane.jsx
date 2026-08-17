import React from 'react';
import OverviewTab from './OverviewTab.jsx';
import ActionsTab from './ActionsTab.jsx';
import IdeasTab from './IdeasTab.jsx';
import AiTab from './AiTab.jsx';
import ToolsTab from './ToolsTab.jsx';
import { formatSavedAt } from '../lastAnalysis.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'actions', label: 'Actions' },
  { id: 'ideas', label: 'Ideas' },
  { id: 'ai', label: 'AI' },
  { id: 'tools', label: 'Tools' },
];

/**
 * Right-hand analysis column. App.jsx still owns Analyze results and tab id.
 * This file only switches which tab to draw.
 */
export default function AnalysisPane({
  activeTab,
  onTabChange,
  loading,
  totals,
  warnings,
  sectorBreakdown,
  ruleActions,
  suggestedBuys,
  aiAnalysis,
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
  savedAt,
}) {
  return (
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
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {savedAt ? (
          <span className="meta last-saved">Last saved {formatSavedAt(savedAt)}</span>
        ) : null}
      </div>

      <div className="tab-body" role="tabpanel">
        {activeTab === 'overview' && (
          <OverviewTab
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
            loading={loading}
            ruleActions={ruleActions}
            whyNoActions={whyNoActions}
          />
        )}
        {activeTab === 'ideas' && (
          <IdeasTab
            loading={loading}
            suggestedBuys={suggestedBuys}
            onMoreIdeas={onMoreIdeas}
            moreLoading={moreLoading}
          />
        )}
        {activeTab === 'ai' && (
          <AiTab loading={loading} note={aiNote} analysis={aiAnalysis} />
        )}
        {activeTab === 'tools' && (
          <ToolsTab
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
