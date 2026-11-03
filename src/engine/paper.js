// Paper portfolio runs: dated baselines with fixed units valued from observed prices.
import { targetRows, combineBySymbol } from './allocation.js';
import { isValuable } from './quotes.js';

let idCounter = 0;
export function newId(prefix = 'r') {
  const rnd = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}_${rnd}`;
}

/**
 * Create a paper run. Units are fixed once, when an anchor price is known.
 * `preset` lets a shares-mode baseline supply actual ACN units and anchor.
 */
export function createRun({ id = newId('run'), kind = 'tracked', label = '', strategy, p, mixKey, capital, createdAt, baselineId = null, placeholder = false, unitsBasis = 'derived', preset = null }) {
  if (!(capital >= 0)) throw new RangeError('Capital must be zero or more.');
  const rows = targetRows(capital, p, mixKey);
  const run = {
    id, kind, label, strategy, p, mixKey, capital, createdAt, baselineId, placeholder, unitsBasis,
    rows: rows.map(({ sleeve, symbol, weight, dollars, category }) => ({ sleeve, symbol, weight, dollars, category: category || null })),
    units: {},
    anchors: {},
    splitsApplied: [],
  };
  if (preset) {
    for (const [symbol, a] of Object.entries(preset)) {
      run.units[symbol] = a.units;
      run.anchors[symbol] = { price: a.price, marketTs: a.marketTs, source: a.source, status: a.status || 'manual' };
    }
  }
  return run;
}

export function runSymbols(run) {
  return combineBySymbol(run.rows).map((r) => r.symbol);
}

export function pendingSymbols(run) {
  return runSymbols(run).filter((s) => !(run.units[s] >= 0 && run.anchors[s]));
}

/**
 * Fix units for any symbol still awaiting an anchor using the supplied quotes.
 * Returns the same object when nothing changes. Units, once set, never change
 * here — new quotes change market value, not share counts.
 */
export function anchorRun(run, quotes) {
  const combined = combineBySymbol(run.rows);
  let changed = false;
  const units = { ...run.units };
  const anchors = { ...run.anchors };
  for (const h of combined) {
    if (units[h.symbol] >= 0 && anchors[h.symbol]) continue;
    const q = quotes[h.symbol];
    if (!isValuable(q) || q.status === 'stale' || q.status === 'unavailable' || q.status === 'bad') continue;
    units[h.symbol] = h.dollars / q.price;
    anchors[h.symbol] = { price: q.price, marketTs: q.marketTs, source: q.source, status: q.status };
    changed = true;
  }
  return changed ? { ...run, units, anchors } : run;
}

/** Apply a split once: units × ratio and anchor ÷ ratio. Idempotent by event id. */
export function applySplit(run, ev) {
  if (!run.units[ev.symbol] || run.splitsApplied.includes(ev.id)) return run;
  const anchorTs = Date.parse(run.anchors[ev.symbol]?.marketTs || run.createdAt);
  if (!(Date.parse(ev.date) > anchorTs)) return run;
  return {
    ...run,
    units: { ...run.units, [ev.symbol]: run.units[ev.symbol] * ev.ratio },
    anchors: { ...run.anchors, [ev.symbol]: { ...run.anchors[ev.symbol], price: run.anchors[ev.symbol].price / ev.ratio, splitAdjusted: true } },
    splitsApplied: [...run.splitsApplied, ev.id],
  };
}

/** Splits that occurred after the anchor but have not been reconciled into the run. */
export function unreconciledSplits(run, splitEvents = []) {
  return splitEvents.filter((ev) => run.units[ev.symbol] !== undefined && !run.splitsApplied.includes(ev.id)
    && Date.parse(ev.date) > Date.parse(run.anchors[ev.symbol]?.marketTs || run.createdAt));
}

/**
 * Price-return valuation. Never values a missing holding at zero and never
 * presents a partial total as complete.
 */
export function valueRun(run, quotes, { splitEvents = [] } = {}) {
  const combined = combineBySymbol(run.rows);
  const blocked = new Set(unreconciledSplits(run, splitEvents).map((e) => e.symbol));
  const holdings = combined.map((h) => {
    const units = run.units[h.symbol];
    const anchor = run.anchors[h.symbol] || null;
    const q = quotes[h.symbol];
    const hasUnits = units >= 0 && !!anchor;
    const priced = hasUnits && isValuable(q) && !blocked.has(h.symbol);
    const value = priced ? units * q.price : null;
    const pnl = priced ? value - h.dollars : null;
    return {
      symbol: h.symbol,
      sleeves: h.sleeves,
      weight: h.weight,
      openingDollars: h.dollars,
      units: hasUnits ? units : null,
      anchor,
      mark: isValuable(q) ? q.price : null,
      quote: q || null,
      value,
      pnl,
      pnlPct: priced && h.dollars > 0 ? pnl / h.dollars : null,
      contribution: priced && run.capital > 0 ? pnl / run.capital : null,
      state: blocked.has(h.symbol) ? 'split-unreconciled' : !hasUnits ? 'awaiting-anchor' : !priced ? 'unpriced' : 'priced',
    };
  });
  const priced = holdings.filter((h) => h.state === 'priced');
  const pricedValue = priced.reduce((s, h) => s + h.value, 0);
  const pricedCost = priced.reduce((s, h) => s + h.openingDollars, 0);
  const coverage = run.capital > 0 ? pricedCost / run.capital : (holdings.length ? priced.length / holdings.length : 1);
  const complete = priced.length === holdings.length;
  return {
    holdings,
    pricedValue,
    pricedCost,
    coverage,
    complete,
    total: complete ? pricedValue : null,
    pnl: complete ? pricedValue - run.capital : null,
    pnlPct: complete && run.capital > 0 ? (pricedValue - run.capital) / run.capital : null,
    missing: holdings.filter((h) => h.state !== 'priced').map((h) => h.symbol),
  };
}

/** Sleeve-level breakdown rows (duplicates such as SGOV kept per sleeve). */
export function sleeveBreakdown(run, quotes) {
  return run.rows.map((r) => {
    const a = run.anchors[r.symbol];
    const units = a && run.units[r.symbol] >= 0 ? r.dollars / a.price : null;
    const q = quotes[r.symbol];
    const value = units !== null && isValuable(q) ? units * q.price : null;
    return { ...r, units, value };
  });
}
