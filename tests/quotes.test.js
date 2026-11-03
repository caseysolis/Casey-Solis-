// Quote adapter failure modes against the mock provider (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuoteService } from '../server/quotes/service.js';
import { mockProvider, verifyIdentity, twelveDataProvider } from '../server/quotes/providers.js';
import { classifyQuote, mergeQuote } from '../src/engine/quotes.js';

function setup(nowRef = { t: Date.parse('2026-11-03T15:00:00Z') }) {
  const control = { quotes: {} };
  const svc = new QuoteService({ providers: [mockProvider(control)], minIntervalMs: 20_000, now: () => nowRef.t });
  return { control, svc, nowRef };
}
const iso = (ms) => new Date(ms).toISOString();

test('live only with real-time entitlement and fresh timestamp; delayed otherwise', async () => {
  const { control, svc, nowRef } = setup();
  control.quotes = {
    ACN: { price: 250, marketTs: iso(nowRef.t - 30_000), entitlement: 'realtime' },
    NVDA: { price: 100, marketTs: iso(nowRef.t - 15 * 60_000), entitlement: 'delayed' },
  };
  const q = await svc.get(['ACN', 'NVDA']);
  assert.equal(q.ACN.status, 'live');
  assert.equal(q.NVDA.status, 'delayed');
  assert.equal(q.ACN.currency, 'USD');
  assert.equal(q.ACN.source, 'Mock provider');
  assert.ok(q.ACN.fetchedAt && q.ACN.marketTs);
});

test('closed market keeps the close timestamp; weekend BTC trades', async () => {
  const sat = Date.parse('2026-11-07T17:00:00Z');
  const fri = '2026-11-06T21:00:00.000Z';
  const { control, svc } = setup({ t: sat });
  control.quotes = {
    ACN: { price: 250, marketTs: fri, marketOpen: false },
    'BTC/USD': { price: 70000, marketTs: iso(sat - 20_000), marketOpen: true, entitlement: 'realtime' },
  };
  const q = await svc.get(['ACN', 'BTC/USD']);
  assert.equal(q.ACN.status, 'closed');
  assert.equal(q.ACN.marketTs, fri, 'U.S. equity close timestamp intact');
  assert.equal(q['BTC/USD'].status, 'live');
});

test('provider failure preserves last verified values and timestamp (cached → stale)', async () => {
  const ref = { t: Date.parse('2026-11-03T15:00:00Z') };
  const { control, svc } = setup(ref);
  control.quotes = { ACN: { price: 250, marketTs: iso(ref.t - 60_000) } };
  await svc.get(['ACN']);
  for (const fail of ['500', '401', '403', 'timeout']) {
    ref.t += 120_000;
    control.fail = fail;
    const q = await svc.get(['ACN']);
    assert.equal(q.ACN.price, 250, `${fail}: keeps value`);
    assert.equal(q.ACN.marketTs, iso(Date.parse('2026-11-03T15:00:00Z') - 60_000), `${fail}: keeps timestamp`);
    assert.ok(['cached', 'stale'].includes(q.ACN.status), `${fail}: labelled ${q.ACN.status}`);
  }
  ref.t += 3 * 3600_000;
  assert.equal((await svc.get(['ACN'])).ACN.status, 'stale');
});

test('429 triggers back-off: no provider calls until the window passes', async () => {
  const ref = { t: Date.parse('2026-11-03T15:00:00Z') };
  const { control, svc } = setup(ref);
  control.quotes = { ACN: { price: 250, marketTs: iso(ref.t) } };
  control.fail = '429';
  control.retryAfterMs = 30_000;
  await svc.get(['ACN']);
  const calls = control.calls;
  ref.t += 25_000;
  await svc.get(['ACN']);
  assert.equal(control.calls, calls, 'no call during back-off');
  ref.t += 10_000;
  control.fail = null;
  const q = await svc.get(['ACN']);
  assert.equal(control.calls, calls + 1);
  assert.equal(q.ACN.price, 250);
});

