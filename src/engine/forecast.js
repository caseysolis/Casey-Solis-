import { MARKET_PATHS, SLEEVES, MAX_YEARS } from './constants.js';
import { getMix, assertRetention } from './allocation.js';

export function getPath(pathKey) {
  const path = MARKET_PATHS[pathKey];
  if (!path) throw new RangeError(`Unknown market path: ${pathKey}`);
  return path;
}

/** Weighted nominal return of the diversified portion for a mix and market path. */
export function diversifiedRate(mixKey, pathKey) {
  const mix = getMix(mixKey);
  const path = getPath(pathKey);
  return SLEEVES.reduce((s, k) => s + mix[k] * path[k], 0);
}

/** r = p × ACN return + (1 − p) × weighted diversified return. */
export function grossRate({ p, mixKey, pathKey, acnReturn = 0 }) {
  assertRetention(p);
  validateRate(acnReturn, 'ACN return');
  return p * acnReturn + (1 - p) * diversifiedRate(mixKey, pathKey);
}

export function validateRate(r, label = 'Return') {
  if (typeof r !== 'number' || !Number.isFinite(r)) throw new RangeError(`${label} must be a number.`);
  if (r <= -1) throw new RangeError(`${label} must be greater than −100%.`);
  if (r > 1) throw new RangeError(`${label} must be 100% or less.`);
}

export function validateForecastInputs({ capital, fee, draw, inflation }) {
  if (!Number.isFinite(capital) || capital < 0) throw new RangeError('Starting capital cannot be negative.');
  if (!Number.isFinite(fee) || fee < 0 || fee >= 1) throw new RangeError('Annual fee must be between 0% and 99.99%.');
  if (!Number.isFinite(draw) || draw < 0) throw new RangeError('Annual withdrawal cannot be negative.');
  if (!Number.isFinite(inflation) || inflation <= -1 || inflation > 1) throw new RangeError('Inflation must be between −99.99% and 100%.');
}

/**
 * Annual year-end projection.
 *   available = B[t−1] × (1+r_t) × (1−f)
 *   requested = W × (1+i)^(t−1)
 *   paid      = min(available, requested)
 *   B[t]      = available − paid
 *   real      = B[t] ÷ (1+i)^t
 * `rate` may be a number or an array of per-year rates (index 0 = year 1).
 */
export function project({ capital, rate, fee = 0, draw = 0, inflation = 0.025, years = MAX_YEARS }) {
  validateForecastInputs({ capital, fee, draw, inflation });
  const rates = Array.isArray(rate) ? rate : Array.from({ length: years }, () => rate);
  if (rates.length < years) throw new RangeError('Not enough annual rates for the horizon.');
  rates.slice(0, years).forEach((r) => validateRate(r));

  const rows = [{ year: 0, start: capital, available: capital, requested: 0, paid: 0, shortfall: 0, end: capital, real: capital, cumPaid: 0, cumShortfall: 0, depleted: capital <= 0 }];
  let b = capital;
  let cumPaid = 0;
  let cumShortfall = 0;
  for (let t = 1; t <= years; t++) {
    const r = rates[t - 1];
    const start = b;
    const available = Math.max(0, b * (1 + r) * (1 - fee));
    const requested = draw * Math.pow(1 + inflation, t - 1);
    const paid = Math.min(available, requested);
    const shortfall = requested - paid;
    b = available - paid;
    if (b < 1e-9) b = 0;
    cumPaid += paid;
    cumShortfall += shortfall;
    rows.push({
      year: t,
      rate: r,
      start,
      available,
      requested,
      paid,
      shortfall,
      end: b,
      real: b / Math.pow(1 + inflation, t),
      cumPaid,
      cumShortfall,
      depleted: b <= 0,
    });
  }
  return rows;
}

/** Projection for a strategy (direct ACN retention p) in a scenario. */
export function projectStrategy({ capital, p, mixKey, pathKey, acnReturn = 0, fee = 0, draw = 0, inflation = 0.025, years = MAX_YEARS }) {
  const rate = grossRate({ p, mixKey, pathKey, acnReturn });
  return { rate, rows: project({ capital, rate, fee, draw, inflation, years }) };
}

/** First year at which the path is depleted, or null. */
export function depletionYear(rows) {
  const r = rows.find((x) => x.year > 0 && x.depleted);
  return r ? r.year : null;
}

/**
 * Annual ACN total return that would let a hold-all ACN position match the
 * selected diversified mix under identical fees and cash flows. Found by
 * bisection on (ending balance + cumulative withdrawals paid), which is
 * non-decreasing in the rate. With identical flows the answer equals the
 * diversified rate; the solver is kept so the figure is computed, not assumed.
 */
export function breakEvenAcnReturn({ capital, mixKey, pathKey, fee = 0, draw = 0, inflation = 0.025, years = MAX_YEARS }) {
  const target = diversifiedRate(mixKey, pathKey);
  const metric = (r) => {
    const rows = project({ capital, rate: r, fee, draw, inflation, years });
    const last = rows[rows.length - 1];
    return last.end + last.cumPaid;
  };
  if (capital <= 0) return target;
  const goal = metric(target);
  let lo = -0.99;
  let hi = 1;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (metric(mid) < goal) lo = mid; else hi = mid;
    if (hi - lo < 1e-13) break;
  }
  return (lo + hi) / 2;
}
