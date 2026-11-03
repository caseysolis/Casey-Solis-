// ACN Portfolio Simulator — client. Paper portfolio, projections and downside.
// No brokerage connection or trade execution. Personal amounts never go into
// URLs, analytics, logs or market-data requests.
import {
  TABS, TAB_ORDER, MY_ACN_VIEWS, VIEW_ORDER, SECTIONS, SECTION_LABELS, MIXES, MAIN_MIXES, MARKET_PATHS, PATH_ORDER,
  SHOCKS, SHOCK_ORDER, HORIZON_MARKERS, INSTRUMENTS, ALL_SYMBOLS, SLEEVE_LABELS, SLEEVE_CONSTITUENTS, SLEEVES, DISPLAY_TZ,
} from '/engine/constants.js';
import { sleeveDollars } from '/engine/allocation.js';
import { projectStrategy, breakEvenAcnReturn, grossRate, diversifiedRate, depletionYear } from '/engine/forecast.js';
import { shockResult, earlyLate } from '/engine/downside.js';
import { valueRun, sleeveBreakdown, runSymbols, pendingSymbols } from '/engine/paper.js';
import { classifyQuote, mergeQuote, STATUS_LABELS, isValuable } from '/engine/quotes.js';
import { totalReturnWindow } from '/engine/totalReturn.js';
import { parseMoney, parsePercent, parseQuantity, parsePrice, formatUSD, formatPct, formatUnits, formatDateTime, nyDate } from '/engine/money.js';
import { holdingsCSV, projectionCSV } from '/engine/csv.js';
import { defaultTab, activeBaseline, investable, previewBaseline, commitBaseline, trackVersion, anchorTab, previewRun, viewRetention, migrateTab } from '/engine/state.js';
import { Sync, api } from '/sync.js';
import { lineChart, bindCharts } from '/chart.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => formatUSD(v);
const pct = (v, o) => formatPct(v, o);
const signCls = (v) => (v > 0.004 ? 'chg-pos' : v < -0.004 ? 'chg-neg' : '');

const S = {
  phase: 'boot', // boot | login | app | blocked
  health: null,
  user: null,
  offline: false,
  tabs: {},
  profile: { manualQuotes: {} },
  quotes: {},
  quoteMeta: { configured: null, refreshedAt: null, error: null, refreshing: false, provider: null },
  history: {},
  historyLoading: new Set(),
  ui: { errors: {} },
  syncState: 'idle',
  conflicts: {},
};

const sync = new Sync({
  onStatus: (s, n) => { S.syncState = s; S.pending = n; renderSyncBadge(); },
  onConflict: (key, current) => { S.conflicts[key] = current; render(); },
});

// ---------------------------------------------------------------- routing
function parseRoute(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const tab = TAB_ORDER.includes(parts[0]) ? parts[0] : 'myacn';
  let i = 1;
  let view = 'acn';
  if (tab === 'myacn') { view = VIEW_ORDER.includes(parts[1]) ? parts[1] : 'acn'; i = 2; }
  const section = SECTIONS.includes(parts[i]) ? parts[i] : 'today';
  const runId = parts[i + 1] === 'run' && /^[\w-]+$/.test(parts[i + 2] || '') ? parts[i + 2] : null;
  return { tab, view, section, runId };
}
function href({ tab, view, section, runId }) {
  const v = tab === 'myacn' ? `/${view || 'acn'}` : '';
  return `#/${tab}${v}/${section || 'today'}${runId ? `/run/${runId}` : ''}`;
}
window.addEventListener('hashchange', () => { closeDialog(); render(); });

// ---------------------------------------------------------------- persistence
function saveTab(tab) {
  S.tabs[tab.tabKey] = tab;
  sync.save(`tab:${tab.tabKey}`, tab);
}
function saveProfile() { sync.save('profile', S.profile); }

function ensureTabs() {
  const now = new Date().toISOString();
  for (const k of TAB_ORDER) {
    const raw = sync.data[`tab:${k}`];
    const t = migrateTab(raw);
    if (t) S.tabs[k] = t;
    else { S.tabs[k] = defaultTab(k, now); sync.save(`tab:${k}`, S.tabs[k]); }
  }
  S.profile = sync.data.profile || { schema: 1, manualQuotes: {} };
  if (!sync.data.profile) sync.save('profile', S.profile);
}

// ---------------------------------------------------------------- quotes
function effectiveQuotes() {
  const now = Date.now();
  const out = {};
  for (const s of ALL_SYMBOLS) {
    let q = S.quotes[s] ? { ...S.quotes[s] } : null;
    if (q && !q.error) {
      if (S.quoteMeta.error) q.fromCache = true;
      q.status = classifyQuote(q, now);
    }
    const m = S.profile.manualQuotes?.[s];
    if (m) {
      const mq = { symbol: s, price: m.price, currency: 'USD', source: 'manual', marketTs: `${m.date}T21:00:00.000Z`, fetchedAt: m.enteredAt, status: 'manual', venue: 'Manual entry' };
      // A manual quote applies when the provider has no usable price, or when it is dated on/after the provider's market date.
      q = !q || q.error || !isValuable(q) || q.status === 'stale' || m.date >= nyDate(q.marketTs) ? mq : q;
    }
    out[s] = q || { symbol: s, error: 'unavailable', status: 'unavailable' };
  }
  return out;
}

let quoteSeq = 0;
let quoteApplied = 0;
let quoteInflight = null;
async function refreshQuotes() {
  if (quoteInflight) return quoteInflight; // de-duplicate repeat taps
  const my = ++quoteSeq;
  S.quoteMeta.refreshing = true;
  renderQuoteStatus();
  quoteInflight = (async () => {
    try {
      const res = await api('GET', `/api/quotes?symbols=${encodeURIComponent(ALL_SYMBOLS.join(','))}`);
      if (my < quoteApplied) return; // out-of-order response
      quoteApplied = my;
      if (res.status !== 200) {
        S.quoteMeta.error = res.status === 401 ? 'Signed out' : `Quote service HTTP ${res.status}`;
        if (res.status === 401) return handleSignedOut();
      } else {
        S.quoteMeta.configured = res.data.configured;
        S.quoteMeta.provider = res.data.provider || null;
        S.quoteMeta.error = null;
        S.quoteMeta.refreshedAt = res.data.serverTime;
        for (const [s, q] of Object.entries(res.data.quotes)) {
          if (q.error) { if (!S.quotes[s]) S.quotes[s] = q; continue; }
          S.quotes[s] = mergeQuote(S.quotes[s], q);
        }
        try { localStorage.setItem('acn:quotes', JSON.stringify(S.quotes)); } catch { /* storage unavailable */ }
        afterQuotes();
      }
    } catch {
      S.quoteMeta.error = 'Offline — showing last verified prices';
    } finally {
      S.quoteMeta.refreshing = false;
      quoteInflight = null;
      render();
    }
  })();
  return quoteInflight;
}

function afterQuotes() {
  const eq = effectiveQuotes();
  for (const k of TAB_ORDER) {
    let t = S.tabs[k];
    if (!t || t.readOnly) continue;
    const anchored = anchorTab(t, eq);
    let changed = anchored !== t;
    t = anchored;
    // Record observed points for the selected runs (price basis).
    const watch = new Set([...Object.values(t.selectedRun || {}), ...t.runs.filter((r) => r.kind === 'benchmark').map((r) => r.id)]);
    const runs = t.runs.map((r) => {
      if (!watch.has(r.id)) return r;
      const v = valueRun(r, eq);
      if (!v.complete) return r;
      const ts = Math.max(...v.holdings.map((h) => Date.parse(h.quote?.marketTs || 0)));
      const obs = r.obs || [];
      if (!Number.isFinite(ts) || (obs.length && obs[obs.length - 1].t >= ts)) return r;
      changed = true;
      return { ...r, obs: [...obs, { t: ts, v: v.total }].slice(-300) };
    });
    if (changed) saveTab({ ...t, runs });
  }
}

let pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') refreshQuotes(); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refreshQuotes(); pullRemote(); } });
}

async function ensureHistory(symbols, from) {
  const need = symbols.filter((s) => !S.history[`${from}|${s}`] && !S.historyLoading.has(`${from}|${s}`));
  if (!need.length) return;
  need.forEach((s) => S.historyLoading.add(`${from}|${s}`));
  try {
    const res = await api('GET', `/api/history?symbols=${encodeURIComponent(need.join(','))}&from=${from}`);
    if (res.status === 200) for (const s of need) S.history[`${from}|${s}`] = res.data.history[s] || { verifiedThrough: null };
    else for (const s of need) S.history[`${from}|${s}`] = { verifiedThrough: null, unavailable: `HTTP ${res.status}` };
  } catch {
    for (const s of need) S.history[`${from}|${s}`] = { verifiedThrough: null, unavailable: 'Offline' };
  } finally {
    need.forEach((s) => S.historyLoading.delete(`${from}|${s}`));
    render();
  }
}

function totalReturnFor(run, eq) {
  const symbols = runSymbols(run);
  if (pendingSymbols(run).length) return { available: false, missing: pendingSymbols(run), reason: 'Positions awaiting anchor prices' };
  const from = symbols.map((s) => nyDate(run.anchors[s].marketTs || run.createdAt)).sort()[0];
  const loading = symbols.some((s) => !S.history[`${from}|${s}`]);
  if (loading) { ensureHistory(symbols, from); return { loading: true }; }
  const histories = Object.fromEntries(symbols.map((s) => [s, S.history[`${from}|${s}`]]));
  const marks = {};
  let latest = '0000-00-00';
  for (const s of symbols) {
    const q = eq[s];
    if (isValuable(q)) { marks[s] = q.price; const d = nyDate(q.marketTs); if (d > latest) latest = d; }
  }
  return totalReturnWindow({ run, latestMarks: marks, latestDate: latest, histories });
}

// ---------------------------------------------------------------- context
function ctxFor(r) {
  const tab = S.tabs[r.tab];
  const b = activeBaseline(tab);
  const isAcn = r.tab === 'myacn';
  const view = isAcn ? r.view : 'diversified';
  const p = isAcn ? viewRetention(view, tab) : 0;
  return {
    route: r, tab, b, capital: investable(b), p, isAcn, view, strategy: isAcn ? view : 'diversified',
    label: isAcn ? MY_ACN_VIEWS[view].label : `${TABS[r.tab].label} proceeds`, a: tab.assumptions, basisKey: isAcn ? view : 'proceeds',
  };
}

