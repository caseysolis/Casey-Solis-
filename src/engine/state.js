// Saved-state schema and pure state transitions shared by the UI and tests.
import { TABS, DEFAULTS, SCHEMA_VERSION, MY_ACN_VIEWS } from './constants.js';
import { createRun, anchorRun, newId } from './paper.js';

export function investable(b) {
  return b.capital - (b.deductions || 0) - (b.cashOutside || 0);
}

export function validateBaseline({ capital, deductions = 0, cashOutside = 0 }) {
  if (!(capital > 0)) return 'Opening amount must be greater than $0.';
  if (deductions < 0 || cashOutside < 0) return 'Deductions and cash kept outside cannot be negative.';
  if (deductions + cashOutside > capital) return 'Deductions and cash kept outside cannot exceed the opening amount.';
  return null;
}

function baselineRuns(tabKey, baseline, mixKey) {
  const cap = investable(baseline);
  const common = { createdAt: baseline.createdAt, baselineId: baseline.id, placeholder: baseline.mode === 'placeholder', kind: 'baseline' };
  if (tabKey === 'myacn') {
    const preset = baseline.mode === 'shares'
      ? { ACN: { units: baseline.shares, price: baseline.anchorPrice, marketTs: baseline.anchorTs, source: baseline.anchorSource, status: baseline.anchorSource === 'user' ? 'manual' : 'verified' } }
      : null;
    return [
      createRun({ ...common, strategy: 'acn', p: 1, mixKey, capital: cap, label: '100% ACN', unitsBasis: baseline.mode === 'placeholder' ? 'estimated' : baseline.mode === 'shares' ? 'actual' : 'derived', preset }),
      createRun({ ...common, strategy: 'diversified', p: 0, mixKey, capital: cap, label: '100% Diversified' }),
    ];
  }
  return [createRun({ ...common, strategy: 'diversified', p: 0, mixKey, capital: cap, label: `${TABS[tabKey].label} proceeds` })];
}

export function defaultTab(tabKey, nowIso) {
  const t = TABS[tabKey];
  if (!t) throw new RangeError(`Unknown tab ${tabKey}`);
  const baseline = {
    id: newId('bl'), createdAt: nowIso, mode: t.placeholder ? 'placeholder' : 'preset',
    capital: t.capital, deductions: 0, cashOutside: 0, shares: null, anchorPrice: null, anchorTs: null, anchorSource: null,
  };
  const runs = baselineRuns(tabKey, baseline, DEFAULTS.mix);
  return {
    schema: SCHEMA_VERSION,
    tabKey,
    startedAt: nowIso,
    baselines: [baseline],
    activeBaselineId: baseline.id,
    runs,
    selectedRun: { acn: runs.find((r) => r.strategy === 'acn')?.id || null, diversified: runs.find((r) => r.strategy === 'diversified').id, custom: null },
    assumptions: {
      mixKey: DEFAULTS.mix,
      pathKey: DEFAULTS.path,
      acnReturn: DEFAULTS.acnReturn,
      draw: t.draw,
      inflation: DEFAULTS.inflation,
      fee: DEFAULTS.fee,
      acnShock: DEFAULTS.acnShock,
      shockKey: DEFAULTS.shock,
    },
    customRetain: DEFAULTS.customRetain,
    returnBasis: { acn: 'price', diversified: 'price', custom: 'price', compare: 'price', proceeds: 'price' },
    ui: { horizon: DEFAULTS.horizon, real: false, compare: false, showReference: false },
  };
}

export function activeBaseline(tab) {
  return tab.baselines.find((b) => b.id === tab.activeBaselineId) || tab.baselines[tab.baselines.length - 1];
}

/**
 * Preview of a corrected baseline (nothing is saved).
 * My ACN: mode 'amount' { amount } or 'shares' { shares, anchorPrice, anchorDate, anchorSource }.
 * Proceeds: { capital, deductions, cashOutside }.
 */
export function previewBaseline(tab, input, nowIso, latestAcnQuote = null) {
  if (tab.tabKey === 'myacn') {
    if (input.mode === 'amount') {
      const err = validateBaseline({ capital: input.amount });
      const anchor = latestAcnQuote && latestAcnQuote.price > 0 ? latestAcnQuote.price : null;
      return { error: err, capital: input.amount, investable: input.amount, estimatedShares: anchor ? input.amount / anchor : null, anchorPrice: anchor };
    }
    if (input.mode === 'shares') {
      if (!(input.shares > 0)) return { error: 'Enter a share count greater than zero.' };
      if (!(input.anchorPrice > 0)) return { error: 'Enter an ACN reference price greater than zero.' };
      if (!input.anchorDate) return { error: 'Enter the as-of date for the share count.' };
      if (input.anchorDate > nowIso.slice(0, 10)) return { error: 'The as-of date cannot be in the future.' };
      const capital = input.shares * input.anchorPrice;
      return { error: null, capital, investable: capital, shares: input.shares, anchorPrice: input.anchorPrice };
    }
    return { error: 'Choose an input mode.' };
  }
  const b = { capital: input.capital, deductions: input.deductions || 0, cashOutside: input.cashOutside || 0 };
  const err = validateBaseline(b);
  return { error: err, capital: b.capital, investable: err ? null : investable(b) };
}

/**
 * Confirm a new dated baseline. Prior baselines and runs are preserved; only
 * this tab changes. Returns a new tab object.
 */
