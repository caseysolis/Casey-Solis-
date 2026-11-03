// Deterministic checks 01–06 from the build specification, run against the
// same engine modules the user interface imports. Synthetic prices live here only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABS, MIXES, PATH_ORDER, PROCEEDS_TABS, SLEEVE_CONSTITUENTS } from '../src/engine/constants.js';
import { holdingRows, targetRows, combineBySymbol, totalWeight, sleeveDollars } from '../src/engine/allocation.js';
import { project, projectStrategy, grossRate, breakEvenAcnReturn, diversifiedRate } from '../src/engine/forecast.js';
import { shockResult, earlyLate } from '../src/engine/downside.js';
import { createRun, anchorRun, valueRun, applySplit } from '../src/engine/paper.js';
import { defaultTab, commitBaseline, activeBaseline, previewRun, trackVersion, anchorTab, investable } from '../src/engine/state.js';
import { parseMoney, formatUSD, formatMillions, roundCents } from '../src/engine/money.js';
import { holdingsCSV, projectionCSV } from '../src/engine/csv.js';

const cent = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 0.01, `${msg || ''} expected ${expected}, got ${actual}`);
const NOW = '2026-11-03T15:00:00.000Z';
const q = (symbol, price, extra = {}) => ({ symbol, price, currency: 'USD', source: 'synthetic-test', marketTs: NOW, fetchedAt: NOW, status: 'delayed', ...extra });
const quotesAll = (price, overrides = {}) => {
  const out = {};
  for (const s of ['ACN', 'BTC/USD', 'NVDA', 'AMZN', 'GOOGL', 'AVGO', 'TSLA', 'COIN', 'XYZ', 'ISRG', 'ROK', 'ADSK', 'VTI', 'VXUS', 'BND', 'VTIP', 'VIG', 'SGOV']) out[s] = q(s, overrides[s] ?? price);
  return out;
};

test('01 First open and position replacement', () => {
  const tab = defaultTab('myacn', NOW);
  const b = activeBaseline(tab);
  assert.equal(b.mode, 'placeholder');
  assert.equal(b.capital, 800000);
  const acnRun = tab.runs.find((r) => r.strategy === 'acn');
  assert.equal(acnRun.p, 1);
  assert.deepEqual(acnRun.rows.map((r) => r.symbol), ['ACN']);
  assert.equal(acnRun.unitsBasis, 'estimated');

  // Synthetic $200 anchor → exactly 4,000 shares.
  const anchored = anchorTab(tab, { ACN: q('ACN', 200) });
  const run = anchored.runs.find((r) => r.strategy === 'acn');
  assert.equal(run.units.ACN, 4000);

  // $220 → $880,000, +$80,000, +10%.
  const v = valueRun(run, { ACN: q('ACN', 220) });
  cent(v.total, 880000);
  cent(v.pnl, 80000);
  assert.ok(Math.abs(v.pnlPct - 0.10) < 1e-12);

  // Second refresh at $220 changes nothing.
  const again = anchorTab(anchored, { ACN: q('ACN', 220) });
  assert.equal(again, anchored, 'anchoring is a no-op once units are fixed');
  const v2 = valueRun(again.runs.find((r) => r.strategy === 'acn'), { ACN: q('ACN', 220) });
  assert.equal(v2.total, v.total);
  assert.equal(again.runs.find((r) => r.strategy === 'acn').units.ACN, 4000);

  // 3,500 actual shares at $200 → new baseline of $700,000; history preserved.
  const others = Object.fromEntries(['low', 'central', 'high'].map((k) => [k, defaultTab(k, NOW)]));
  const snapshot = JSON.stringify(others);
  const corrected = commitBaseline(anchored, { mode: 'shares', shares: 3500, anchorPrice: 200, anchorDate: '2026-11-02', anchorSource: 'user' }, '2026-11-03T16:00:00.000Z', { ACN: q('ACN', 220) });
  const nb = activeBaseline(corrected);
  assert.equal(nb.capital, 700000);
  assert.equal(corrected.baselines.length, 2);
  assert.equal(corrected.baselines[0].capital, 800000, 'prior baseline preserved');
  assert.ok(corrected.runs.includes(run) || corrected.runs.some((r) => r.id === run.id && r.units.ACN === 4000), 'prior paper run preserved');
  const newAcn = corrected.runs.find((r) => r.id === corrected.selectedRun.acn);
  assert.equal(newAcn.units.ACN, 3500);
  assert.equal(newAcn.unitsBasis, 'actual');
  const newDiv = corrected.runs.find((r) => r.id === corrected.selectedRun.diversified);
  const newCustom = corrected.runs.find((r) => r.id === corrected.selectedRun.custom);
  assert.equal(newDiv.capital, 700000);
  assert.equal(newCustom.capital, 700000);
  assert.equal(newDiv.createdAt, newAcn.createdAt);
  assert.equal(newCustom.createdAt, newAcn.createdAt);
  assert.equal(JSON.stringify(others), snapshot, 'no other starting case changes');
});