function runsFor(c) {
  return c.tab.runs.filter((x) => x.strategy === c.strategy && x.kind !== 'benchmark').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function todayRun(c) {
  const runs = runsFor(c);
  if (c.route.runId) {
    const r = c.tab.runs.find((x) => x.id === c.route.runId && x.strategy === c.strategy);
    if (r) return { run: r, runs };
  }
  if (c.strategy === 'custom') {
    const sel = runs.find((x) => x.id === c.tab.selectedRun.custom);
    if (sel && Math.abs(sel.p - c.tab.customRetain) < 1e-12 && sel.mixKey === c.a.mixKey && sel.baselineId === c.b.id) return { run: sel, runs };
    return { run: previewRun(c.tab, c.tab.customRetain, c.a.mixKey), runs, preview: true };
  }
  return { run: runs.find((x) => x.id === c.tab.selectedRun[c.strategy]) || runs[0], runs };
}

function projection(c, p = c.p) {
  try {
    return projectStrategy({ capital: c.capital, p, mixKey: c.a.mixKey, pathKey: c.a.pathKey, acnReturn: c.a.acnReturn, fee: c.a.fee, draw: c.a.draw, inflation: c.a.inflation });
  } catch (e) {
    return { error: e.message };
  }
}

// ---------------------------------------------------------------- render
function render() {
  const app = $('#app');
  if (S.phase === 'boot') return;
  if (S.phase === 'login') { app.innerHTML = loginView(); return; }
  const r = parseRoute();
  const c = ctxFor(r);
  const focus = captureFocus();
  app.innerHTML = `
    ${header()}
    <nav class="tabs" aria-label="Scenarios"><div class="tabs-inner">
      ${TAB_ORDER.map((k) => `<a href="${href({ tab: k, view: 'acn', section: k === r.tab ? r.section : 'today' })}" ${k === r.tab ? 'aria-current="page"' : ''} data-testid="tab-${k}">${TABS[k].label}</a>`).join('')}
    </div></nav>
    <main class="wrap" id="main">
      ${banners(c)}
      ${c.isAcn ? `<nav class="seg views" aria-label="My ACN views">${VIEW_ORDER.map((v) => `<a href="${href({ tab: 'myacn', view: v, section: r.section })}" ${v === r.view ? 'aria-current="page"' : ''} data-testid="view-${v}">${MY_ACN_VIEWS[v].label}</a>`).join('')}</nav>` : ''}
      <nav class="seg" aria-label="Sections">${SECTIONS.map((s) => `<a href="${href({ ...r, section: s, runId: null })}" ${s === r.section ? 'aria-current="page"' : ''} data-testid="section-${s}">${SECTION_LABELS[s]}</a>`).join('')}</nav>
      ${c.strategy === 'custom' ? retentionPanel(c) : ''}
      <div id="section">${sectionHTML(c)}</div>
      ${footer()}
    </main>`;
  bindCharts(app);
  renderSyncBadge();
  restoreFocus(focus);
  document.title = `${TABS[r.tab].label}${c.isAcn ? ' · ' + MY_ACN_VIEWS[r.view].label : ''} · ${SECTION_LABELS[r.section]} — ACN Portfolio Simulator`;
}

function sectionHTML(c) {
  try {
    if (c.route.section === 'today') return todayHTML(c);
    if (c.route.section === 'projections') return projectionsHTML(c);
    return downsideHTML(c);
  } catch (e) {
    console.error(e);
    return `<div class="notice bad">Something went wrong rendering this view: ${esc(e.message)}</div>`;
  }
}

function captureFocus() {
  const el = document.activeElement;
  if (!el || !el.id || !$('#app').contains(el)) return null;
  return { id: el.id, value: el.value, start: el.selectionStart, end: el.selectionEnd, dirty: el.dataset.dirty === '1' };
}
function restoreFocus(f) {
  if (!f) return;
  const el = document.getElementById(f.id);
  if (!el) return;
  if (f.dirty && el.tagName === 'INPUT' && el.type === 'text') { el.value = f.value; el.dataset.dirty = '1'; }
  el.focus({ preventScroll: true });
  try { if (f.start !== null && el.setSelectionRange) el.setSelectionRange(f.start, f.end); } catch { /* not a text field */ }
}

function header() {
  return `<header class="top"><div class="top-inner">
    <div class="brand">ACN Portfolio Simulator<small>Private planning workspace</small></div>
    <span class="sync" id="sync-badge" data-testid="sync-status" role="status"></span>
    <button class="linkbtn" data-act="signout" data-testid="signout">Sign out</button>
  </div></header>`;
}

function syncText() {
  if (S.health && S.health.storage === 'blocked') return ['blocked', 'Account storage blocked'];
  const s = S.syncState;
  if (s === 'saving') return ['saving', 'Saving…'];
  if (s === 'saved') return ['saved', 'Saved'];
  if (s === 'offline') return ['offline', `Offline — ${S.pending || 0} pending`];
  if (s === 'conflict') return ['conflict', 'Conflict — review'];
  if (s === 'signed-out') return ['offline', 'Signed out'];
  if (s === 'error') return ['conflict', `Save failed (HTTP ${sync.lastError}) — ${S.pending || 0} pending`];
  return ['idle', S.offline ? 'Offline' : 'Saved'];
}
function renderSyncBadge() {
  const el = $('#sync-badge');
  if (!el) return;
  const [st, txt] = syncText();
  el.dataset.state = st;
  el.textContent = txt;
}

function banners(c) {
  const out = [];
  if (S.health && S.health.storage === 'blocked') out.push(`<div class="notice bad" data-testid="storage-blocked"><strong>Account storage is blocked.</strong> ${esc(S.health.storageStep)}</div>`);
  if (S.offline) out.push(`<div class="notice">You are offline. Showing this device's cached copy; edits are kept as pending and sent when you reconnect.</div>`);
  for (const [key, cur] of Object.entries(S.conflicts)) {
    const name = key === 'profile' ? 'Manual quotes' : TABS[key.slice(4)]?.label;
    out.push(`<div class="notice bad" data-testid="conflict"><strong>${esc(name)} changed on another device</strong> (saved ${esc(formatDateTime(cur?.updatedAt))}). Choose which version to keep.
      <div class="inline"><button class="btn" data-act="conflict" data-key="${esc(key)}" data-choice="theirs">Load the other device's version</button><button class="btn" data-act="conflict" data-key="${esc(key)}" data-choice="mine">Keep this device's version</button></div></div>`);
  }
  if (c.tab.readOnly) out.push(`<div class="notice">This scenario was saved by a newer version of the simulator and is shown read-only.</div>`);
  return out.join('');
}

function footer() {
  return `<div class="foot-links">
    <button class="linkbtn" data-act="about" data-testid="about">About &amp; disclosures</button>
    <button class="linkbtn" data-act="weights" data-testid="weights">Research weights</button>
    <button class="linkbtn" data-act="sources" data-testid="sources">Data sources</button>
    <span>Simulator only — no brokerage connection or trade execution.</span>
  </div>`;
}

// ---------------------------------------------------------------- hero
function hero(c, { value, valueNote = '', meta = [], actions = '' }) {
  const bl = c.b;
  const placeholder = c.isAcn && bl.mode === 'placeholder';
  const posBtn = c.isAcn
    ? `<button class="btn primary" data-act="open-position" data-testid="update-position">Update my ACN position</button>`
    : `<button class="btn" data-act="open-proceeds" data-testid="edit-opening">Edit opening amount</button><button class="btn ghost" data-act="restore-default" data-testid="restore-default">Restore default</button>`;
  return `<section class="hero" aria-labelledby="hero-title" data-testid="hero">
    <div class="eyebrow" id="hero-title">${esc(TABS[c.route.tab].label)} · ${esc(c.label)} · ${SECTION_LABELS[c.route.section]}</div>
    <div class="value" data-testid="hero-value">${value}${placeholder ? ' <span class="badge warn" data-testid="placeholder-badge">Placeholder</span>' : ''}</div>
    ${valueNote ? `<div>${valueNote}</div>` : ''}
    <div class="meta">${meta.map((m) => `<span>${m}</span>`).join('')}</div>
    <div class="actions">${posBtn}${actions}</div>
  </section>`;
}

function openingMeta(c) {
  const b = c.b;
  const out = [`Opening ${b.mode === 'placeholder' ? 'amount (placeholder)' : 'capital'} <strong class="num" data-testid="opening-capital">${money(c.capital)}</strong>`];
  if (!c.isAcn && (b.deductions || b.cashOutside)) out.push(`after ${money(b.deductions)} deductions and ${money(b.cashOutside)} kept outside`);
  out.push(`Baseline dated ${esc(formatDateTime(b.createdAt))}`);
  out.push(`Simulator started ${esc(formatDateTime(c.tab.startedAt))}`);
  return out;
}

function quoteSummary(eq, symbols) {
  const counts = {};
  let latest = 0;
  for (const s of symbols) {
    const st = eq[s]?.status || 'unavailable';
    counts[st] = (counts[st] || 0) + 1;
    const t = Date.parse(eq[s]?.marketTs || '');
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  const parts = Object.entries(counts).map(([k, n]) => `<span class="st-${k}"><span class="status-dot"></span>${n} ${esc(STATUS_LABELS[k].toLowerCase())}</span>`).join(' · ');
  const when = latest ? `latest market time ${esc(formatDateTime(new Date(latest).toISOString()))}` : 'no prices yet';
  return `<span id="quote-status" data-testid="quote-status">${S.quoteMeta.refreshing ? 'Refreshing… ' : ''}Prices: ${parts} · ${when}</span>`;
}
function renderQuoteStatus() {
  const el = $('#quote-status');
  if (el && S.quoteMeta.refreshing && !el.textContent.startsWith('Refreshing')) el.textContent = 'Refreshing… ' + el.textContent;
}

// ---------------------------------------------------------------- today
function basisSwitch(key, current, testid) {
  return `<div class="seg small" role="group" aria-label="Return basis" data-testid="${testid}">
    <button data-act="basis" data-key="${key}" data-value="price" aria-pressed="${current === 'price'}">Price return</button>
    <button data-act="basis" data-key="${key}" data-value="total" aria-pressed="${current === 'total'}">Total return</button>
  </div>`;
}

function todayHTML(c) {
  const eq = effectiveQuotes();
  const { run, runs, preview } = todayRun(c);
  if (!run) return `<div class="notice">No paper run yet.</div>`;
  const v = valueRun(run, eq);
  const basis = c.tab.returnBasis[c.basisKey] || 'price';
  const tr = basis === 'total' ? totalReturnFor(run, eq) : null;
  const symbols = runSymbols(run);
  const isPlaceholderRun = run.placeholder;

  let value;
  let valueNote = '';
  if (basis === 'total') {
    if (tr && tr.available) {
      value = `<span class="num">${money(tr.value)}</span>`;
      valueNote = `<span class="${signCls(tr.value - tr.cost)} num" data-testid="hero-change">${formatUSD(tr.value - tr.cost, { sign: true })} (${pct(tr.totalReturn, { sign: true })})</span> gross total return${tr.dated ? ` through ${esc(tr.through)}` : ''}`;
    } else {
      value = `<span class="num">${money(run.capital)}</span>`;
      valueNote = `<span class="badge muted">Total return unavailable</span> opening amount shown`;
    }
  } else if (v.complete) {
    value = `<span class="num">${money(v.total)}</span>`;
    valueNote = `<span class="${signCls(v.pnl)} num" data-testid="hero-change">${formatUSD(v.pnl, { sign: true })} (${pct(v.pnlPct, { sign: true })})</span> price return since ${esc(formatDateTime(run.createdAt))}`;
  } else {
    value = `<span class="num">${money(run.capital)}</span>`;
    valueNote = v.pricedCost > 0
      ? `<span class="badge warn">Incomplete</span> Priced subtotal <strong class="num" data-testid="priced-subtotal">${money(v.pricedValue)}</strong> covering ${pct(v.coverage)} of opening dollars. Awaiting: ${esc(v.missing.join(', '))}`
      : `<span class="badge muted">Awaiting prices</span> Opening amount shown; target dollars and forecasts are available now.`;
  }

  const meta = [...openingMeta(c), quoteSummary(eq, symbols)];
  if (!S.quoteMeta.configured && S.quoteMeta.configured !== null) meta.push(`<span class="badge warn">No quote provider configured</span> enter dated manual quotes from any holding`);
  if (S.quoteMeta.error) meta.push(`<span class="badge warn">${esc(S.quoteMeta.error)}</span>`);

  const actions = `<button class="btn" data-act="refresh" data-testid="refresh" ${S.quoteMeta.refreshing ? 'aria-busy="true"' : ''}>Refresh prices</button>
    <button class="btn ghost" data-act="export-holdings" data-testid="export-holdings">Export CSV</button>`;

  const mixNotice = c.strategy === 'diversified' && run.mixKey !== c.a.mixKey
    ? `<div class="notice info" data-testid="mix-preview-notice">This paper run tracks the <strong>${MIXES[run.mixKey].label}</strong> mix (started ${esc(formatDateTime(run.createdAt))}). The selected <strong>${MIXES[c.a.mixKey].label}</strong> mix is a preview. <button class="btn" data-act="track" data-testid="track-version">Track this version</button></div>` : '';

  const runSel = runs.length > 1 || preview ? `<div class="field"><label for="run-select">Paper run</label>
    <select id="run-select" data-input="run-select" data-testid="run-select">
      ${preview ? `<option value="" selected>Preview — ${pct(c.tab.customRetain)} ACN, ${MIXES[c.a.mixKey].label} mix (not tracked)</option>` : ''}
      ${runs.map((x) => `<option value="${esc(x.id)}" ${!preview && x.id === run.id ? 'selected' : ''}>${esc(x.label)} · ${esc(formatDateTime(x.createdAt))}${x.placeholder ? ' · placeholder' : ''}${x.mixKey && x.p < 1 ? ` · ${MIXES[x.mixKey].label} mix` : ''}</option>`).join('')}
    </select></div>` : '';

  const previewNote = preview ? `<div class="notice info" data-testid="preview-notice"><strong>Preview.</strong> Valued from this baseline's common anchor prices. A preview never changes either endpoint portfolio or places a trade.
    <div class="inline" style="margin-top:8px"><button class="btn teal" data-act="track" data-testid="track-version">Track this version</button></div></div>` : '';

  const chartPts = [{ x: Date.parse(run.createdAt), y: run.capital, xLabel: `Start ${formatDateTime(run.createdAt)}` }, ...(run.obs || []).map((o) => ({ x: o.t, y: o.v, xLabel: formatDateTime(new Date(o.t).toISOString()) }))];
  const chart = lineChart([{ name: run.label, points: chartPts }], {
    id: 'today-chart', ariaLabel: `Observed paper value for ${run.label}`, yFmt: money, yTickFmt: shortMoney,
    xTickFmt: (x) => new Intl.DateTimeFormat('en-US', { timeZone: DISPLAY_TZ, month: 'short', day: 'numeric' }).format(new Date(x)),
    xTicks: chartPts.length > 1 ? [chartPts[0].x, chartPts.at(-1).x] : [chartPts[0].x],
    singlePointLabel: chartPts.length === 1 ? 'Opening (only observed point)' : null,
  });

  return `
    ${hero(c, { value, valueNote, meta, actions })}
    ${mixNotice}
    ${c.strategy === 'diversified' ? mixPicker(c, 'Research mix') : ''}
    ${runSel}${previewNote}
    <div class="grid side">
      <section class="card" aria-labelledby="perf-h">
        <div class="inline" style="justify-content:space-between"><h2 id="perf-h">Paper performance</h2></div>
        ${basisSwitch(c.basisKey, basis, 'basis-switch')}
        ${basis === 'price' ? `<p class="note" data-testid="basis-note">Price return excludes dividends, ETF distributions, fees and taxes. Units are fixed at the anchor; new quotes change market value only.</p>` : totalReturnNote(tr)}
        ${chart}
        <p class="note">Chart shows observed price-basis values only${(run.obs || []).length ? '' : ' — one point until prices are observed'}.</p>
      </section>
      <section class="card" aria-labelledby="run-h">
        <h2 id="run-h">This paper run</h2>
        <dl class="kv">
          <dt>Strategy</dt><dd class="wrap">${esc(run.label)}</dd>
          <dt>Started</dt><dd>${esc(formatDateTime(run.createdAt))}</dd>
          <dt>Opening capital</dt><dd>${money(run.capital)}${isPlaceholderRun ? ' <span class="badge warn">Placeholder</span>' : ''}</dd>
          ${run.p > 0 && run.p < 1 ? `<dt>Direct ACN</dt><dd>${pct(run.p)}</dd>` : ''}
          ${run.p < 1 ? `<dt>Research mix</dt><dd>${MIXES[run.mixKey].label}</dd>` : '<dt>Holdings</dt><dd>Accenture plc only</dd>'}
          <dt>Units</dt><dd>${run.unitsBasis === 'estimated' ? '<span class="badge warn" data-testid="estimated-badge">Estimated</span>' : run.unitsBasis === 'actual' ? '<span class="badge">Actual share count</span>' : 'Derived: dollars ÷ anchor'}</dd>
          <dt>Awaiting anchor</dt><dd class="wrap">${pendingSymbols(run).length ? esc(pendingSymbols(run).join(', ')) : 'None'}</dd>
          <dt>Price P&amp;L</dt><dd class="${signCls(v.pnl)}">${v.complete ? `${formatUSD(v.pnl, { sign: true })} (${pct(v.pnlPct, { sign: true })})` : '— incomplete'}</dd>
        </dl>
      </section>
    </div>
    ${holdingsTable(c, run, eq, v, tr, basis)}
    ${c.isAcn ? comparisonCard(c, eq) : ''}`;
}

function totalReturnNote(tr) {
  if (!tr || tr.loading) return `<p class="note" data-testid="basis-note">Loading verified distribution history…</p>`;
  const conv = 'Gross total return: verified, split-adjusted cash distributions reinvested at the ex-date close into hypothetical units kept separate from the share ledger. Excludes fees and taxes.';
  if (!tr.available) {
    return `<div class="notice" data-testid="basis-note"><strong>Total return unavailable.</strong> ${esc(tr.reason || 'Missing verified distribution history')} for: <span data-testid="tr-missing">${esc((tr.missing || []).join(', '))}</span>. Price return is not substituted.</div><p class="note">${conv}</p>`;
  }
  const sources = [...new Set(Object.values(tr.bySymbol).map((b) => b.source).filter(Boolean))];
  return `<p class="note" data-testid="basis-note">${conv} Through ${esc(tr.through)}${tr.dated ? ' (earlier common verified date)' : ''}. Sources: ${esc(sources.join('; '))}.</p>`;
}

function holdingsTable(c, run, eq, v, tr, basis) {
  const rows = sleeveBreakdown(run, eq);
  const total = rows.reduce((s, r) => s + r.weight, 0);
  const body = rows.map((r) => {
    const q = eq[r.symbol];
    const st = q?.status || 'unavailable';
    const pnl = r.value !== null ? r.value - r.dollars : null;
    return `<tr class="clickable" data-act="holding" data-symbol="${esc(r.symbol)}" data-testid="holding-${esc(r.symbol)}-${r.sleeve}">
      <td class="first" data-label="Holding"><button class="rowbtn" data-act="holding" data-symbol="${esc(r.symbol)}">${esc(r.symbol)}</button><span class="sub">${esc(INSTRUMENTS[r.symbol].name)} · ${esc(SLEEVE_LABELS[r.sleeve])}${r.category && r.sleeve === 'core' ? ` · ${esc(r.category)}` : ''}</span></td>
      <td class="n" data-label="Weight">${pct(r.weight, { digits: 2 })}</td>
      <td class="n" data-label="Opening">${money(r.dollars)}</td>
      <td class="n" data-label="Units">${r.units === null ? '<span class="badge muted">Awaiting price</span>' : formatUnits(r.units)}${r.symbol === 'ACN' && run.unitsBasis === 'estimated' && r.units !== null ? ' <span class="badge warn">Est.</span>' : ''}</td>
      <td class="n" data-label="Latest"><span class="st-${st}"><span class="status-dot"></span>${isValuable(q) ? formatUSD(q.price) : '—'}</span><span class="sub">${esc(STATUS_LABELS[st])}</span></td>
      <td class="n" data-label="Value">${r.value === null ? '—' : money(r.value)}</td>
      <td class="n ${signCls(pnl)}" data-label="P&amp;L">${pnl === null ? '—' : formatUSD(pnl, { sign: true })}</td>
    </tr>`;
  }).join('');
  const totalRow = `<tr class="total"><td class="first" data-label="">${v.complete ? 'Total' : `Priced subtotal · ${pct(v.coverage)} coverage`}</td><td class="n" data-label="Weight">${pct(total)}</td><td class="n" data-label="Opening">${money(run.capital)}</td><td data-label=""></td><td data-label=""></td><td class="n" data-label="Value" data-testid="holdings-total">${money(v.pricedValue)}</td><td class="n" data-label="P&amp;L">${v.complete ? formatUSD(v.pnl, { sign: true }) : '—'}</td></tr>`;
  return `<section class="card" aria-labelledby="hold-h" style="margin-top:14px">
    <h2 id="hold-h">Holdings <span class="note">— tap a holding for units, anchor, latest mark, P&amp;L and source</span></h2>
    ${run.p < 1 ? `<p class="note">Direct ACN: ${pct(run.p)}. Broad index ETFs can hold ACN or other names indirectly. ETFs are illustrative tracking instruments for the report's categories.</p>` : ''}
    <div class="table-wrap"><table class="stack" data-testid="holdings-table">
      <thead><tr><th>Holding</th><th class="n">Weight</th><th class="n">Opening</th><th class="n">Units</th><th class="n">Latest</th><th class="n">Value</th><th class="n">P&amp;L</th></tr></thead>
      <tbody>${body}${totalRow}</tbody>
    </table></div>
  </section>`;
}

function comparisonCard(c, eq) {
  const basis = c.tab.returnBasis.compare || 'price';
  const base = c.tab.runs.filter((r) => r.baselineId === c.b.id && r.kind === 'baseline');
  const acn = base.find((r) => r.strategy === 'acn');
  const div = base.find((r) => r.strategy === 'diversified');
  const customSel = c.tab.runs.find((r) => r.id === c.tab.selectedRun.custom && r.baselineId === c.b.id);
  const custom = customSel || previewRun(c.tab, c.tab.customRetain, c.a.mixKey);
  const rows = [[MY_ACN_VIEWS.acn.label, acn], [MY_ACN_VIEWS.diversified.label, div], [`Custom Split (${pct(custom.p)} ACN)${customSel ? '' : ' · preview'}`, custom]];
  const tracked = c.route.view === 'custom' && customSel && customSel.kind === 'tracked' ? c.tab.runs.find((r) => r.benchmarkFor === customSel.id) : null;
  if (tracked) rows.push(['Hold-all ACN benchmark', tracked]);
  const body = rows.map(([name, run]) => {
    if (!run) return '';
    const v = valueRun(run, eq);
    let val = '—';
    let ret = '—';
    if (basis === 'price') {
      if (v.complete) { val = money(v.total); ret = pct(v.pnlPct, { sign: true }); } else { val = `<span class="badge warn">${pct(v.coverage)} priced</span>`; }
    } else {
      const tr = totalReturnFor(run, eq);
      if (tr.loading) val = 'Loading…';
      else if (tr.available) { val = money(tr.value); ret = pct(tr.totalReturn, { sign: true }); } else val = `<span class="badge muted">Unavailable</span><span class="sub">${esc((tr.missing || []).join(', '))}</span>`;
    }
    return `<tr><td class="first" data-label="Strategy">${esc(name)}<span class="sub">Started ${esc(formatDateTime(run.createdAt))}</span></td><td class="n" data-label="Opening">${money(run.capital)}</td><td class="n" data-label="Value">${val}</td><td class="n" data-label="Return">${ret}</td></tr>`;
  }).join('');
  return `<section class="card" aria-labelledby="cmp-h" style="margin-top:14px" data-testid="comparison">
    <h2 id="cmp-h">Compare strategies — same capital and start</h2>
    ${basisSwitch('compare', basis, 'compare-basis-switch')}
    <div class="table-wrap"><table class="stack"><thead><tr><th>Strategy</th><th class="n">Opening</th><th class="n">${basis === 'price' ? 'Price value' : 'Total-return value'}</th><th class="n">Return</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="note">${basis === 'price' ? 'Price return excludes dividends, ETF distributions, fees and taxes.' : 'Gross total return with verified distributions only; missing data is shown as unavailable, never substituted.'}</p>
  </section>`;
}

// ---------------------------------------------------------------- custom split panel
function retentionPanel(c) {
  const p = c.tab.customRetain;
  const d = sleeveDollars(c.capital, p, c.a.mixKey);
  const seg = (k) => `<span class="sw-${k}" style="width:${(d[k] / (c.capital || 1)) * 100}%"></span>`;
  return `<section class="card slider" aria-labelledby="ret-h" data-testid="retention-panel">
    <div class="inline" style="justify-content:space-between"><h2 id="ret-h">Keep in ACN <span class="note">(Direct ACN)</span></h2><span class="badge muted">Preview</span></div>
    <input type="range" id="retain-range" min="0" max="100" step="1" value="${Math.round(p * 100)}" data-input="retain-range" aria-label="Keep in ACN, percent" aria-valuetext="${pct(p)} direct ACN" data-testid="retain-range">
    <div class="inline">
      <button class="btn" data-act="retain-set" data-value="0" data-testid="retain-0">0%</button>
      <div class="field" style="margin:0;flex:1;min-width:120px"><label for="retain-num" class="sr-only">Keep in ACN, percent</label>
        <input type="text" inputmode="decimal" id="retain-num" data-input="retain-num" value="${+(p * 100).toFixed(2)}" aria-describedby="retain-err" data-testid="retain-num" ${S.ui.errors['retain-num'] ? 'aria-invalid="true"' : ''}></div>
      <button class="btn" data-act="retain-set" data-value="100" data-testid="retain-100">100%</button>
    </div>
    ${S.ui.errors['retain-num'] ? `<div class="field"><span class="err" id="retain-err">${esc(S.ui.errors['retain-num'])}</span></div>` : ''}
    <div class="split-bar" aria-hidden="true">${['acn', 'innovation', 'core', 'bills'].map(seg).join('')}</div>
    <div class="legend" id="split-readout" data-testid="split-readout">${['acn', 'innovation', 'core', 'bills'].map((k) => `<span><i class="sw-${k}"></i>${SLEEVE_LABELS[k]} <strong class="num" data-testid="split-${k}">${money(d[k])}</strong></span>`).join('')}</div>
    ${mixPicker(c, 'Mix for the diversified portion')}
    <p class="note">Moving the slider is a preview. It never changes the 100% ACN or 100% Diversified portfolios and never places a trade. Use “Track this version” to start a separately dated paper run.</p>
  </section>`;
}

function mixPicker(c, label) {
  const showRef = c.tab.ui.showReference || c.a.mixKey === 'm60';
  return `<div class="field"><span class="lbl" id="mix-lbl-${c.route.section}">${esc(label)} — innovation share</span>
    <div class="seg small" role="group" aria-labelledby="mix-lbl-${c.route.section}" data-testid="mix-picker">
      ${MAIN_MIXES.map((k) => `<button data-act="mix" data-value="${k}" aria-pressed="${c.a.mixKey === k}" data-testid="mix-${k}">${MIXES[k].label}</button>`).join('')}
      ${showRef ? `<button data-act="mix" data-value="m60" aria-pressed="${c.a.mixKey === 'm60'}" data-testid="mix-m60">60% ref.</button>` : ''}
    </div>
    <button class="linkbtn" data-act="toggle-ref" data-testid="toggle-ref" style="justify-self:start">${showRef ? 'Hide higher-risk reference' : 'Show higher-risk reference'}</button>
    ${c.a.mixKey === 'm60' ? '<span class="badge warn">Original 60% higher-risk reference</span>' : ''}
  </div>`;
}

// ---------------------------------------------------------------- projections
function shortMoney(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function numField(id, label, value, { hint = '', badge = '' } = {}) {
  const err = S.ui.errors[id];
  return `<div class="field"><label for="${id}">${esc(label)} ${badge}</label>
    <input type="text" inputmode="decimal" id="${id}" data-input="field" data-field="${id.replace('f-', '')}" value="${esc(value)}" ${err ? `aria-invalid="true" aria-describedby="${id}-err"` : ''} data-testid="${id}">
    ${err ? `<span class="err" id="${id}-err" role="alert">${esc(err)}</span>` : hint ? `<span class="note">${hint}</span>` : ''}</div>`;
}
const pctVal = (v) => +(v * 100).toFixed(4);
const moneyVal = (v) => (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function pathPicker(c) {
  return `<div class="field"><span class="lbl" id="path-lbl">Market path</span><div class="seg small" role="group" aria-labelledby="path-lbl" data-testid="path-picker">
    ${PATH_ORDER.map((k) => `<button data-act="path" data-value="${k}" aria-pressed="${c.a.pathKey === k}" data-testid="path-${k}">${MARKET_PATHS[k].label}</button>`).join('')}</div></div>`;
}

function assumptionFields(c, { acn = c.p > 0, spending = true } = {}) {
  const flat = c.a.acnReturn === 0;
  return `<div class="fields">
    ${acn ? numField('f-acnReturn', 'ACN annual total return, %', pctVal(c.a.acnReturn), { badge: flat ? '<span class="badge warn" data-testid="flat-badge">Flat illustration</span>' : '<span class="badge muted">Your what-if</span>', hint: 'Your what-if, not a forecast for the company.' }) : ''}
    ${spending ? numField('f-draw', 'First-year spending, $', moneyVal(c.a.draw), { hint: 'Paid at year-end, grows with inflation.' }) : ''}
    ${spending ? numField('f-inflation', 'Inflation, %', pctVal(c.a.inflation)) : ''}
    ${spending ? numField('f-fee', 'Annual fee, %', pctVal(c.a.fee)) : ''}
  </div>`;
}

function projectionsHTML(c) {
  const pj = projection(c);
  const h = c.tab.ui.horizon || 20;
  const real = !!c.tab.ui.real;
  const compare = c.isAcn && !!c.tab.ui.compare;
  if (pj.error) return `${hero(c, { value: '—', meta: openingMeta(c) })}<div class="notice bad">${esc(pj.error)}</div>${controlsCard(c)}`;
  const row = pj.rows[h];
  const val = real ? row.real : row.end;
  const dep = depletionYear(pj.rows);
  const meta = [...openingMeta(c), `Gross rate <strong class="num" data-testid="gross-rate">${pct(pj.rate)}</strong>`, 'Pre-investment-tax planning assumption', `Forecast from ${esc(formatDateTime(c.b.createdAt))}; market refreshes do not change it`];
  if (c.p > 0) meta.push(`ACN return ${pct(c.a.acnReturn)} ${c.a.acnReturn === 0 ? '<span class="badge warn">Flat illustration</span>' : '(your what-if)'}`);
  const valueNote = `Year ${h} ${real ? 'balance in starting-year dollars' : 'nominal balance'}${dep ? ` · <span class="badge bad">Depleted in year ${dep}</span>` : ''}${row.cumShortfall > 0 ? ` · unfunded ${money(row.cumShortfall)}` : ''}`;
  const actions = `<button class="btn ghost" data-act="export-projection" data-testid="export-projection">Export CSV</button>`;

  const series = [];
  const pick = (rows) => rows.slice(0, h + 1).map((r) => ({ x: r.year, y: real ? r.real : r.end, xLabel: `Year ${r.year}` }));
  if (compare) {
    for (const [name, p] of [['100% ACN', 1], ['100% Diversified', 0], [`Custom ${pct(c.tab.customRetain)} ACN`, c.tab.customRetain]]) {
      const x = projection(c, p);
      if (!x.error) series.push({ name, points: pick(x.rows) });
    }
  } else series.push({ name: c.label, points: pick(pj.rows) });
  const chart = lineChart(series, {
    id: 'proj-chart', ariaLabel: `Projected ${real ? 'real' : 'nominal'} balance by year`, yFmt: money, yTickFmt: shortMoney,
    xTickFmt: (x) => `Y${x}`, xTicks: [0, ...HORIZON_MARKERS.filter((m) => m <= h)], zeroBase: true,
  });

  const table = `<div class="table-wrap"><table class="stack" data-testid="projection-table"><thead><tr><th>Year</th><th class="n">${real ? 'Balance (start-year $)' : 'Nominal balance'}</th><th class="n">${real ? 'Nominal balance' : 'Balance (start-year $)'}</th><th class="n">Cumulative withdrawals</th><th class="n">Funding shortfall</th></tr></thead><tbody>
    ${HORIZON_MARKERS.map((y) => { const r = pj.rows[y]; return `<tr class="${y === h ? 'sel' : ''}" data-testid="proj-row-${y}"><td class="first" data-label="Year">Year ${y}</td><td class="n" data-label="${real ? 'Real' : 'Nominal'}">${money(real ? r.real : r.end)}</td><td class="n" data-label="${real ? 'Nominal' : 'Real'}">${money(real ? r.end : r.real)}</td><td class="n" data-label="Withdrawn">${money(r.cumPaid)}</td><td class="n" data-label="Shortfall">${r.cumShortfall > 0 ? `<span class="chg-neg">${money(r.cumShortfall)}</span>` : money(0)}</td></tr>`; }).join('')}
  </tbody></table></div>`;

  const be = c.isAcn && c.view === 'acn' ? breakEvenCard(c) : '';
  return `
    ${hero(c, { value: `<span class="num">${money(val)}</span>`, valueNote, meta, actions })}
    <div class="grid side">
      <section class="card" aria-labelledby="pj-h">
        <h2 id="pj-h">Projection</h2>
        <div class="inline" style="justify-content:space-between">
          <div class="seg small" role="group" aria-label="Horizon" data-testid="horizon">${HORIZON_MARKERS.map((y) => `<button data-act="horizon" data-value="${y}" aria-pressed="${h === y}" data-testid="horizon-${y}">${y}y</button>`).join('')}</div>
          <div class="seg small" role="group" aria-label="Dollars" data-testid="real-switch"><button data-act="real" data-value="0" aria-pressed="${!real}" data-testid="nominal">Nominal</button><button data-act="real" data-value="1" aria-pressed="${real}" data-testid="real">Starting-year $</button></div>
        </div>
        ${c.isAcn ? `<div class="inline"><button class="btn ${compare ? 'teal' : ''}" data-act="compare" aria-pressed="${compare}" data-testid="compare-toggle">${compare ? 'Hide comparison' : 'Compare all three on common axes'}</button></div>` : ''}
        ${chart}
        ${table}
        <p class="note">Annual flows at year-end; weights rebalanced annually to target. Pre-investment-tax. No sale taxes are inferred${c.b.mode === 'placeholder' ? ', especially not from the placeholder' : ''}.</p>
      </section>
      ${controlsCard(c)}
    </div>
    ${be}`;
}

function controlsCard(c) {
  return `<section class="card" aria-labelledby="as-h"><h2 id="as-h">Assumptions — ${esc(TABS[c.route.tab].label)}</h2>
    ${pathPicker(c)}
    ${c.p < 1 || c.isAcn ? mixPicker(c, c.view === 'acn' ? 'Comparison mix (for break-even)' : 'Research mix') : ''}
    ${assumptionFields(c)}
    <p class="note">Research weights are fixed. ${c.isAcn ? 'All three My ACN strategies use the same capital, start date, cash flows, fee and mix.' : 'Each proceeds tab keeps its own inputs.'}</p>
  </section>`;
}

function breakEvenCard(c) {
  let be;
  try { be = breakEvenAcnReturn({ capital: c.capital, mixKey: c.a.mixKey, pathKey: c.a.pathKey, fee: c.a.fee, draw: c.a.draw, inflation: c.a.inflation }); } catch (e) { return ''; }
  return `<section class="card" style="margin-top:14px" data-testid="break-even"><h2>Break-even ACN return</h2>
    <p>To match the <strong>${MIXES[c.a.mixKey].label}</strong> mix on the <strong>${MARKET_PATHS[c.a.pathKey].label}</strong> path under identical fees and cash flows, ACN would need an annual total return of <strong class="num" data-testid="break-even-value">${pct(be)}</strong>.</p>
    <p class="note">The reference terminal's short-term targets are not extrapolated over 20 years.</p></section>`;
}

// ---------------------------------------------------------------- downside
function downsideHTML(c) {
  const a = c.a;
  let results;
  try { results = SHOCK_ORDER.map((k) => ({ k, ...shockResult({ capital: c.capital, p: c.p, mixKey: a.mixKey, shockKey: k, acnShock: a.acnShock }) })); } catch (e) { return `<div class="notice bad">${esc(e.message)}</div>`; }
  const sel = results.find((r) => r.k === a.shockKey) || results[0];
  let el = null;
  let elErr = null;
  try {
    el = earlyLate({ capital: c.capital, baseRate: grossRate({ p: c.p, mixKey: a.mixKey, pathKey: a.pathKey, acnReturn: a.acnReturn }), shockPct: sel.pct, fee: a.fee, draw: a.draw, inflation: a.inflation });
  } catch (e) { elErr = e.message; }
  const meta = [...openingMeta(c), `Instantaneous shock before spending and fees`, `Loss <strong class="num chg-neg" data-testid="shock-loss-pct">${pct(sel.lossPct)}</strong> · <strong class="num chg-neg" data-testid="shock-loss-dollars">${money(sel.dollarLoss)}</strong>`];
  if (c.p > 0) meta.push(`ACN price shock ${pct(a.acnShock)} <span class="badge warn">Illustration</span>`);
  const table = `<div class="table-wrap"><table class="stack" data-testid="shock-table"><thead><tr><th>Scenario</th><th class="n">% loss</th><th class="n">$ loss</th><th class="n">Remaining</th></tr></thead><tbody>
    ${results.map((r) => `<tr class="${r.k === sel.k ? 'sel' : ''}"><td class="first" data-label="Scenario"><button class="rowbtn" data-act="shock" data-value="${r.k}" aria-pressed="${r.k === sel.k}" data-testid="shock-${r.k}">${SHOCKS[r.k].label}</button><span class="sub">Innovation ${pct(SHOCKS[r.k].innovation, { digits: 0 })}, core ${pct(SHOCKS[r.k].core, { digits: 0 })}, extra bills flat${c.p > 0 ? `, ACN ${pct(a.acnShock, { digits: 0 })}` : ''}</span></td><td class="n" data-label="% loss">${pct(r.lossPct)}</td><td class="n" data-label="$ loss">${money(r.dollarLoss)}</td><td class="n" data-label="Remaining">${money(r.remaining)}</td></tr>`).join('')}
  </tbody></table></div>`;
  let elHTML = `<div class="notice bad">${esc(elErr || '')}</div>`;
  if (el) {
    const real = !!c.tab.ui.real;
    const pts = (rows) => rows.map((r) => ({ x: r.year, y: real ? r.real : r.end, xLabel: `Year ${r.year}` }));
    const chart = lineChart([{ name: 'Shock in year 1 (early)', points: pts(el.early) }, { name: 'Shock in year 20 (late)', points: pts(el.late) }], {
      id: 'shock-chart', ariaLabel: 'Early versus late shock balances', yFmt: money, yTickFmt: shortMoney, xTickFmt: (x) => `Y${x}`, xTicks: [0, 5, 10, 15, 20], zeroBase: true,
    });
    const e20 = el.early[20];
    const l20 = el.late[20];
    elHTML = `${chart}<dl class="kv" data-testid="early-late">
      <dt>Early shock, year 20</dt><dd>${money(real ? e20.real : e20.end)}${depletionYear(el.early) ? ` <span class="badge bad">Depleted Y${depletionYear(el.early)}</span>` : ''}</dd>
      <dt>Late shock, year 20</dt><dd>${money(real ? l20.real : l20.end)}${depletionYear(el.late) ? ` <span class="badge bad">Depleted Y${depletionYear(el.late)}</span>` : ''}</dd>
      <dt>Withdrawals paid, early</dt><dd>${money(e20.cumPaid)}</dd>
      <dt>Withdrawals paid, late</dt><dd>${money(l20.cumPaid)}</dd>
      <dt>Unfunded, early</dt><dd>${money(e20.cumShortfall)}</dd>
      <dt>Unfunded, late</dt><dd>${money(l20.cumShortfall)}</dd></dl>
      <p class="note">Same one-year ${pct(sel.lossPct)} shock and 19 base years at ${pct(grossRate({ p: c.p, mixKey: a.mixKey, pathKey: a.pathKey, acnReturn: a.acnReturn }))}, identical withdrawals; only the order differs. ${real ? 'Starting-year dollars.' : 'Nominal dollars.'}</p>`;
  }
  return `
    ${hero(c, { value: `<span class="num">${money(sel.remaining)}</span>`, valueNote: `Remaining after <strong>${SHOCKS[sel.k].label}</strong>`, meta })}
    <div class="grid side">
      <section class="card" aria-labelledby="sh-h"><h2 id="sh-h">Instant shocks</h2>${table}
        ${c.p > 0 ? `<div class="fields">${numField('f-acnShock', 'ACN price shock, %', pctVal(a.acnShock), { badge: '<span class="badge warn">Illustration</span>', hint: 'Separate input — ACN is never assumed to move like the innovation sleeve.' })}</div>` : ''}
      </section>
      <section class="card" aria-labelledby="el-h"><h2 id="el-h">Early vs late shock</h2>
        <div class="seg small" role="group" aria-label="Dollars"><button data-act="real" data-value="0" aria-pressed="${!c.tab.ui.real}">Nominal</button><button data-act="real" data-value="1" aria-pressed="${!!c.tab.ui.real}">Starting-year $</button></div>
        ${elHTML}
      </section>
    </div>
    <div style="margin-top:14px">${controlsCard(c)}</div>`;
}

// ---------------------------------------------------------------- dialogs
function dialogEl() {
  let d = $('#dlg');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlg'; document.body.appendChild(d); d.addEventListener('close', () => { d.innerHTML = ''; }); }
  return d;
}
function openDialog(html, bind) {
  const d = dialogEl();
  d.innerHTML = `<div class="dlg">${html}</div>`;
  if (!d.open) d.showModal();
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  if (bind) bind(d);
  const first = d.querySelector('[autofocus], input, select, button');
  if (first) first.focus();
}
function closeDialog() { const d = $('#dlg'); if (d && d.open) d.close(); }

function openPositionDialog() {
  const c = ctxFor(parseRoute());
  const tab = c.tab;
  const acnQ = effectiveQuotes().ACN;
  const st = { mode: 'amount', anchorSource: 'user' };
  const today = nyDate(new Date().toISOString());
  openDialog(`<h2>Update my ACN position</h2>
    <p class="note">Enter one: an opening dollar amount, or your actual share count with an as-of date and ACN reference price. After you preview and confirm, a new dated baseline starts; the earlier paper run, history and other tabs stay intact.</p>
    <div class="seg small" role="group" aria-label="Input mode"><button type="button" data-mode="amount" aria-pressed="true" data-testid="mode-amount">Opening amount</button><button type="button" data-mode="shares" aria-pressed="false" data-testid="mode-shares">Share count</button></div>
    <div data-pane="amount">
      <div class="field"><label for="d-amount">Opening amount, $</label><input type="text" inputmode="decimal" id="d-amount" placeholder="e.g. 812,345.67" data-testid="d-amount" autocomplete="off"></div>
      <p class="note">Shares are derived once as amount ÷ ACN anchor price${isValuable(acnQ) ? ` (latest ${formatUSD(acnQ.price)}, ${esc(STATUS_LABELS[acnQ.status])})` : ' when a verified price is available'}.</p>
    </div>
    <div data-pane="shares" class="hidden">
      <div class="fields">
        <div class="field"><label for="d-shares">Actual ACN shares</label><input type="text" inputmode="decimal" id="d-shares" data-testid="d-shares" autocomplete="off"></div>
        <div class="field"><label for="d-date">As-of date</label><input type="date" id="d-date" max="${today}" value="${today}" data-testid="d-date"></div>
        <div class="field"><label for="d-price">ACN reference price, $</label><input type="text" inputmode="decimal" id="d-price" data-testid="d-price" autocomplete="off"></div>
      </div>
      ${isValuable(acnQ) ? `<button type="button" class="linkbtn" data-use-quote data-testid="use-quote">Use latest verified ACN price (${formatUSD(acnQ.price)}, ${esc(formatDateTime(acnQ.marketTs))})</button>` : '<p class="note">No verified ACN price is available; enter the reference price yourself.</p>'}
    </div>
    <div class="notice info" id="d-preview" data-testid="d-preview" aria-live="polite">Enter a value to preview.</div>
    <div class="foot"><button class="btn" data-close data-testid="d-cancel">Cancel</button><button class="btn primary" id="d-confirm" disabled data-testid="d-confirm">Confirm new baseline</button></div>`, (d) => {
    let pv = null;
    let input = null;
    const update = () => {
      input = null;
      pv = null;
      const box = d.querySelector('#d-preview');
      if (st.mode === 'amount') {
        const m = parseMoney(d.querySelector('#d-amount').value, { allowZero: false });
        if (!m.ok) { box.textContent = m.error; box.className = 'notice'; d.querySelector('#d-confirm').disabled = true; return; }
        input = { mode: 'amount', amount: m.value };
      } else {
        const sh = parseQuantity(d.querySelector('#d-shares').value);
        const pr = parsePrice(d.querySelector('#d-price').value);
        const date = d.querySelector('#d-date').value;
        const err = !sh.ok ? sh.error : !pr.ok ? pr.error : !date ? 'Enter the as-of date.' : null;
        if (err) { box.textContent = err; box.className = 'notice'; d.querySelector('#d-confirm').disabled = true; return; }
        input = { mode: 'shares', shares: sh.value, anchorPrice: pr.value, anchorDate: date, anchorSource: st.anchorSource };
      }
      pv = previewBaseline(tab, input, new Date().toISOString(), acnQ);
      if (pv.error) { box.textContent = pv.error; box.className = 'notice'; d.querySelector('#d-confirm').disabled = true; return; }
      box.className = 'notice info';
      box.innerHTML = input.mode === 'amount'
        ? `New opening capital <strong class="num">${money(pv.capital)}</strong> for all three views. ${pv.estimatedShares ? `≈ <strong class="num">${formatUnits(pv.estimatedShares, 6)}</strong> ACN shares at ${formatUSD(pv.anchorPrice)} (derived once).` : 'ACN units will be fixed when a verified price arrives.'}`
        : `<strong class="num">${formatUnits(pv.shares, 6)}</strong> shares × ${formatUSD(pv.anchorPrice)} = opening capital <strong class="num">${money(pv.capital)}</strong> as of ${esc(input.anchorDate)} (${st.anchorSource === 'verified' ? 'verified price' : 'your entered price'}).`;
      d.querySelector('#d-confirm').disabled = false;
    };
    d.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      st.mode = b.dataset.mode;
      d.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      d.querySelector('[data-pane="amount"]').classList.toggle('hidden', st.mode !== 'amount');
      d.querySelector('[data-pane="shares"]').classList.toggle('hidden', st.mode !== 'shares');
      update();
    }));
    d.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => { if (i.id === 'd-price') st.anchorSource = 'user'; update(); }));
    const uq = d.querySelector('[data-use-quote]');
    if (uq) uq.addEventListener('click', () => { d.querySelector('#d-price').value = String(acnQ.price); d.querySelector('#d-date').value = nyDate(acnQ.marketTs); st.anchorSource = 'verified'; update(); });
    d.querySelector('#d-confirm').addEventListener('click', () => {
      if (!input || !pv || pv.error) return;
      const next = commitBaseline(S.tabs.myacn, input, new Date().toISOString(), effectiveQuotes());
      saveTab(next);
      d.close();
      announce('New dated baseline started. Earlier runs are preserved.');
      render();
    });
  });
}

