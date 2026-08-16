const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';
const TOKEN_KEY = 'us-stock-site-token';

export { API_BASE };

export function getSiteToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setSiteToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore private-mode storage failures
  }
}

export function formatApiErrorDetail(detail) {
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

function looksLikeLocalhostBuildOnPhone() {
  if (typeof window === 'undefined') return false;
  const pageHost = window.location.hostname;
  const onLocalPage = pageHost === 'localhost' || pageHost === '127.0.0.1';
  const apiIsLocal = /localhost|127\.0\.0\.1/.test(API_BASE);
  return apiIsLocal && !onLocalPage;
}

export function friendlyNetworkError(err) {
  const msg = err?.message || String(err || '');
  const failedFetch = err?.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(msg);
  if (looksLikeLocalhostBuildOnPhone()) {
    return 'This site is calling localhost, which does not work on a phone. Set VITE_API_BASE on Netlify to the Render URL and redeploy.';
  }
  if (failedFetch) {
    return 'Could not reach the API. Render sleeps when idle — the first request can take 30–60 seconds. Wait and tap Retry.';
  }
  return msg || 'Request failed';
}

async function rawFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getSiteToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401) {
    setSiteToken('');
    window.dispatchEvent(new Event('site-lock'));
  }
  return response;
}

/** One network retry. After 8s fires `api-slow` so the UI can say the server is waking. */
export async function apiFetch(path, options = {}) {
  const slowTimer = window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('api-slow', { detail: { path } }));
  }, 8000);
  try {
    try {
      return await rawFetch(path, options);
    } catch (err) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      return await rawFetch(path, options);
    }
  } finally {
    window.clearTimeout(slowTimer);
    window.dispatchEvent(new Event('api-slow-end'));
  }
}