test('02 Fixed units and fixed mixes', () => {
  const rows = targetRows(800000, 0, 'm20');
  const nvda = rows.find((r) => r.symbol === 'NVDA');
  assert.ok(Math.abs(nvda.weight - 0.036) < 1e-15);
  cent(nvda.dollars, 28800);

  const prices = quotesAll(100);
  let run = anchorRun(createRun({ strategy: 'diversified', p: 0, mixKey: 'm20', capital: 800000, createdAt: NOW }), prices);
  assert.ok(Math.abs(run.units.NVDA - 288) < 1e-9);
  const unitsBefore = { ...run.units };
  const moved = { ...prices, NVDA: q('NVDA', 110) };
  const v = valueRun(run, moved);
  cent(v.total, 802880);
  run = anchorRun(run, moved);
  assert.deepEqual(run.units, unitsBefore, 'all units stay fixed');

  // Standalone 100% Diversified: zero direct ACN.
  const tab = defaultTab('myacn', NOW);
  const div = tab.runs.find((r) => r.strategy === 'diversified');
  assert.equal(div.rows.filter((r) => r.symbol === 'ACN').length, 0);
  assert.equal(sleeveDollars(800000, 0, 'm20').acn, 0);

  const pj = projectStrategy({ capital: 800000, p: 0, mixKey: 'm20', pathKey: 'base' });
  cent(pj.rows[1].end, 849200.00);
  cent(pj.rows[20].end, 2639307.29);

  // Custom Split at endpoints equals the standalone views in every section.
  for (const [p, strategy] of [[0, 'diversified'], [1, 'acn']]) {
    const a = projectStrategy({ capital: 800000, p, mixKey: 'm20', pathKey: 'base', acnReturn: 0, draw: 0 });
    const s = projectStrategy({ capital: 800000, p: strategy === 'acn' ? 1 : 0, mixKey: 'm20', pathKey: 'base', acnReturn: 0, draw: 0 });
    assert.deepEqual(a.rows, s.rows);
    for (const k of ['innovationBear', 'recession', 'valuationReset']) {
      assert.deepEqual(shockResult({ capital: 800000, p, mixKey: 'm20', shockKey: k }), shockResult({ capital: 800000, p: strategy === 'acn' ? 1 : 0, mixKey: 'm20', shockKey: k }));
    }
    const anchoredTab = anchorTab(tab, quotesAll(100, { ACN: 200 }));
    const preview = previewRun(anchoredTab, p, 'm20');
    const standalone = anchoredTab.runs.find((r) => r.strategy === strategy && r.kind === 'baseline');
    const later = quotesAll(105, { ACN: 210, NVDA: 120 });
    cent(valueRun(preview, later).total, valueRun(standalone, later).total, `preview at ${p}`);
    assert.deepEqual(Object.keys(preview.units).sort(), Object.keys(standalone.units).sort());
  }
});