function openProceedsDialog({ restore = false } = {}) {
  const c = ctxFor(parseRoute());
  const t = TABS[c.route.tab];
  const b = c.b;
  const init = restore ? { capital: t.capital, deductions: 0, cashOutside: 0 } : { capital: b.capital, deductions: b.deductions || 0, cashOutside: b.cashOutside || 0 };
  openDialog(`<h2>${restore ? `Restore ${esc(t.label)} default` : `Edit ${esc(t.label)} opening amount`}</h2>
    <p class="note">${restore ? `Restores the preset ${money(t.capital)} with no deductions. ` : ''}Starts a new dated baseline after you confirm; earlier runs and the other three tabs are untouched. The presets already reflect a modeled legal fee and interest-tax reserve; future benefits are excluded.</p>
    <div class="fields">
      <div class="field"><label for="p-cap">Opening amount, $</label><input type="text" inputmode="decimal" id="p-cap" value="${moneyVal(init.capital)}" data-testid="p-cap" ${restore ? 'readonly' : ''}></div>
      <div class="field"><label for="p-ded">Remaining deductions, $</label><input type="text" inputmode="decimal" id="p-ded" value="${moneyVal(init.deductions)}" data-testid="p-ded" ${restore ? 'readonly' : ''}></div>
      <div class="field"><label for="p-out">Cash kept outside, $</label><input type="text" inputmode="decimal" id="p-out" value="${moneyVal(init.cashOutside)}" data-testid="p-out" ${restore ? 'readonly' : ''}></div>
    </div>
    <div class="notice info" id="p-preview" data-testid="p-preview" aria-live="polite"></div>
    <div class="foot"><button class="btn" data-close data-testid="p-cancel">Cancel</button><button class="btn primary" id="p-confirm" data-testid="p-confirm">${restore ? 'Restore default' : 'Confirm new baseline'}</button></div>`, (d) => {
    let input = null;
    const update = () => {
      input = null;
      const box = d.querySelector('#p-preview');
      const cap = parseMoney(d.querySelector('#p-cap').value, { allowZero: false });
      const ded = parseMoney(d.querySelector('#p-ded').value);
      const out = parseMoney(d.querySelector('#p-out').value);
      const err = !cap.ok ? cap.error : !ded.ok ? `Deductions: ${ded.error}` : !out.ok ? `Cash kept outside: ${out.error}` : null;
      if (err) { box.className = 'notice'; box.textContent = err; d.querySelector('#p-confirm').disabled = true; return; }
      const pv = previewBaseline(c.tab, { capital: cap.value, deductions: ded.value, cashOutside: out.value }, new Date().toISOString());
      if (pv.error) { box.className = 'notice'; box.textContent = pv.error; d.querySelector('#p-confirm').disabled = true; return; }
      input = { capital: cap.value, deductions: ded.value, cashOutside: out.value, restore };
      box.className = 'notice info';
      box.innerHTML = `Investable opening capital <strong class="num">${money(pv.investable)}</strong>.`;
      d.querySelector('#p-confirm').disabled = false;
    };
    d.querySelectorAll('input').forEach((i) => i.addEventListener('input', update));
    update();
    d.querySelector('#p-confirm').addEventListener('click', () => {
      if (!input) return;
      saveTab(commitBaseline(S.tabs[c.route.tab], input, new Date().toISOString(), effectiveQuotes()));
      d.close();
      announce(restore ? 'Default restored as a new dated baseline.' : 'New dated baseline started.');
      render();
    });
  });
}

