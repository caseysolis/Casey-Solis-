// Market-data providers. Only symbols are ever sent to a provider — never
// amounts, share counts or account data. API keys stay on the server.
import { INSTRUMENTS } from '../../src/engine/constants.js';

export class ProviderError extends Error {
  constructor(message, { status = 0, retryAfterMs = 0, kind = 'error' } = {}) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.kind = kind; // 'rate-limit' | 'auth' | 'timeout' | 'error'
  }
}

async function fetchJSON(url, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { accept: 'application/json', 'user-agent': 'acn-portfolio-simulator/1.1' } });
    if (res.status === 429) throw new ProviderError('Provider rate limit', { status: 429, retryAfterMs: Number(res.headers.get('retry-after') || 60) * 1000, kind: 'rate-limit' });
    if (res.status === 401 || res.status === 403) throw new ProviderError(`Provider refused credentials (${res.status})`, { status: res.status, kind: 'auth' });
    if (!res.ok) throw new ProviderError(`Provider HTTP ${res.status}`, { status: res.status });
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new ProviderError('Provider timeout', { kind: 'timeout' });
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const VENUE_ALIASES = {
  NYSE: ['NYSE'], NASDAQ: ['NASDAQ'], 'NYSE Arca': ['NYSE ARCA', 'NYSEARCA', 'ARCA', 'NYSE'], 'Crypto (24/7)': [],
};

/** Reject quotes whose identity (symbol, currency, venue) does not match the instrument list. */
export function verifyIdentity(symbol, { returnedSymbol, currency, exchange }) {
  const inst = INSTRUMENTS[symbol];
  if (!inst) return 'Unknown instrument';
  if (returnedSymbol && returnedSymbol.toUpperCase() !== symbol.toUpperCase()) return `Symbol mismatch (${returnedSymbol})`;
  if (currency && currency.toUpperCase() !== 'USD') return `Currency mismatch (${currency})`;
  const allowed = VENUE_ALIASES[inst.venue] || [];
  if (exchange && allowed.length && !allowed.includes(String(exchange).toUpperCase())) return `Venue mismatch (${exchange})`;
  return null;
}

/**
 * Twelve Data (https://twelvedata.com/docs) — batch /quote for equities, ETFs
 * and BTC/USD; /dividends, /splits and /time_series for income history.
 * Use requires a plan whose terms permit display in this private site.
 */
export function twelveDataProvider({ apiKey, entitlement = 'delayed', fetchImpl = fetch, base = 'https://api.twelvedata.com' }) {
  return {
    name: 'Twelve Data',
    id: 'twelvedata',
    async fetchQuotes(symbols) {
      const url = `${base}/quote?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${encodeURIComponent(apiKey)}`;
      const body = await fetchJSON(url, { fetchImpl });
      if (body && body.code && body.status === 'error') {
        if (body.code === 429) throw new ProviderError(body.message || 'rate limit', { status: 429, retryAfterMs: 60_000, kind: 'rate-limit' });
        if (body.code === 401 || body.code === 403) throw new ProviderError(body.message || 'auth', { status: body.code, kind: 'auth' });
        throw new ProviderError(body.message || 'provider error', { status: body.code });
      }
      const bySymbol = symbols.length === 1 ? { [symbols[0]]: body } : body;
      const fetchedAt = new Date().toISOString();
      const out = {};
      for (const s of symbols) {
        const d = bySymbol[s];
        if (!d || d.status === 'error' || d.code) { out[s] = { symbol: s, error: d?.message || 'No data' }; continue; }
        const idErr = verifyIdentity(s, { returnedSymbol: d.symbol, currency: d.currency || (s === 'BTC/USD' ? 'USD' : undefined), exchange: s === 'BTC/USD' ? null : d.exchange });
        if (idErr) { out[s] = { symbol: s, error: idErr }; continue; }
        const tsSec = Number(d.last_quote_at || d.timestamp);
        out[s] = {
          symbol: s,
          price: Number(d.close),
          previousClose: Number(d.previous_close) || null,
          currency: 'USD',
          source: 'Twelve Data',
          venue: d.exchange || INSTRUMENTS[s].venue,
          session: d.is_market_open ? 'regular' : 'closed',
          marketOpen: s === 'BTC/USD' ? true : !!d.is_market_open,
          marketTs: Number.isFinite(tsSec) ? new Date(tsSec * 1000).toISOString() : null,
          fetchedAt,
          entitlement,
          delayNote: entitlement === 'realtime' ? 'Real-time per plan entitlement' : 'Delayed per plan entitlement',
        };
      }
      return out;
    },
    async fetchHistory(symbol, fromDate) {
      const s = encodeURIComponent(symbol);
      const k = encodeURIComponent(apiKey);
      const [div, splits, ts] = await Promise.all([
        INSTRUMENTS[symbol].kind === 'crypto' ? Promise.resolve({ dividends: [] }) : fetchJSON(`${base}/dividends?symbol=${s}&start_date=${fromDate}&apikey=${k}`, { fetchImpl }),
        INSTRUMENTS[symbol].kind === 'crypto' ? Promise.resolve({ splits: [] }) : fetchJSON(`${base}/splits?symbol=${s}&start_date=${fromDate}&apikey=${k}`, { fetchImpl }),
        fetchJSON(`${base}/time_series?symbol=${s}&interval=1day&start_date=${fromDate}&outputsize=5000&apikey=${k}`, { fetchImpl }),
      ]);
      if (ts.status === 'error') throw new ProviderError(ts.message || 'history error');
      const closes = {};
      for (const v of ts.values || []) closes[v.datetime.slice(0, 10)] = Number(v.close);
      const dates = Object.keys(closes).sort();
      const events = (div.dividends || []).map((d) => ({ id: `${symbol}:div:${d.ex_date}:${d.amount}`, exDate: d.ex_date, amount: Number(d.amount), exPrice: closes[d.ex_date] || null }));
      return {
        symbol,
        source: INSTRUMENTS[symbol].kind === 'crypto' ? 'Spot asset — no distributions' : 'Twelve Data dividends + daily closes',
        verifiedThrough: dates.at(-1) || null,
        events,
        splits: (splits.splits || []).map((x) => ({ id: `${symbol}:split:${x.date}`, symbol, date: `${x.date}T13:30:00.000Z`, ratio: Number(x.to_factor) / Number(x.from_factor) })),
        closes,
      };
    },
  };
}

