const LANG_KEY = 'us-stock-lang';

const COPY = {
  brand: { en: 'US Stock Sentinel', zh: '美股哨兵' },
  portfolio: { en: 'Portfolio', zh: '组合' },
  cash: { en: 'Cash', zh: '现金' },
  edit: { en: 'Edit', zh: '编辑' },
  done: { en: 'Done', zh: '完成' },
  refresh: { en: 'Refresh', zh: '刷新' },
  row: { en: 'Row', zh: '加行' },
  saveAll: { en: 'Save all', zh: '保存全部' },
  saving: { en: 'Saving…', zh: '保存中…' },
  analyze: { en: 'Analyze', zh: '分析' },
  analyzing: { en: 'Analyzing…', zh: '分析中…' },
  lock: { en: 'Lock', zh: '锁定' },
  lockTitle: { en: 'Lock site', zh: '锁定网站' },
  holdings: { en: 'Holdings', zh: '持股' },
  namesCount: { en: '{n} names', zh: '{n} 只' },
  editing: { en: 'editing', zh: '编辑中' },
  loading: { en: 'Loading…', zh: '加载中…' },
  loadingHoldings: {
    en: 'Loading holdings… If this is the first visit after a while, the API may be waking (up to a minute).',
    zh: '正在加载持股… 若 API 刚休眠醒来，可能要一分钟。',
  },
  symbol: { en: 'Symbol', zh: '代码' },
  shares: { en: 'Shares', zh: '股数' },
  costShare: { en: 'Cost / share', zh: '成本/股' },
  lastPrice: { en: 'Last price', zh: '现价' },
  chineseName: { en: 'Chinese name', zh: '中文名' },
  chineseNameHint: {
    en: 'Chinese names save to Supabase (Edit, then leave the field). Same on every phone.',
    zh: '中文名存到 Supabase（编辑后点出输入框即保存）。每台手机都会看到。',
  },
  removeRow: { en: 'Remove {s}', zh: '删除 {s}' },
  removeConfirm: {
    en: 'Remove {s}? It is not saved until you tap Save all.',
    zh: '删除 {s}？点「保存全部」之前不会写入。',
  },
  thisRow: { en: 'this row', zh: '这一行' },
  retry: { en: 'Retry', zh: '重试' },
  waking: {
    en: 'Waking the API… Render sleeps when idle. This can take 30–60 seconds.',
    zh: '正在唤醒 API… Render 空闲会休眠，可能要 30–60 秒。',
  },
  lastSaved: { en: 'Last saved {t}', zh: '上次保存 {t}' },
  tabOverview: { en: 'Overview', zh: '总览' },
  tabActions: { en: 'Actions', zh: '操作' },
  tabIdeas: { en: 'Ideas', zh: '点子' },
  tabAi: { en: 'AI', zh: 'AI' },
  tabTools: { en: 'Tools', zh: '工具' },
  analysis: { en: 'Analysis', zh: '分析' },
  lockCopy: {
    en: 'Enter the site password to view and edit portfolios.',
    zh: '输入网站密码后可查看和编辑组合。',
  },
  password: { en: 'Password', zh: '密码' },
  hidePassword: { en: 'Hide password', zh: '隐藏密码' },
  showPassword: { en: 'Show password', zh: '显示密码' },
  unlock: { en: 'Unlock', zh: '解锁' },
  checking: { en: 'Checking…', zh: '验证中…' },
  retryConnection: { en: 'Retry connection', zh: '重试连接' },
  checkingAccess: {
    en: 'Checking access… If the API has been idle, Render may take 30–60 seconds to wake.',
    zh: '正在检查访问… 若 API 刚休眠，可能要 30–60 秒。',
  },
  marketValue: { en: 'Market value', zh: '市值' },
  paperPnl: { en: 'Paper P&L', zh: '账面盈亏' },
  buyBudget: { en: 'Buy budget', zh: '可加仓额度' },
  overviewEmpty: {
    en: 'Run Analyze to see where the money sits.',
    zh: '点「分析」查看资金分布。',
  },
  overviewAnalyzing: {
    en: 'Analyzing… First run after idle can take 30–60 seconds while Render and Gemini wake up.',
    zh: '分析中… API 休眠后首次可能要 30–60 秒。',
  },
  overviewUpdating: {
    en: 'Updating… last result stays visible until the new Analyze finishes.',
    zh: '更新中… 上次结果会留到新分析完成。',
  },
  paperPnlHintProfit: {
    en: 'Paper P&L is profit if you sold every holding now, vs what you paid. It is not cash in the bank.',
    zh: '账面盈亏 = 现在卖掉全部持股，相对买入成本的盈利。还没卖，所以不是口袋里的现金。',
  },
  paperPnlHintLoss: {
    en: 'Paper P&L is loss if you sold every holding now, vs what you paid. It is not cash in the bank.',
    zh: '账面盈亏 = 现在卖掉全部持股，相对买入成本的亏损。还没卖，所以不是口袋里的现金。',
  },
  buyBudgetL0: {
    en: 'Buy budget is $0 on L0: Nasdaq/S&P are not down enough, so rules keep extra cash.',
    zh: 'L0 时可加仓额度为 $0：纳指/标普没有明显下跌，多余现金先留着。',
  },
  buyBudgetDip: {
    en: 'Buy budget is how much extra cash (above the 15% floor) rules may spend on this dip.',
    zh: '可加仓额度 = 现金底线（15%）以上、政策允许在这次回撤里花掉的钱。',
  },
  cashVsFloor: { en: 'Cash vs floor', zh: '现金 vs 底线' },
  cashFloorLine: { en: '{c}% cash · floor {f}%', zh: '现金 {c}% · 底线 {f}%' },
  cashShort: { en: 'short {m}', zh: '还差 {m}' },
  cashExcess: { en: 'excess {m}', zh: '超出 {m}' },
  marketDip: { en: 'Market dip', zh: '大盘回撤' },
  dipExplain: {
    en: 'L0–L3 is how far QQQ and SPY sit below recent highs. This book uses the worse of the two. Buys only start at L1.',
    zh: 'L0–L3 看纳指 QQQ 和标普 SPY 距近期高点跌了多少，取更差的一边。L1 起政策才允许买。',
  },
  priceMissing: { en: '{t}: price data missing', zh: '{t}：行情数据缺失' },
  drawdown: {
    en: '{t}: {dip} · 6m {d6}% / 12m {d12}% off high',
    zh: '{t}：{dip} · 6个月 {d6}% / 12个月 {d12}% 距高点',
  },
  concentration: { en: 'Concentration', zh: '持仓集中度' },
  sectors: { en: 'Sectors', zh: '行业' },
  sectorsUnknownHint: {
    en: 'Sector labels are mostly unknown from Yahoo — use concentration by ticker instead.',
    zh: '雅虎行业标签大多未知，看上面的个股权重即可。',
  },
  unknown: { en: 'Unknown', zh: '未知' },
  actionsIntro: {
    en: 'Rule suggestions after Analyze — the app does not place trades.',
    zh: '这些是分析之后的规则建议，应用不会自动下单。',
  },
  nothingToTrade: { en: 'Nothing to trade right now.', zh: '现在没有建议操作。' },
  actionsRunAnalyze: {
    en: 'Run Analyze to see whether the rules would sell, refill cash, or buy.',
    zh: '点「分析」查看规则会不会减仓、补现金或买入。',
  },
  actionsUpdating: {
    en: 'Updating… last result stays visible until Analyze finishes.',
    zh: '更新中… 上次结果会留到新分析完成。',
  },
  aboutShares: { en: 'About {n} shares', zh: '约 {n} 股' },
  moreIdeas: { en: 'More ideas', zh: '更多点子' },
  findingIdeas: { en: 'Finding ideas…', zh: '正在找点子…' },
  ideasHint: {
    en: 'Skips holdings and names already shown this visit. Catalyst + risk from Gemini.',
    zh: '跳过已持股和这次已出现的名字。催化剂和风险来自 Gemini。',
  },
  ideasEmpty: {
    en: 'Tap More ideas (or Analyze) for portfolio-aware suggested buys.',
    zh: '点「更多点子」或「分析」，按组合给建议买入。',
  },
  ideasScreening: {
    en: 'Screening Nasdaq-100 then ranking with Gemini. Can take up to a minute.',
    zh: '先筛纳指 100，再用 Gemini 排序。可能要一分钟。',
  },
  webhookOff: { en: 'Sheet webhook is off (no IDEAS_WEBHOOK_URL).', zh: '表格 webhook 未开（没有 IDEAS_WEBHOOK_URL）。' },
  webhookOk: { en: 'Posted this batch to your Google web app.', zh: '已把这批点子发到 Google 网页应用。' },
  webhookFail: {
    en: 'Webhook failed{err}. Ideas on this page are still saved.',
    zh: 'Webhook 失败{err}。本页点子仍已保存。',
  },
  thesis: { en: 'Thesis', zh: '论点' },
  fit: { en: 'Fit', zh: '契合' },
  catalyst: { en: 'Catalyst', zh: '催化剂' },
  risk: { en: 'Risk', zh: '风险' },
  crowding: { en: 'Crowding', zh: '集中度' },
  aiGenerating: {
    en: 'Generating note… This can take up to a minute if the API was asleep.',
    zh: '生成笔记中… API 休眠后可能要一分钟。',
  },
  aiEmpty: {
    en: 'Crowding, catalyst, and risk for names you already hold appear here after Analyze. The old 9-line recap is gone — tap Analyze if this is empty.',
    zh: '分析之后会显示已持仓的集中度、催化剂和风险。旧的 9 条摘要已去掉，若这里是空的请再点一次分析。',
  },
  aiUpdating: {
    en: 'Updating… last note stays visible until Gemini finishes.',
    zh: '更新中… 上次笔记会留到新结果出来。',
  },
  notAdvice: {
    en: 'Not financial advice. New names stay on the Ideas tab.',
    zh: '非投资建议。新股票在「点子」页。',
  },
  quickQuote: { en: 'Quick quote', zh: '快速报价' },
  ticker: { en: 'Ticker', zh: '代码' },
  peek: { en: 'Peek', zh: '查询' },
  advice: { en: 'ADVICE', zh: '提示' },
  bulkPaste: { en: 'Bulk paste', zh: '批量粘贴' },
  bulkNeedEdit: {
    en: 'Tap Edit in the top bar before pasting holdings.',
    zh: '先点顶栏「编辑」再粘贴持股。',
  },
  bulkLinesLike: { en: 'Lines like', zh: '每行例如' },
  applyPaste: { en: 'Apply paste', zh: '应用粘贴' },
  tapEditBeforePaste: { en: 'Tap Edit before pasting holdings.', zh: '先点「编辑」再粘贴持股。' },
  bulkNeedsLines: { en: 'Bulk paste needs lines like AAPL,10,180.5', zh: '批量粘贴需要类似 AAPL,10,180.5 的行' },
  sharesPositive: { en: '{s}: shares must be a positive number', zh: '{s}：股数必须是正数' },
  costNonNeg: { en: '{s}: cost basis must be >= 0', zh: '{s}：成本不能为负' },
  cashNonNeg: { en: 'Cash must be zero or a positive number', zh: '现金必须是 0 或正数' },
  noNewNames: {
    en: 'No new names in the screen. Try again later or run Analyze first.',
    zh: '这次筛选没有新名字。稍后再试，或先点「分析」。',
  },
  localhostPhone: {
    en: 'This site is calling localhost, which does not work on a phone. Set VITE_API_BASE on Netlify to the Render URL and redeploy.',
    zh: '这个站点在请求本机地址，手机打不开。请在 Netlify 把 VITE_API_BASE 设成 Render 地址再发布。',
  },
  apiSleep: {
    en: 'Could not reach the API. Render sleeps when idle — the first request can take 30–60 seconds. Wait and tap Retry.',
    zh: '连不上 API。Render 空闲会休眠，第一次请求可能要 30–60 秒。等一下再点重试。',
  },
  requestFailed: { en: 'Request failed', zh: '请求失败' },
  wrongPassword: { en: 'Wrong password', zh: '密码错误' },
  dipL3: { en: 'Deep dip (L3)', zh: '深回撤（L3）' },
  dipL2: { en: 'Medium dip (L2)', zh: '中等回撤（L2）' },
  dipL1: { en: 'Mild dip (L1)', zh: '小回撤（L1）' },
  dipL0: { en: 'No dip (L0)', zh: '未回撤（L0）' },
};