function openTrackDialog() {
  const c = ctxFor(parseRoute());
  const p = c.strategy === 'custom' ? c.tab.customRetain : c.p;
  const label = c.strategy === 'custom' ? `Custom Split — ${pct(p)} direct ACN, ${MIXES[c.a.mixKey].label} mix` : `${c.label} — ${MIXES[c.a.mixKey].label} mix`;
  openDialog(`<h2>Track this version?</h2>
    <p>Start a separately dated paper run: <strong>${esc(label)}</strong> with opening capital <strong class="num">${money(c.capital)}</strong>, anchored at the latest verified prices${c.isAcn ? ', plus a hold-all ACN benchmark with the same capital, anchor and timestamp' : ''}.</p>
    <p class="note">Earlier runs are preserved. This is a simulation — nothing is bought or sold.</p>
    <div class="foot"><button class="btn" data-close data-testid="track-cancel">Cancel</button><button class="btn teal" id="t-confirm" data-testid="track-confirm">Start tracking</button></div>`, (d) => {
    d.querySelector('#t-confirm').addEventListener('click', () => {
      const tab = trackVersion(S.tabs[c.route.tab], { strategy: c.strategy, p, mixKey: c.a.mixKey }, new Date().toISOString(), effectiveQuotes());
      saveTab(tab);
      d.close();
      announce('New paper run started.');
      location.hash = href({ ...c.route, runId: null });
      render();
    });
  });
}