test('03 Partial retention', () => {
  const r = grossRate({ p: 0.4, mixKey: 'm20', pathKey: 'base', acnReturn: 0 });
  assert.ok(Math.abs(r - 0.0369) < 1e-15);
  const pj = projectStrategy({ capital: 800000, p: 0.4, mixKey: 'm20', pathKey: 'base' });
  cent(pj.rows[1].end, 829520.00);
  cent(pj.rows[10].end, 1149367.02);

  const s = shockResult({ capital: 800000, p: 0.4, mixKey: 'm20', shockKey: 'innovationBear', acnShock: -0.30 });
  assert.ok(Math.abs(s.lossPct - 0.204) < 1e-12);
  cent(s.dollarLoss, 163200);
  cent(s.remaining, 636800);

  const all = shockResult({ capital: 800000, p: 1, mixKey: 'm20', shockKey: 'innovationBear', acnShock: -0.30 });
  cent(all.dollarLoss, 240000);
  cent(all.remaining, 560000);

  // Slider dollar split at 40% retained, 20% mix.
  const d = sleeveDollars(800000, 0.4, 'm20');
  cent(d.acn, 320000); cent(d.innovation, 96000); cent(d.core, 240000); cent(d.bills, 144000);
});

test('04 Original research reconciliation', () => {
  const c = projectStrategy({ capital: TABS.central.capital, p: 0, mixKey: 'm20', pathKey: 'base', draw: 500000, inflation: 0.025 });
  cent(c.rows[10].end, 76785730.57);
  cent(c.rows[20].end, 130066240.64);
  cent(c.rows[20].real, 79375647.31);
  const shock = shockResult({ capital: TABS.central.capital, p: 0, mixKey: 'm20', shockKey: 'innovationBear' });
  assert.ok(Math.abs(shock.lossPct - 0.14) < 1e-12);
  cent(shock.dollarLoss, 6484679.74);
  const l = projectStrategy({ capital: TABS.low.capital, p: 0, mixKey: 'm10', pathKey: 'conservative', draw: 500000, inflation: 0.025 });
  cent(l.rows[20].real, 30470672.57);
  // Displayed millions match to displayed precision.
  assert.equal(formatMillions(c.rows[20].end), '$130.07M');
});

test('05 Spending, fees and depletion', () => {
  const flat = projectStrategy({ capital: 800000, p: 1, mixKey: 'm20', pathKey: 'base', acnReturn: 0 });
  cent(flat.rows[20].end, 800000);

  const dep = projectStrategy({ capital: 800000, p: 1, mixKey: 'm20', pathKey: 'base', acnReturn: 0, draw: 500000, inflation: 0.025 });
  cent(dep.rows[1].end, 300000);
  cent(dep.rows[2].requested, 512500);
  cent(dep.rows[2].paid, 300000);
  assert.equal(dep.rows[2].end, 0);
  cent(dep.rows[2].shortfall, 212500);
  assert.ok(dep.rows.slice(2).every((r) => r.end === 0), 'depleted paths end at $0');

  const fee = projectStrategy({ capital: 800000, p: 0.4, mixKey: 'm20', pathKey: 'base', fee: 0.01, draw: 500000 });
  cent(fee.rows[1].end, 321224.80);

  // Invalid inputs are refused rather than producing nonsense.
  assert.throws(() => project({ capital: -1, rate: 0.05 }));
  assert.throws(() => project({ capital: 1, rate: -1.5 }));
  assert.throws(() => project({ capital: 1, rate: 0.05, fee: 1 }));
  assert.throws(() => project({ capital: 1, rate: NaN }));
  assert.throws(() => commitBaseline(defaultTab('central', NOW), { capital: 100, deductions: 80, cashOutside: 30 }, NOW));
});

// Independent closed-form growing-withdrawal reference (separate implementation).
function closedForm({ capital, r, f, W, i, n }) {
  const g = (1 + r) * (1 - f);
  const qd = 1 + i;
  const gn = Math.pow(g, n);
  const annuity = Math.abs(g - qd) < 1e-15 ? n * Math.pow(g, n - 1) : (gn - Math.pow(qd, n)) / (g - qd);
  // Year-end withdrawals: Σ_{t=1..n} W q^(t−1) g^(n−t) = W (gⁿ − qⁿ)/(g − q)
  const nominal = capital * gn - W * annuity;
  return { nominal, real: nominal / Math.pow(qd, n) };
}