const SECTORS = {
  Technology: { en: 'Technology', zh: '科技' },
  Healthcare: { en: 'Healthcare', zh: '医疗' },
  'Consumer Cyclical': { en: 'Consumer Cyclical', zh: '非必需消费' },
  'Consumer Defensive': { en: 'Consumer Defensive', zh: '必需消费' },
  'Communication Services': { en: 'Communication Services', zh: '通信服务' },
  'Financial Services': { en: 'Financial Services', zh: '金融' },
  Industrials: { en: 'Industrials', zh: '工业' },
  Energy: { en: 'Energy', zh: '能源' },
  Utilities: { en: 'Utilities', zh: '公用事业' },
  'Real Estate': { en: 'Real Estate', zh: '房地产' },
  'Basic Materials': { en: 'Basic Materials', zh: '原材料' },
  Unknown: { en: 'Unknown', zh: '未知' },
};

export function loadLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'zh' || v === 'en') return v;
  } catch {
    // private mode
  }
  return 'en';
}

export function saveLang(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // private mode / quota
  }
}

export function t(lang, key, vars) {
  const row = COPY[key];
  let text = lang === 'zh' ? row?.zh : row?.en;
  if (!text) text = row?.en || key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function pick(pair, lang) {
  if (!pair) return '';
  const primary = lang === 'zh' ? pair.zh : pair.en;
  const fallback = pair.en || pair.zh || '';
  return (primary && String(primary).trim()) || fallback;
}

export function pickField(obj, base, lang) {
  if (!obj) return '';
  if (lang === 'zh') return String(obj[`${base}_zh`] || obj[base] || '').trim();
  return String(obj[base] || obj[`${base}_zh`] || '').trim();
}

export function sectorLabel(sector, lang) {
  const key = String(sector || '').trim();
  const row = SECTORS[key];
  if (!row) return key;
  return lang === 'zh' ? row.zh : row.en;
}

export function dipLabel(level, lang) {
  const n = Number(level || 0);
  if (n >= 3) return t(lang, 'dipL3');
  if (n >= 2) return t(lang, 'dipL2');
  if (n >= 1) return t(lang, 'dipL1');
  return t(lang, 'dipL0');
}

export function remapKnownError(message, lang) {
  const raw = String(message || '');
  if (!raw) return raw;
  const keys = ['apiSleep', 'localhostPhone', 'wrongPassword', 'requestFailed', 'waking'];
  for (const key of keys) {
    if (raw === t('en', key) || raw === t('zh', key)) return t(lang, key);
  }
  return raw;
}

export function dipLevel(level) {
  const n = Number(level || 0);
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  if (n >= 1) return 1;
  return 0;
}