function openHoldingDialog(symbol) {
  const c = ctxFor(parseRoute());
  const eq = effectiveQuotes();
  const { run } = todayRun(c);
  const v = valueRun(run, eq);
  const h = v.holdings.find((x) => x.symbol === symbol);
  if (!h) return;
  const inst = INSTRUMENTS[symbol];
  const q = eq[symbol];
  const m = S.profile.manualQuotes?.[symbol];
  const today = nyDate(new Date().toISOString());
  openDialog(`<h2>${esc(symbol)} — ${esc(inst.name)}</h2>
    ${inst.proxyFor ? `<p class="note">Illustrative tracking instrument for “${esc(inst.proxyFor)}”. Verify instrument identity with the issuer.</p>` : ''}
    <dl class="kv" data-testid="holding-detail">
      <dt>Sleeve(s)</dt><dd>${esc(h.sleeves.map((s) => SLEEVE_LABELS[s]).join(' + '))}</dd>
      <dt>Weight</dt><dd>${pct(h.weight, { digits: 3 })}</dd>
      <dt>Opening dollars</dt><dd>${money(h.openingDollars)}</dd>
      <dt>Units</dt><dd data-testid="detail-units">${h.units === null ? 'Awaiting anchor price' : formatUnits(h.units, 8)}${symbol === 'ACN' && run.unitsBasis === 'estimated' ? ' (Estimated)' : ''}</dd>
      <dt>Anchor</dt><dd class="wrap">${h.anchor ? `${formatUSD(h.anchor.price)} · ${esc(formatDateTime(h.anchor.marketTs))} · ${esc(h.anchor.source)}${h.anchor.splitAdjusted ? ' · split-adjusted' : ''}` : '—'}</dd>
      <dt>Latest mark</dt><dd data-testid="detail-mark">${isValuable(q) ? formatUSD(q.price) : '—'}</dd>
      <dt>Status</dt><dd class="wrap">${esc(STATUS_LABELS[q?.status || 'unavailable'])}${q?.entitlement ? ` · ${esc(q.entitlement)} entitlement` : ''}</dd>
      <dt>Market time</dt><dd>${esc(formatDateTime(q?.marketTs))}</dd>
      <dt>Fetched</dt><dd>${esc(formatDateTime(q?.fetchedAt))}</dd>
      <dt>Source / venue</dt><dd class="wrap">${esc(q?.source || '—')} · ${esc(q?.venue || inst.venue)} · ${esc(q?.currency || 'USD')}</dd>
      <dt>Market value</dt><dd>${h.value === null ? '—' : money(h.value)}</dd>
      <dt>Price P&amp;L</dt><dd class="${signCls(h.pnl)}">${h.pnl === null ? '—' : `${formatUSD(h.pnl, { sign: true })} (${pct(h.pnlPct, { sign: true })})`}</dd>
    </dl>
    <h3 style="margin-top:14px">Dated manual quote</h3>
    <p class="note">Use when the provider has no verified price. Shown as “Manual” everywhere.</p>
    <div class="fields">
      <div class="field"><label for="m-price">Price, $</label><input type="text" inputmode="decimal" id="m-price" value="${m ? m.price : ''}" data-testid="m-price"></div>
      <div class="field"><label for="m-date">As-of date</label><input type="date" id="m-date" max="${today}" value="${m ? m.date : today}" data-testid="m-date"></div>
    </div>
    <span class="err" id="m-err" role="alert"></span>
    <div class="foot">${m ? '<button class="btn ghost" id="m-clear" data-testid="m-clear">Remove manual quote</button>' : ''}<button class="btn" data-close data-testid="holding-close">Close</button><button class="btn primary" id="m-save" data-testid="m-save">Save manual quote</button></div>`, (d) => {
    d.querySelector('#m-save').addEventListener('click', () => {
      const pr = parsePrice(d.querySelector('#m-price').value);
      const date = d.querySelector('#m-date').value;
      if (!pr.ok || !date || date > today) { d.querySelector('#m-err').textContent = !pr.ok ? pr.error : 'Enter a date that is not in the future.'; return; }
      S.profile = { ...S.profile, manualQuotes: { ...S.profile.manualQuotes, [symbol]: { price: pr.value, date, enteredAt: new Date().toISOString() } } };
      saveProfile();
      afterQuotes();
      d.close();
      render();
    });
    const clr = d.querySelector('#m-clear');
    if (clr) clr.addEventListener('click', () => {
      const mq = { ...S.profile.manualQuotes };
      delete mq[symbol];
      S.profile = { ...S.profile, manualQuotes: mq };
      saveProfile();
      d.close();
      render();
    });
  });
}

