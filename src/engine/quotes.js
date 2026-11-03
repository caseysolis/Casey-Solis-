// Quote status classification shared by the server adapter and the UI.
import { INSTRUMENTS } from './constants.js';

export const STATUS_LABELS = {
  live: 'Live',
  delayed: 'Delayed',
  closed: 'Market closed',
  cached: 'Cached',
  stale: 'Stale',
  manual: 'Manual',
  unavailable: 'Unavailable',
  bad: 'Rejected quote',
};

export function isUsablePrice(price) {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

/**
 * Classify a normalized quote. "Live" requires a real-time entitlement, an
 * open session and a fresh market timestamp. Everything else is labelled for
 * what it is.
 */
export function classifyQuote(q, now = Date.now()) {
  if (!q || q.error) return 'unavailable';
  if (!isUsablePrice(q.price)) return 'bad';
  if (q.source === 'manual') return 'manual';
  const ts = Date.parse(q.marketTs);
  if (!Number.isFinite(ts)) return 'stale';
  const age = now - ts;
  const kind = INSTRUMENTS[q.symbol]?.kind || 'equity';
  if (kind === 'crypto') {
    if (age > 30 * 60 * 1000) return 'stale';
    if (q.fromCache) return 'cached';
    if (q.entitlement === 'realtime' && age <= 2 * 60 * 1000) return 'live';
    return 'delayed';
  }
  if (q.marketOpen === false) {
    // Prior official close: acceptable until a few calendar days pass (weekends, holidays).
    if (age > 4 * 24 * 3600 * 1000) return 'stale';
    return q.fromCache ? 'cached' : 'closed';
  }
  if (q.fromCache) return age > 60 * 60 * 1000 ? 'stale' : 'cached';
  if (q.entitlement === 'realtime' && age <= 5 * 60 * 1000) return 'live';
  if (age <= 60 * 60 * 1000) return 'delayed';
  return 'stale';
}

/** A quote can value a holding if it has a positive price (stale ones are still shown, labelled). */
export function isValuable(q) {
  return !!q && !q.error && isUsablePrice(q.price);
}

/** Merge a newer quote into a map, discarding out-of-order (older) responses. */
export function mergeQuote(existing, incoming) {
  if (!incoming) return existing;
  if (!existing || existing.error) return incoming;
  if (incoming.error) return existing; // provider failure keeps last verified values
  if (incoming.source === 'manual' || existing.source === 'manual') {
    // Manual quotes win only when newer by their stated date.
    return Date.parse(incoming.marketTs) >= Date.parse(existing.marketTs) ? incoming : existing;
  }
  const a = Date.parse(existing.marketTs);
  const b = Date.parse(incoming.marketTs);
  if (Number.isFinite(a) && Number.isFinite(b) && b < a) return existing;
  return incoming;
}
