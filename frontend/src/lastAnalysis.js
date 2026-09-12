/** Last Analyze / Ideas for this browser only. Not synced. Keyed by Eric vs Vivien. */

const PREFIX = 'us-stock-last-analysis:';

function storageKey(portfolioId) {
  return `${PREFIX}${portfolioId || 'default'}`;
}

export function loadLastAnalysis(portfolioId) {
  try {
    const raw = localStorage.getItem(storageKey(portfolioId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function saveLastAnalysis(portfolioId, patch) {
  const prev = loadLastAnalysis(portfolioId) || {};
  const next = {
    ...prev,
    ...patch,
    version: 1,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(storageKey(portfolioId), JSON.stringify(next));
  } catch {
    // private mode / quota
  }
  return next;
}

export function formatSavedAt(iso, lang = 'en') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
