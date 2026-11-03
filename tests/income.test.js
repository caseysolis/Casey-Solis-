// Section 06 income fixture: price return vs verified total return.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, anchorRun, valueRun } from '../src/engine/paper.js';
import { runTotalReturn, totalReturnWindow, incomeFactor } from '../src/engine/totalReturn.js';
import { holdingRows } from '../src/engine/allocation.js';

const T0 = '2026-11-02T21:00:00.000Z';
const q = (symbol, price, ts = T0) => ({ symbol, price, currency: 'USD', source: 'synthetic-test', marketTs: ts, status: 'closed' });

function symbolsFor(p, mix) { return [...new Set(holdingRows(p, mix).map((r) => r.symbol))]; }
function zeroHistories(symbols, through) {
  return Object.fromEntries(symbols.map((s) => [s, { symbol: s, verifiedThrough: through, source: 'synthetic-test', events: [] }]));
}

test('ACN drops by a verified $2 dividend: −2% price return, 0% total return', () => {
  const run = anchorRun(createRun({ strategy: 'acn', p: 1, mixKey: 'm20', capital: 800000, createdAt: T0 }), { ACN: q('ACN', 100) });
  const price = valueRun(run, { ACN: q('ACN', 98, '2026-11-10T21:00:00.000Z') });
  assert.ok(Math.abs(price.pnlPct - -0.02) < 1e-12);
  const histories = { ACN: { symbol: 'ACN', verifiedThrough: '2026-11-10', source: 'synthetic-test', events: [{ id: 'acn-div-1', exDate: '2026-11-10', amount: 2, exPrice: 98 }] } };
  const tr = runTotalReturn({ run, marks: { ACN: 98 }, histories, throughDate: '2026-11-10' });
  assert.equal(tr.available, true);
  assert.ok(Math.abs(tr.totalReturn) < 1e-12);
  assert.equal(run.units.ACN, 8000, 'price-only share ledger unchanged by hypothetical reinvestment');

  // Reprocessing the same event cannot increase the balance.
  const dup = { ACN: { ...histories.ACN, events: [...histories.ACN.events, ...histories.ACN.events] } };
  const tr2 = runTotalReturn({ run, marks: { ACN: 98 }, histories: dup, throughDate: '2026-11-10' });
  assert.ok(tr2.value <= tr.value + 1e-9);

  // Removing the verified event history makes the series unavailable.
  const none = runTotalReturn({ run, marks: { ACN: 98 }, histories: {}, throughDate: '2026-11-10' });
  assert.equal(none.available, false);
  assert.deepEqual(none.missing, ['ACN']);
});

test('Reverse: a diversified ETF drops exactly by its distribution while ACN is flat', () => {
  const symbols = symbolsFor(0.4, 'm20');
  const anchorQuotes = Object.fromEntries(symbols.map((s) => [s, q(s, 100)]));
  const run = anchorRun(createRun({ strategy: 'custom', p: 0.4, mixKey: 'm20', capital: 800000, createdAt: T0 }), anchorQuotes);
  const marks = Object.fromEntries(symbols.map((s) => [s, 100]));
  marks.BND = 99.5; // BND pays $0.50 and drops by exactly that
  const later = Object.fromEntries(symbols.map((s) => [s, q(s, marks[s], '2026-11-10T21:00:00.000Z')]));
  const price = valueRun(run, later);
  const bnd = price.holdings.find((h) => h.symbol === 'BND');
  assert.ok(bnd.pnl < 0, 'the affected sleeve loses price value');
  assert.ok(Math.abs(price.holdings.find((h) => h.symbol === 'ACN').pnl) < 1e-9);

  const histories = zeroHistories(symbols, '2026-11-10');
  histories.BND = { symbol: 'BND', verifiedThrough: '2026-11-10', source: 'synthetic-test', events: [{ id: 'bnd-dist-1', exDate: '2026-11-10', amount: 0.5, exPrice: 99.5 }] };
  const tr = runTotalReturn({ run, marks, histories, throughDate: '2026-11-10' });
  assert.equal(tr.available, true);
  assert.ok(Math.abs(tr.bySymbol.BND.totalReturn) < 1e-12, 'zero total return for the affected sleeve');
  assert.ok(Math.abs(tr.totalReturn) < 1e-12);

  delete histories.BND;
  const gone = runTotalReturn({ run, marks, histories, throughDate: '2026-11-10' });
  assert.equal(gone.available, false);
  assert.ok(gone.missing.includes('BND'));
});

test('Verified zero distributions count as zero; unknown is unavailable', () => {
  assert.equal(incomeFactor({ anchorDate: '2026-11-01', throughDate: '2026-11-10', history: { verifiedThrough: '2026-11-10', events: [] } }).factor, 1);
  assert.equal(incomeFactor({ anchorDate: '2026-11-01', throughDate: '2026-11-10', history: null }).available, false);
  assert.equal(incomeFactor({ anchorDate: '2026-11-01', throughDate: '2026-11-10', history: { verifiedThrough: '2026-11-05', events: [] } }).available, false);
});

test('Earlier common verified date offers a dated total-return window', () => {
  const run = anchorRun(createRun({ strategy: 'acn', p: 1, mixKey: 'm20', capital: 800000, createdAt: T0 }), { ACN: q('ACN', 100) });
  const histories = { ACN: { symbol: 'ACN', verifiedThrough: '2026-11-06', source: 'synthetic-test', events: [], closes: { '2026-11-06': 104 } } };
  const w = totalReturnWindow({ run, latestMarks: { ACN: 106 }, latestDate: '2026-11-10', histories });
  assert.equal(w.available, true);
  assert.equal(w.dated, true);
  assert.equal(w.through, '2026-11-06');
  assert.ok(Math.abs(w.totalReturn - 0.04) < 1e-12);
});

test('anchor dates use the New York market date, not the UTC date', () => {
  // 02:30Z on Nov 3 is still Nov 2 in New York; a Nov 3 ex-date must count.
  const run = anchorRun(createRun({ strategy: 'acn', p: 1, mixKey: 'm20', capital: 1000, createdAt: '2026-11-03T02:30:00.000Z' }), { ACN: q('ACN', 100, '2026-11-03T02:30:00.000Z') });
  const histories = { ACN: { verifiedThrough: '2026-11-04', source: 't', events: [{ id: 'x', exDate: '2026-11-03', amount: 2, exPrice: 98 }] } };
  const tr = runTotalReturn({ run, marks: { ACN: 98 }, histories, throughDate: '2026-11-04' });
  assert.ok(Math.abs(tr.totalReturn) < 1e-12);
});

