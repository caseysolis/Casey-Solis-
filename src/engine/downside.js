import { SHOCKS, SLEEVES, MAX_YEARS } from './constants.js';
import { getMix, assertRetention } from './allocation.js';
import { project, validateRate } from './forecast.js';

export function getShock(key) {
  const s = SHOCKS[key];
  if (!s) throw new RangeError(`Unknown shock scenario: ${key}`);
  return s;
}

/**
 * Instantaneous sleeve shock applied before spending and fees.
 * ACN uses its own, separately labelled price-shock input — it is never
 * assumed to behave like the innovation sleeve.
 */
export function shockResult({ capital, p, mixKey, shockKey, acnShock = -0.30 }) {
  assertRetention(p);
  validateRate(acnShock, 'ACN price shock');
  const mix = getMix(mixKey);
  const shock = getShock(shockKey);
  const bySleeve = {
    acn: capital * p * acnShock,
    ...Object.fromEntries(SLEEVES.map((s) => [s, capital * (1 - p) * mix[s] * shock[s]])),
  };
  const change = Object.values(bySleeve).reduce((a, b) => a + b, 0);
  const pct = capital > 0 ? change / capital : 0;
  return {
    pct, // negative number for a loss
    lossPct: -pct,
    dollarLoss: -change,
    remaining: capital + change,
    bySleeve,
  };
}

/**
 * Early vs late shock: the same one-year shock and 19 base years with
 * identical withdrawals; only the order differs.
 */
export function earlyLate({ capital, baseRate, shockPct, fee = 0, draw = 0, inflation = 0.025, years = MAX_YEARS }) {
  const base = Array.from({ length: years - 1 }, () => baseRate);
  const early = project({ capital, rate: [shockPct, ...base], fee, draw, inflation, years });
  const late = project({ capital, rate: [...base, shockPct], fee, draw, inflation, years });
  return { early, late };
}