test('06 Independent reference calculation — 36 combinations and edge cases', () => {
  let count = 0;
  for (const tabKey of PROCEEDS_TABS) {
    for (const mixKey of Object.keys(MIXES)) {
      for (const pathKey of PATH_ORDER) {
        count++;
        const capital = TABS[tabKey].capital;
        const r = diversifiedRate(mixKey, pathKey);
        const pj = projectStrategy({ capital, p: 0, mixKey, pathKey, draw: 500000, inflation: 0.025 });
        for (const n of [10, 20]) {
          const row = pj.rows[n];
          assert.ok(!row.depleted);
          const ref = closedForm({ capital, r, f: 0, W: 500000, i: 0.025, n });
          cent(row.end, ref.nominal, `${tabKey}/${mixKey}/${pathKey} y${n} nominal`);
          cent(row.real, ref.real, `${tabKey}/${mixKey}/${pathKey} y${n} real`);
        }
      }
    }
  }
  assert.equal(count, 36);

  const edge = (args, label) => {
    const rows = project({ capital: args.capital, rate: args.r, fee: args.f, draw: args.W, inflation: args.i, years: 20 });
    for (const n of [10, 20]) {
      if (rows[n].depleted) continue;
      const ref = closedForm({ ...args, n });
      cent(rows[n].end, ref.nominal, `${label} y${n}`);
      cent(rows[n].real, ref.real, `${label} real y${n}`);
    }
    return rows;
  };
  edge({ capital: 1e6, r: 0.025, f: 0, W: 30000, i: 0.025 }, 'equal growth and inflation');
  edge({ capital: 1e6, r: 0, f: 0, W: 20000, i: 0.025 }, 'zero return');
  edge({ capital: 1e6, r: 0.05, f: 0, W: 20000, i: 0 }, 'zero inflation');
  edge({ capital: 1e6, r: 0.06, f: 0.01, W: 20000, i: 0.02 }, 'with fee');
  edge({ capital: 1e6, r: -0.05, f: 0, W: 10000, i: 0.02 }, 'negative return');
  const zero = edge({ capital: 0, r: 0.05, f: 0, W: 0, i: 0.025 }, 'zero capital');
  assert.ok(zero.every((x) => x.end === 0));
  const deplete = project({ capital: 100000, rate: 0.03, draw: 30000, inflation: 0.03, years: 20 });
  const firstDep = deplete.findIndex((x) => x.year > 0 && x.depleted);
  assert.ok(firstDep > 0 && deplete.slice(firstDep).every((x) => x.end === 0 && x.shortfall > 0));

  // Holdings columns total 100% before rounding.
  for (const mixKey of Object.keys(MIXES)) {
    for (const p of [0, 0.4, 1, 0.123456]) {
      assert.ok(Math.abs(totalWeight(holdingRows(p, mixKey)) - 1) < 1e-12, `${mixKey} p=${p}`);
      assert.ok(Math.abs(totalWeight(combineBySymbol(holdingRows(p, mixKey))) - 1) < 1e-12);
    }
  }
  for (const sleeve of Object.keys(SLEEVE_CONSTITUENTS)) {
    assert.ok(Math.abs(SLEEVE_CONSTITUENTS[sleeve].reduce((s, c) => s + c.w, 0) - 1) < 1e-12);
  }

  // Chart points, headline values, tables and CSV reconcile for the same inputs.
  const pj = projectStrategy({ capital: TABS.central.capital, p: 0, mixKey: 'm20', pathKey: 'base', draw: 500000 });
  const csv = projectionCSV({ scenario: 'Central', strategy: 'Diversified', startDate: NOW, rate: pj.rate, rows: pj.rows, assumptions: { fee: 0, inflation: 0.025 } });
  const line20 = csv.trim().split('\r\n')[21].split(',');
  assert.equal(line20[3], '20');
  assert.equal(line20[10], roundCents(pj.rows[20].end).toFixed(2));
  assert.equal(formatUSD(Number(line20[10])), formatUSD(pj.rows[20].end));
});