function openAbout() {
  openDialog(`<h2>About &amp; disclosures</h2>
    <ul>
      <li>This is a private planning simulator. It has no brokerage connection and never places trades.</li>
      <li><strong>Today</strong> is a paper portfolio valued from observed prices with units fixed at a dated anchor. <strong>Projections</strong> and <strong>Downside</strong> use planning assumptions and do not change when prices refresh.</li>
      <li>Forecasts are nominal, pre-investment-tax, with annual year-end withdrawals and annual rebalancing. No sale taxes are inferred.</li>
      <li>The ACN return assumption is your what-if, not a forecast for the company. The default 0% is a flat illustration.</li>
      <li>ETFs (VTI, VXUS, BND, VTIP, VIG, SGOV) are illustrative tracking instruments for the research categories. Broad index funds can contain ACN or other individual holdings indirectly; “Direct ACN” counts only the direct position.</li>
      <li>The Low, Central and High presets already reflect a modeled legal fee and interest-tax reserve and exclude future benefits. Balances across tabs are never added together.</li>
      <li>Price return excludes dividends, ETF distributions, fees and taxes. Total return uses verified distributions only; missing data is shown as unavailable.</li>
      <li>Times display in America/New_York.</li>
    </ul>
    <div class="foot"><button class="btn primary" data-close>Close</button></div>`);
}