/** Coinbase Exchange public ticker for BTC-USD (timestamped, 24/7). */
export function coinbaseProvider({ fetchImpl = fetch, entitlement = 'realtime' } = {}) {
  return {
    name: 'Coinbase Exchange (public ticker)',
    id: 'coinbase',
    supports: (s) => s === 'BTC/USD',
    async fetchQuotes(symbols) {
      const out = {};
      if (!symbols.includes('BTC/USD')) return out;
      const d = await fetchJSON('https://api.exchange.coinbase.com/products/BTC-USD/ticker', { fetchImpl });
      out['BTC/USD'] = {
        symbol: 'BTC/USD', price: Number(d.price), currency: 'USD', source: 'Coinbase Exchange', venue: 'Coinbase', session: '24/7',
        marketOpen: true, marketTs: d.time ? new Date(d.time).toISOString() : null, fetchedAt: new Date().toISOString(), entitlement,
      };
      return out;
    },
  };
}

/** Deterministic mock for tests. Behaviour is set through the test hook only. */
export function mockProvider(control) {
  return {
    name: 'Mock (tests only)',
    id: 'mock',
    async fetchQuotes(symbols) {
      control.calls = (control.calls || 0) + 1;
      control.lastSymbols = symbols;
      if (control.delayMs) await new Promise((r) => setTimeout(r, control.delayMs));
      if (control.fail === '429') throw new ProviderError('rate limit', { status: 429, retryAfterMs: control.retryAfterMs ?? 30_000, kind: 'rate-limit' });
      if (control.fail === '401') throw new ProviderError('unauthorized', { status: 401, kind: 'auth' });
      if (control.fail === '403') throw new ProviderError('forbidden', { status: 403, kind: 'auth' });
      if (control.fail === 'timeout') throw new ProviderError('timeout', { kind: 'timeout' });
      if (control.fail === '500') throw new ProviderError('HTTP 500', { status: 500 });
      const out = {};
      const fetchedAt = new Date().toISOString();
      for (const s of symbols) {
        const c = (control.quotes || {})[s];
        if (!c || c.missing) { out[s] = { symbol: s, error: 'No data' }; continue; }
        out[s] = { symbol: s, currency: 'USD', source: 'Mock provider', venue: INSTRUMENTS[s]?.venue, session: c.marketOpen === false ? 'closed' : 'regular', marketOpen: c.marketOpen !== false, entitlement: c.entitlement || 'delayed', fetchedAt, ...c };
      }
      return out;
    },
    async fetchHistory(symbol) {
      const h = (control.history || {})[symbol];
      if (!h) throw new ProviderError('No history');
      return h;
    },
  };
}
