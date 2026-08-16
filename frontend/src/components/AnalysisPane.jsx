import React from 'react';
import OverviewTab from './OverviewTab.jsx';
import ActionsTab from './ActionsTab.jsx';
import IdeasTab from './IdeasTab.jsx';
import AiTab from './AiTab.jsx';
import ToolsTab from './ToolsTab.jsx';

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
  peekSymbol,
  onPeekSymbolChange,
  onPeek,
  quoteLoading,
  stockData,
  bulkText,
  onBulkTextChange,
  onApplyBulkPaste,
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
      </div>

      <div className="tab-body" role="tabpanel">
        {activeTab === 'overview' && (
          <OverviewTab
            loading={loading}
            totals={totals}
            warnings={warnings}
            sectorBreakdown={sectorBreakdown}
          />
        )}
        {activeTab === 'actions' && (
          <ActionsTab loading={loading} ruleActions={ruleActions} />
        )}
        {activeTab === 'ideas' && (
          <IdeasTab loading={loading} suggestedBuys={suggestedBuys} />
        )}
        {activeTab === 'ai' && <AiTab loading={loading} analysis={aiAnalysis} />}
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
          />
        )}
      </div>
    </section>
  );
}