function openWeights() {
  const c = ctxFor(parseRoute());
  const mixRows = Object.values(MIXES).map((m) => `<tr class="${m.key === c.a.mixKey ? 'sel' : ''}"><td>${esc(m.label)}</td><td class="n">${pct(m.innovation, { digits: 0 })}</td><td class="n">${pct(m.core, { digits: 0 })}</td><td class="n">${pct(m.bills, { digits: 0 })}</td></tr>`).join('');
  const cons = (s) => SLEEVE_CONSTITUENTS[s].map((x) => `<tr><td>${esc(x.symbol)}<span class="sub">${esc(x.category || INSTRUMENTS[x.symbol].name)}</span></td><td class="n">${pct(x.w, { digits: 0 })}</td></tr>`).join('');
  openDialog(`<h2>Research weights (read-only)</h2>
    <h3>Diversified portion</h3>
    <div class="table-wrap"><table><thead><tr><th>Mix</th><th class="n">Innovation</th><th class="n">Core</th><th class="n">Extra bills</th></tr></thead><tbody>${mixRows}</tbody></table></div>
    <div class="grid two" style="margin-top:10px"><div><h3>Innovation sleeve</h3><table>${cons('innovation')}</table></div><div><h3>Core sleeve</h3><table>${cons('core')}</table><h3 style="margin-top:10px">Extra short T-bills</h3><table>${cons('bills')}</table></div></div>
    <p class="note">Target dollars = opening capital × (1 − direct ACN) × sleeve weight × within-sleeve weight. Duplicate tickers (SGOV) are combined for prices; both sleeve contributions stay in the breakdown.</p>
    <div class="foot"><button class="btn primary" data-close>Close</button></div>`);
}

function openSources() {
  const prov = S.quoteMeta.provider?.providers?.map((p) => p.name).join(', ') || (S.health?.quoteProvider || []).join(', ') || 'None configured';
  openDialog(`<h2>Data sources</h2>
    <dl class="kv"><dt>Quote providers</dt><dd class="wrap">${esc(prov)}</dd><dt>Distribution history</dt><dd class="wrap">${S.health?.historyConfigured ? 'Configured' : 'Not configured — total return unavailable'}</dd><dt>Last refresh</dt><dd>${esc(formatDateTime(S.quoteMeta.refreshedAt))}</dd></dl>
    <p class="note">Only ticker symbols are sent to market-data providers, from the server. “Live” appears only when the feed entitlement and timestamp support it; otherwise quotes are labelled delayed, market closed, cached, stale, manual or unavailable. BTC trades through weekends; U.S. equity close timestamps are kept intact.</p>
    <div class="foot"><button class="btn primary" data-close>Close</button></div>`);
}

function announce(msg) { const a = $('#announcer'); if (a) { a.textContent = ''; setTimeout(() => { a.textContent = msg; }, 30); } }

// ---------------------------------------------------------------- export
function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function exportHoldings() {
  const c = ctxFor(parseRoute());
  const eq = effectiveQuotes();
  const { run } = todayRun(c);
  const v = valueRun(run, eq);
  const basis = c.tab.returnBasis[c.basisKey] || 'price';
  const tr = basis === 'total' ? totalReturnFor(run, eq) : null;
  const csv = holdingsCSV({ scenario: TABS[c.route.tab].label, strategy: run.label, basis, asOf: new Date().toISOString(), valuation: v, runCreatedAt: run.createdAt, tr: tr && !tr.loading ? tr : null });
  download(`acn-simulator_${c.route.tab}_${c.strategy}_holdings_${nyDate(new Date().toISOString())}.csv`, csv);
}

function exportProjection() {
  const c = ctxFor(parseRoute());
  const pj = projection(c);
  if (pj.error) return;
  const csv = projectionCSV({ scenario: TABS[c.route.tab].label, strategy: c.strategy === 'custom' ? `Custom Split ${pct(c.p)} ACN` : c.label, startDate: c.b.createdAt, rate: pj.rate, rows: pj.rows, assumptions: c.a });
  download(`acn-simulator_${c.route.tab}_${c.strategy}_projection_${nyDate(new Date().toISOString())}.csv`, csv);
}

