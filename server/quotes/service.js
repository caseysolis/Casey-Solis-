// Quote adapter: caching, batching, de-duplicated concurrent refreshes,
// rate-limit back-off and last-verified fallback.
import { classifyQuote, mergeQuote, isUsablePrice } from '../../src/engine/quotes.js';
import { ALL_SYMBOLS } from '../../src/engine/constants.js';

export class QuoteService {
  constructor({ providers, minIntervalMs = 20_000, now = () => Date.now() }) {
    this.providers = providers; // ordered by preference
    this.minIntervalMs = minIntervalMs;
    this.now = now;
    this.cache = new Map(); // symbol → last verified normalized quote
    this.fetchedAt = new Map(); // symbol → ms of last successful fetch
    this.inflight = null; // single batched refresh at a time
    this.backoff = new Map(); // provider id → { until, n }
    this.lastErrors = {};
  }

  /** Only the fixed instrument list may be requested. */
  static sanitize(symbols) {
    const list = [...new Set(String(symbols || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
    return list.filter((s) => ALL_SYMBOLS.includes(s));
  }

  async get(symbols) {
    const now = this.now();
    const due = symbols.filter((s) => !(this.fetchedAt.get(s) > now - this.minIntervalMs));
    if (due.length) await this.refresh(due);
    return this.snapshot(symbols);
  }

  async refresh(symbols) {
    // De-duplicate concurrent refreshes: join an in-flight batch that covers these symbols.
    if (this.inflight) {
      const cur = this.inflight;
      await cur.promise.catch(() => {});
      const remaining = symbols.filter((s) => !cur.symbols.includes(s));
      if (!remaining.length) return;
      symbols = remaining;
    }
    const promise = this.#doRefresh(symbols);
    this.inflight = { symbols, promise };
    try { await promise; } finally { if (this.inflight && this.inflight.promise === promise) this.inflight = null; }
  }

  async #doRefresh(symbols) {
    let remaining = [...symbols];
    for (const p of this.providers) {
      if (!remaining.length) break;
      const mine = p.supports ? remaining.filter(p.supports) : remaining;
      if (!mine.length) continue;
      const b = this.backoff.get(p.id);
      if (b && b.until > this.now()) { this.lastErrors[p.id] = { kind: 'rate-limit', until: new Date(b.until).toISOString() }; continue; }
      try {
        const res = await p.fetchQuotes(mine);
        this.backoff.delete(p.id);
        delete this.lastErrors[p.id];
        for (const s of mine) {
          const q = res[s];
          if (!q || q.error || !isUsablePrice(q.price) || !q.marketTs) {
            if (q && !q.error && !isUsablePrice(q.price)) this.lastErrors[`${p.id}:${s}`] = { kind: 'bad-quote', price: String(q.price) };
            continue;
          }
          const merged = mergeQuote(this.cache.get(s), q);
          this.cache.set(s, merged);
          this.fetchedAt.set(s, this.now());
        }
        remaining = remaining.filter((s) => !(this.fetchedAt.get(s) > this.now() - 1000));
      } catch (e) {
        if (e.kind === 'rate-limit') {
          const n = (b?.n || 0) + 1;
          const wait = Math.max(e.retryAfterMs || 0, 15_000 * 2 ** (n - 1));
          this.backoff.set(p.id, { until: this.now() + Math.min(wait, 15 * 60_000), n });
        }
        this.lastErrors[p.id] = { kind: e.kind || 'error', status: e.status || null, message: e.message };
      }
    }
  }

  snapshot(symbols) {
    const now = this.now();
    const out = {};
    for (const s of symbols) {
      const c = this.cache.get(s);
      if (!c) { out[s] = { symbol: s, error: 'unavailable', status: 'unavailable' }; continue; }
      const fresh = this.fetchedAt.get(s) > now - Math.max(this.minIntervalMs * 3, 90_000);
      const q = { ...c, fromCache: !fresh };
      q.status = classifyQuote(q, now);
      out[s] = q;
    }
    return out;
  }

  status() {
    return {
      providers: this.providers.map((p) => ({ id: p.id, name: p.name, backoffUntil: this.backoff.get(p.id)?.until ? new Date(this.backoff.get(p.id).until).toISOString() : null })),
      errors: this.lastErrors,
    };
  }
}

export class HistoryService {
  constructor({ provider, ttlMs = 6 * 3600 * 1000, now = () => Date.now() }) {
    this.provider = provider;
    this.ttlMs = ttlMs;
    this.now = now;
    this.cache = new Map();
  }

  async get(symbols, fromDate) {
    const out = {};
    await Promise.all(symbols.map(async (s) => {
      const key = `${s}|${fromDate}`;
      const c = this.cache.get(key);
      if (c && c.at > this.now() - this.ttlMs) { out[s] = c.value; return; }
      if (!this.provider || !this.provider.fetchHistory) { out[s] = { symbol: s, verifiedThrough: null, unavailable: 'No history provider configured' }; return; }
      try {
        const value = await this.provider.fetchHistory(s, fromDate);
        this.cache.set(key, { at: this.now(), value });
        out[s] = value;
      } catch (e) {
        out[s] = c ? { ...c.value, cached: true } : { symbol: s, verifiedThrough: null, unavailable: e.message };
      }
    }));
    return out;
  }
}