test('Duplicate SGOV combined for prices but both sleeves retained', () => {
  const rows = targetRows(800000, 0, 'm20');
  const sgovRows = rows.filter((r) => r.symbol === 'SGOV');
  assert.equal(sgovRows.length, 2);
  assert.deepEqual(sgovRows.map((r) => r.sleeve).sort(), ['bills', 'core']);
  const combined = combineBySymbol(rows).find((r) => r.symbol === 'SGOV');
  cent(combined.dollars, 800000 * (0.5 * 0.05 + 0.3));
});

test('Missing quotes: priced subtotal and coverage, never a complete total', () => {
  const prices = quotesAll(100);
  const run = anchorRun(createRun({ strategy: 'diversified', p: 0, mixKey: 'm20', capital: 800000, createdAt: NOW }), prices);
  const partial = { ...prices };
  delete partial.NVDA;
  const v = valueRun(run, partial);
  assert.equal(v.complete, false);
  assert.equal(v.total, null);
  assert.equal(v.pnl, null);
  assert.ok(Math.abs(v.coverage - (1 - 0.036)) < 1e-12);
  assert.deepEqual(v.missing, ['NVDA']);
  // Zero / bad quotes are not used as anchors or marks.
  const fresh = anchorRun(createRun({ strategy: 'acn', p: 1, mixKey: 'm20', capital: 800000, createdAt: NOW }), { ACN: q('ACN', 0) });
  assert.equal(fresh.units.ACN, undefined);
  assert.equal(valueRun(fresh, { ACN: q('ACN', NaN) }).complete, false);
});

test('Split fixture: units and price adjusted once', () => {
  let run = anchorRun(createRun({ strategy: 'acn', p: 1, mixKey: 'm20', capital: 800000, createdAt: NOW }), { ACN: q('ACN', 200) });
  const split = { id: 'acn-split-2', symbol: 'ACN', date: '2026-11-10T13:30:00.000Z', ratio: 2 };
  const blocked = valueRun(run, { ACN: q('ACN', 110) }, { splitEvents: [split] });
  assert.equal(blocked.complete, false, 'unreconciled split marks performance unavailable');
  assert.equal(blocked.holdings[0].state, 'split-unreconciled');
  run = applySplit(run, split);
  run = applySplit(run, split);
  assert.equal(run.units.ACN, 8000);
  assert.equal(run.anchors.ACN.price, 100);
  const v = valueRun(run, { ACN: q('ACN', 110) }, { splitEvents: [split] });
  cent(v.total, 880000);
  cent(v.pnlPct * 100, 10);
});

test('Track this version starts a separately dated run with an ACN benchmark', () => {
  let tab = anchorTab(defaultTab('myacn', NOW), quotesAll(100, { ACN: 200 }));
  const before = tab.runs.map((r) => r.id);
  const later = '2026-11-04T15:00:00.000Z';
  tab = trackVersion(tab, { strategy: 'custom', p: 0.4, mixKey: 'm20' }, later, quotesAll(101, { ACN: 210 }));
  const added = tab.runs.filter((r) => !before.includes(r.id));
  assert.equal(added.length, 2);
  const [run, bench] = added;
  assert.equal(run.createdAt, later);
  assert.equal(bench.createdAt, later);
  assert.equal(bench.capital, run.capital);
  assert.equal(bench.strategy, 'acn');
  assert.equal(bench.anchors.ACN.price, run.anchors.ACN.price);
  assert.equal(tab.selectedRun.custom, run.id);
  assert.ok(before.every((id) => tab.runs.some((r) => r.id === id)), 'earlier runs preserved');
});