test('concurrent refreshes are de-duplicated and batched', async () => {
  const { control, svc, nowRef } = setup();
  control.delayMs = 50;
  control.quotes = { ACN: { price: 1, marketTs: iso(nowRef.t) }, NVDA: { price: 2, marketTs: iso(nowRef.t) } };
  await Promise.all([svc.get(['ACN', 'NVDA']), svc.get(['ACN', 'NVDA']), svc.get(['ACN', 'NVDA'])]);
  assert.equal(control.calls, 1);
  assert.deepEqual(control.lastSymbols, ['ACN', 'NVDA']);
});

test('out-of-order responses are discarded; bad and zero quotes rejected; missing → unavailable', async () => {
  const ref = { t: Date.parse('2026-11-03T15:00:00Z') };
  const { control, svc } = setup(ref);
  control.quotes = { ACN: { price: 251, marketTs: iso(ref.t) }, NVDA: { price: 0, marketTs: iso(ref.t) }, TSLA: { price: 'abc', marketTs: iso(ref.t) } };
  await svc.get(['ACN', 'NVDA', 'TSLA', 'AMZN']);
  ref.t += 30_000;
  control.quotes.ACN = { price: 240, marketTs: iso(ref.t - 600_000) }; // older market time
  const q = await svc.get(['ACN', 'NVDA', 'TSLA', 'AMZN']);
  assert.equal(q.ACN.price, 251);
  assert.equal(q.NVDA.status, 'unavailable');
  assert.equal(q.TSLA.status, 'unavailable');
  assert.equal(q.AMZN.status, 'unavailable');
  assert.equal(mergeQuote({ price: 1, marketTs: iso(ref.t) }, { error: 'x' }).price, 1);
});

test('symbols are sanitized to the fixed instrument list', () => {
  assert.deepEqual(QuoteService.sanitize('acn, NVDA ,FOO,btc/usd,ACN'), ['ACN', 'NVDA', 'BTC/USD']);
  assert.deepEqual(QuoteService.sanitize('800000'), []);
});

test('instrument identity verification', () => {
  assert.equal(verifyIdentity('ACN', { returnedSymbol: 'ACN', currency: 'USD', exchange: 'NYSE' }), null);
  assert.match(verifyIdentity('ACN', { returnedSymbol: 'ACN', currency: 'EUR', exchange: 'NYSE' }), /Currency/);
  assert.match(verifyIdentity('ACN', { returnedSymbol: 'ACN', currency: 'USD', exchange: 'XETRA' }), /Venue/);
  assert.match(verifyIdentity('VTI', { returnedSymbol: 'VTIX', currency: 'USD' }), /Symbol/);
});

test('Twelve Data adapter normalizes a batch response (fixture, no network)', async () => {
  const fixture = {
    ACN: { symbol: 'ACN', name: 'Accenture plc', exchange: 'NYSE', currency: 'USD', timestamp: 1762203600, close: '250.10', previous_close: '249.00', is_market_open: false },
    'BTC/USD': { symbol: 'BTC/USD', exchange: 'Coinbase Pro', currency_base: 'Bitcoin', currency_quote: 'US Dollar', timestamp: 1762205000, close: '70000.5', is_market_open: true },
  };
  let calledUrl = '';
  const fetchImpl = async (url) => { calledUrl = url; return { ok: true, status: 200, headers: new Map(), json: async () => fixture }; };
  const p = twelveDataProvider({ apiKey: 'k', fetchImpl });
  const out = await p.fetchQuotes(['ACN', 'BTC/USD']);
  assert.equal(out.ACN.price, 250.10);
  assert.equal(out.ACN.marketOpen, false);
  assert.equal(out.ACN.marketTs, new Date(1762203600 * 1000).toISOString());
  assert.equal(out['BTC/USD'].price, 70000.5);
  assert.ok(!/800000|amount|shares/.test(calledUrl), 'request carries symbols only');
  assert.equal(classifyQuote({ ...out.ACN }, Date.parse(out.ACN.marketTs) + 3600_000), 'closed');
});