// ---------------------------------------------------------------- events
function mutateTab(fn) {
  const r = parseRoute();
  const t = S.tabs[r.tab];
  if (t.readOnly) return;
  saveTab(fn(t));
  render();
}

const actions = {
  refresh: () => refreshQuotes(),
  basis: (el) => mutateTab((t) => ({ ...t, returnBasis: { ...t.returnBasis, [el.dataset.key]: el.dataset.value } })),
  path: (el) => mutateTab((t) => ({ ...t, assumptions: { ...t.assumptions, pathKey: el.dataset.value } })),
  mix: (el) => mutateTab((t) => ({ ...t, assumptions: { ...t.assumptions, mixKey: el.dataset.value } })),
  'toggle-ref': () => mutateTab((t) => {
    const showing = t.ui.showReference || t.assumptions.mixKey === 'm60';
    if (!showing) return { ...t, ui: { ...t.ui, showReference: true } };
    // Hiding the reference while it is selected returns to the default 20% mix.
    return { ...t, ui: { ...t.ui, showReference: false }, assumptions: t.assumptions.mixKey === 'm60' ? { ...t.assumptions, mixKey: 'm20' } : t.assumptions };
  }),
  horizon: (el) => mutateTab((t) => ({ ...t, ui: { ...t.ui, horizon: Number(el.dataset.value) } })),
  real: (el) => mutateTab((t) => ({ ...t, ui: { ...t.ui, real: el.dataset.value === '1' } })),
  compare: () => mutateTab((t) => ({ ...t, ui: { ...t.ui, compare: !t.ui.compare } })),
  shock: (el) => mutateTab((t) => ({ ...t, assumptions: { ...t.assumptions, shockKey: el.dataset.value } })),
  'retain-set': (el) => { delete S.ui.errors['retain-num']; mutateTab((t) => ({ ...t, customRetain: Number(el.dataset.value) / 100 })); },
  track: () => openTrackDialog(),
  'open-position': () => openPositionDialog(),
  'open-proceeds': () => openProceedsDialog(),
  'restore-default': () => openProceedsDialog({ restore: true }),
  holding: (el) => openHoldingDialog(el.dataset.symbol),
  'export-holdings': () => exportHoldings(),
  'export-projection': () => exportProjection(),
  about: () => openAbout(),
  weights: () => openWeights(),
  sources: () => openSources(),
  signout: () => signOut(),
  conflict: (el) => {
    const data = sync.resolveConflict(el.dataset.key, el.dataset.choice);
    delete S.conflicts[el.dataset.key];
    if (data) { if (el.dataset.key === 'profile') S.profile = data; else S.tabs[el.dataset.key.slice(4)] = data; }
    render();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !$('#app').contains(el)) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  e.stopPropagation();
  fn(el);
});

const FIELD_PARSERS = {
  draw: (v) => parseMoney(v),
  inflation: (v) => parsePercent(v, { min: -50, max: 50 }),
  fee: (v) => parsePercent(v, { min: 0, max: 99.99 }),
  acnReturn: (v) => parsePercent(v, { min: -99.99, max: 100 }),
  acnShock: (v) => parsePercent(v, { min: -100, max: 100 }),
};

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!$('#app').contains(el)) return;
  if (el.type === 'text') el.dataset.dirty = '1';
  if (el.dataset.input === 'retain-range') {
    // Live preview without re-rendering the slider mid-drag.
    const t = S.tabs.myacn;
    S.tabs.myacn = { ...t, customRetain: Number(el.value) / 100 };
    el.setAttribute('aria-valuetext', `${el.value}% direct ACN`);
    const num = $('#retain-num');
    if (num) num.value = el.value;
    const c = ctxFor(parseRoute());
    const d = sleeveDollars(c.capital, S.tabs.myacn.customRetain, c.a.mixKey);
    for (const k of ['acn', 'innovation', 'core', 'bills']) { const s = document.querySelector(`[data-testid="split-${k}"]`); if (s) s.textContent = money(d[k]); }
    const bar = document.querySelector('.split-bar');
    if (bar) [...bar.children].forEach((sp, i) => { sp.style.width = `${(d[['acn', 'innovation', 'core', 'bills'][i]] / (c.capital || 1)) * 100}%`; });
    const sec = $('#section');
    if (sec) { sec.innerHTML = sectionHTML(c); bindCharts(sec); }
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (!$('#app').contains(el)) return;
  if (el.dataset.input === 'retain-range') { saveTab(S.tabs.myacn); render(); return; }
  if (el.dataset.input === 'retain-num') {
    const r = parsePercent(el.value, { min: 0, max: 100 });
    if (!r.ok) { S.ui.errors['retain-num'] = r.error; render(); return; }
    delete S.ui.errors['retain-num'];
    delete el.dataset.dirty;
    mutateTab((t) => ({ ...t, customRetain: r.value }));
    return;
  }
  if (el.dataset.input === 'run-select') {
    const r = parseRoute();
    location.hash = href({ ...r, runId: el.value || null });
    return;
  }
  if (el.dataset.input === 'field') {
    const key = el.dataset.field;
    const r = FIELD_PARSERS[key](el.value);
    const id = el.id;
    if (!r.ok) { S.ui.errors[id] = r.error; render(); return; }
    if (key === 'fee' && r.value >= 1) { S.ui.errors[id] = 'Fee must be below 100%.'; render(); return; }
    if ((key === 'acnReturn' || key === 'acnShock') && r.value <= -1) { S.ui.errors[id] = 'Enter a value above −100%.'; render(); return; }
    delete S.ui.errors[id];
    delete el.dataset.dirty;
    mutateTab((t) => ({ ...t, assumptions: { ...t.assumptions, [key]: r.value } }));
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const el = e.target;
  if (el.tagName === 'INPUT' && el.type === 'text' && $('#app').contains(el)) { el.dispatchEvent(new Event('change', { bubbles: true })); }
  const row = el.closest && el.closest('tr.clickable');
  if (row && el === row) actions.holding(row);
});

// ---------------------------------------------------------------- auth
function loginView() {
  const blocked = S.health && S.health.storage !== 'ready';
  return `<div class="login"><div class="card">
    <h1 style="font-size:1.3rem;color:var(--navy)">ACN Portfolio Simulator</h1>
    <p class="note">Private planning workspace. Sign in to your owner account to load your saved scenarios on this device.</p>
    ${blocked ? `<div class="notice bad" data-testid="storage-blocked"><strong>Account storage ${S.health.storage === 'blocked' ? 'is blocked' : 'needs an owner account'}.</strong> ${esc(S.health.storageStep || '')}</div>` : ''}
    <form id="login-form" novalidate>
      <div class="field"><label for="l-email">Email</label><input type="text" id="l-email" autocomplete="username" inputmode="email" data-testid="l-email"></div>
      <div class="field"><label for="l-pass">Password</label><input type="password" id="l-pass" autocomplete="current-password" data-testid="l-pass" style="min-height:44px;border:1px solid var(--line-strong);border-radius:9px;padding:0 12px"></div>
      <div class="err" id="l-err" role="alert" style="color:var(--bad);min-height:1.2em"></div>
      <button class="btn primary" type="submit" style="width:100%" data-testid="l-submit">Sign in</button>
    </form>
    <p class="note">Simulator only — no brokerage connection or trade execution.</p>
  </div></div>`;
}

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'login-form') return;
  e.preventDefault();
  const err = $('#l-err');
  err.textContent = '';
  try {
    const r = await api('POST', '/api/auth/login', { email: $('#l-email').value, password: $('#l-pass').value });
    if (r.status !== 200) { err.textContent = r.data?.error || `Sign-in failed (${r.status}).`; return; }
    await startApp(r.data.user);
  } catch {
    err.textContent = 'Cannot reach the server. Check your connection.';
  }
});

function handleSignedOut() {
  S.phase = 'login';
  render();
}

async function signOut() {
  try { await api('POST', '/api/auth/logout'); } catch { /* offline: still clear device data */ }
  sync.clearAll();
  try { localStorage.removeItem('acn:quotes'); } catch { /* storage unavailable */ }
  if ('caches' in window) { try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch { /* ignore */ } }
  S.tabs = {};
  S.profile = { manualQuotes: {} };
  S.user = null;
  S.conflicts = {};
  S.phase = 'login';
  render();
}

async function pullRemote() {
  if (!S.user || S.phase !== 'app') return;
  try {
    const r = await api('GET', '/api/records');
    if (r.status === 401) return handleSignedOut();
    if (r.status !== 200) return;
    S.offline = false;
    const changed = sync.applyServer(r.data.records);
    for (const k of changed) {
      if (k === 'profile') S.profile = sync.data.profile;
      else { const t = migrateTab(sync.data[k]); if (t) S.tabs[k.slice(4)] = t; }
    }
    if (changed.length) render();
    if (sync.queue.length) sync.reconnect();
  } catch { S.offline = true; renderSyncBadge(); }
}

async function startApp(user, { offline = false } = {}) {
  S.user = user;
  sync.setUser(user.id);
  sync.loadCache();
  S.offline = offline;
  if (!offline) {
    const r = await api('GET', '/api/records');
    if (r.status === 401) { S.phase = 'login'; render(); return; }
    if (r.status === 200) sync.applyServer(r.data.records);
  }
  try { const qc = JSON.parse(localStorage.getItem('acn:quotes') || 'null'); if (qc) S.quotes = qc; } catch { /* ignore */ }
  ensureTabs();
  S.phase = 'app';
  if (!location.hash) history.replaceState(null, '', href({ tab: 'myacn', view: 'acn', section: 'today' }));
  render();
  renderSyncBadge();
  if (!offline) { refreshQuotes(); if (sync.queue.length) sync.flush(); }
  startPolling();
}

async function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  try {
    const h = await fetch('/api/health', { cache: 'no-store' });
    S.health = await h.json();
  } catch {
    // Offline start: use this device's cache for the last signed-in owner.
    const last = Sync.lastUser();
    if (last) { await startApp({ id: last, email: '' }, { offline: true }); return; }
    S.phase = 'login';
    render();
    $('#l-err') && ($('#l-err').textContent = 'You appear to be offline and no saved copy is on this device.');
    return;
  }
  try {
    const me = await api('GET', '/api/auth/me');
    if (me.status === 200) return startApp(me.data.user);
  } catch { /* fall through */ }
  S.phase = 'login';
  render();
}

window.addEventListener('online', () => { S.offline = false; pullRemote(); refreshQuotes(); });
window.addEventListener('offline', () => { S.offline = true; render(); });

// Test/inspection hook (no personal data leaves the page).
window.__acnSim = { state: S, sync, render, refreshQuotes };

boot();