test('Break-even ACN return equals 6.15% at 20% mix base', () => {
  const be = breakEvenAcnReturn({ capital: 800000, mixKey: 'm20', pathKey: 'base' });
  assert.equal((be * 100).toFixed(2), '6.15');
  const withFlows = breakEvenAcnReturn({ capital: 800000, mixKey: 'm20', pathKey: 'base', fee: 0.01, draw: 20000 });
  assert.equal((withFlows * 100).toFixed(2), '6.15');
});

test('Early vs late shock varies only the order', () => {
  const { early, late } = earlyLate({ capital: TABS.central.capital, baseRate: 0.0615, shockPct: -0.14, draw: 500000, inflation: 0.025 });
  assert.equal(early.length, 21);
  assert.deepEqual(early.slice(1).map((r) => r.requested), late.slice(1).map((r) => r.requested));
  assert.equal(early[1].rate, -0.14);
  assert.equal(late[20].rate, -0.14);
  assert.ok(early[20].end < late[20].end, 'early shock hurts more with withdrawals');
  const noFlow = earlyLate({ capital: 1e6, baseRate: 0.06, shockPct: -0.2, draw: 0 });
  cent(noFlow.early[20].end, noFlow.late[20].end, 'without withdrawals order does not matter');
});

test('Currency input parsing: bounds, decimals, zero, blank and pasted amounts', () => {
  assert.deepEqual(parseMoney('$1,234,567.89'), { ok: true, value: 1234567.89 });
  assert.deepEqual(parseMoney(' 800000 '), { ok: true, value: 800000 });
  assert.deepEqual(parseMoney('800 000'), { ok: true, value: 800000 });
  assert.deepEqual(parseMoney('USD 1,000'), { ok: true, value: 1000 });
  assert.equal(parseMoney('').ok, false);
  assert.equal(parseMoney('   ').ok, false);
  assert.equal(parseMoney('-5').ok, false);
  assert.equal(parseMoney('(5)').ok, false);
  assert.equal(parseMoney('1.234').ok, false);
  assert.equal(parseMoney('abc').ok, false);
  assert.equal(parseMoney('1,23').ok, false);
  assert.equal(parseMoney('2e6').ok, false);
  assert.equal(parseMoney('0', { allowZero: false }).ok, false);
  assert.equal(parseMoney('0').ok, true);
  assert.equal(parseMoney('2000000000000').ok, false);
});

test('Holdings CSV includes scenario, strategy, units, dates, currency, source and freshness', () => {
  const prices = quotesAll(100);
  const run = anchorRun(createRun({ strategy: 'diversified', p: 0, mixKey: 'm20', capital: 800000, createdAt: NOW }), prices);
  const v = valueRun(run, prices);
  const csv = holdingsCSV({ scenario: 'My ACN', strategy: '100% Diversified', basis: 'price', asOf: NOW, valuation: v, runCreatedAt: NOW });
  const lines = csv.trim().split('\r\n');
  assert.match(lines[0], /scenario,strategy,return_basis,as_of,run_started,symbol/);
  assert.match(lines[0], /price_source,price_status/);
  assert.match(lines[0], /currency$/);
  const last = lines.at(-1).split(',');
  assert.equal(last[5], 'TOTAL');
  assert.equal(last[16], '800000.00');
  // Totals reconcile with the valuation.
  const sum = lines.slice(1, -1).reduce((s, l) => s + Number(l.split(',')[16]), 0);
  cent(sum, v.total);
});

test('Proceeds tabs never carry ACN and investable capital nets deductions', () => {
  for (const k of PROCEEDS_TABS) {
    const t = defaultTab(k, NOW);
    assert.ok(t.runs.every((r) => r.p === 0 && r.rows.every((x) => x.symbol !== 'ACN')));
    assert.equal(investable(activeBaseline(t)), TABS[k].capital);
    assert.equal(t.assumptions.draw, 500000);
  }
  const t = commitBaseline(defaultTab('central', NOW), { capital: 46319141, deductions: 319141, cashOutside: 1000000 }, NOW);
  assert.equal(investable(activeBaseline(t)), 45000000);
});