export function commitBaseline(tab, input, nowIso, quotes = {}) {
  const pv = previewBaseline(tab, input, nowIso, quotes.ACN);
  if (pv.error) throw new RangeError(pv.error);
  let baseline;
  if (tab.tabKey === 'myacn') {
    baseline = input.mode === 'shares'
      ? { id: newId('bl'), createdAt: nowIso, mode: 'shares', capital: pv.capital, deductions: 0, cashOutside: 0, shares: input.shares, anchorPrice: input.anchorPrice, anchorTs: `${input.anchorDate}T21:00:00.000Z`, anchorDate: input.anchorDate, anchorSource: input.anchorSource || 'user' }
      : { id: newId('bl'), createdAt: nowIso, mode: 'amount', capital: input.amount, deductions: 0, cashOutside: 0, shares: null, anchorPrice: null, anchorTs: null, anchorSource: null };
  } else {
    baseline = { id: newId('bl'), createdAt: nowIso, mode: input.restore ? 'preset' : 'override', capital: input.capital, deductions: input.deductions || 0, cashOutside: input.cashOutside || 0 };
  }
  let runs = baselineRuns(tab.tabKey, baseline, tab.assumptions.mixKey).map((r) => anchorRun(r, quotes));
  // Custom Split comparison on the same capital and timestamp.
  if (tab.tabKey === 'myacn') {
    const custom = anchorRun(createRun({ kind: 'baseline', strategy: 'custom', p: tab.customRetain, mixKey: tab.assumptions.mixKey, capital: pv.investable, createdAt: nowIso, baselineId: baseline.id, label: `Custom Split ${Math.round(tab.customRetain * 10000) / 100}% ACN`, unitsBasis: input.mode === 'shares' ? 'actual' : 'derived', preset: input.mode === 'shares' ? { ACN: { units: (input.shares * tab.customRetain), price: input.anchorPrice, marketTs: baseline.anchorTs, source: baseline.anchorSource, status: 'manual' } } : null }), quotes);
    runs = [...runs, custom];
  }
  return {
    ...tab,
    baselines: [...tab.baselines, baseline],
    activeBaselineId: baseline.id,
    runs: [...tab.runs, ...runs],
    selectedRun: {
      acn: runs.find((r) => r.strategy === 'acn')?.id || null,
      diversified: runs.find((r) => r.strategy === 'diversified').id,
      custom: runs.find((r) => r.strategy === 'custom')?.id || null,
    },
  };
}

/** Start a separately dated paper run for the current preview (and an ACN benchmark in My ACN). */
export function trackVersion(tab, { strategy, p, mixKey }, nowIso, quotes = {}) {
  const b = activeBaseline(tab);
  const capital = investable(b);
  const label = strategy === 'acn' ? '100% ACN' : strategy === 'diversified' ? `Diversified ${mixKey.slice(1)}% mix` : `Custom Split ${Math.round(p * 10000) / 100}% ACN`;
  const run = anchorRun(createRun({ kind: 'tracked', strategy, p, mixKey, capital, createdAt: nowIso, baselineId: b.id, label }), quotes);
  const added = [run];
  if (tab.tabKey === 'myacn' && strategy !== 'acn') {
    added.push(anchorRun(createRun({ kind: 'benchmark', strategy: 'acn', p: 1, mixKey, capital, createdAt: nowIso, baselineId: b.id, label: `Hold-all ACN benchmark for ${label}`, benchmarkFor: run.id }), quotes));
    added[1].benchmarkFor = run.id;
  }
  return {
    ...tab,
    runs: [...tab.runs, ...added],
    selectedRun: { ...tab.selectedRun, [strategy]: run.id },
  };
}

/** Fix units for any runs awaiting anchors. */
export function anchorTab(tab, quotes) {
  let changed = false;
  const runs = tab.runs.map((r) => {
    const n = anchorRun(r, quotes);
    if (n !== r) changed = true;
    return n;
  });
  return changed ? { ...tab, runs } : tab;
}

/** Custom preview run valued from the active baseline's common anchors (never saved). */
export function previewRun(tab, p, mixKey) {
  const b = activeBaseline(tab);
  const run = createRun({ kind: 'preview', strategy: 'custom', p, mixKey, capital: investable(b), createdAt: b.createdAt, baselineId: b.id, label: 'Preview' });
  const base = tab.runs.filter((r) => r.baselineId === b.id && r.kind === 'baseline' && (r.strategy === 'acn' || r.strategy === 'diversified'));
  const anchors = {};
  for (const r of base) for (const [s, a] of Object.entries(r.anchors)) anchors[s] = a;
  for (const row of run.rows) {
    const a = anchors[row.symbol];
    if (a) { run.anchors[row.symbol] = a; }
  }
  for (const s of Object.keys(run.anchors)) {
    const dollars = run.rows.filter((r) => r.symbol === s).reduce((x, r) => x + r.dollars, 0);
    run.units[s] = dollars / run.anchors[s].price;
  }
  return run;
}

export function setAssumption(tab, key, value) {
  return { ...tab, assumptions: { ...tab.assumptions, [key]: value } };
}

export function viewRetention(view, tab) {
  if (tab.tabKey !== 'myacn') return 0;
  const v = MY_ACN_VIEWS[view];
  return v.p === null ? tab.customRetain : v.p;
}

/** Migrate older saved shapes forward. Unknown future versions are left untouched (read-only). */
export function migrateTab(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schema === SCHEMA_VERSION) return raw;
  if (raw.schema > SCHEMA_VERSION) return { ...raw, readOnly: true };
  return null;
}
