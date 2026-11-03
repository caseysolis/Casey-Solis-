import { MIXES, SLEEVES, SLEEVE_CONSTITUENTS, INSTRUMENTS } from './constants.js';

export function assertRetention(p) {
  if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) {
    throw new RangeError('Direct ACN retention must be between 0% and 100%.');
  }
}

export function getMix(mixKey) {
  const mix = MIXES[mixKey];
  if (!mix) throw new RangeError(`Unknown research mix: ${mixKey}`);
  return mix;
}

/**
 * Sleeve-level holding rows (one per sleeve contribution). Weights are full
 * precision fractions of opening capital. Duplicate tickers (SGOV in core and
 * extra bills) are kept as separate rows here.
 */
export function holdingRows(p, mixKey) {
  assertRetention(p);
  const mix = getMix(mixKey);
  const rows = [];
  if (p > 0) {
    rows.push({ sleeve: 'acn', symbol: 'ACN', name: INSTRUMENTS.ACN.name, sleeveWeight: 1, withinWeight: 1, weight: p });
  }
  if (p < 1) {
    for (const sleeve of SLEEVES) {
      const sw = mix[sleeve];
      if (!(sw > 0)) continue;
      for (const c of SLEEVE_CONSTITUENTS[sleeve]) {
        rows.push({
          sleeve,
          symbol: c.symbol,
          name: INSTRUMENTS[c.symbol].name,
          category: c.category || null,
          sleeveWeight: sw,
          withinWeight: c.w,
          weight: (1 - p) * sw * c.w,
        });
      }
    }
  }
  return rows;
}

/** Target dollars for each sleeve contribution. */
export function targetRows(capital, p, mixKey) {
  return holdingRows(p, mixKey).map((r) => ({ ...r, dollars: capital * r.weight }));
}

/** Combine duplicate tickers for price calculations. */
export function combineBySymbol(rows) {
  const map = new Map();
  for (const r of rows) {
    const cur = map.get(r.symbol);
    if (cur) {
      cur.weight += r.weight;
      if (r.dollars !== undefined) cur.dollars += r.dollars;
      cur.sleeves.push(r.sleeve);
    } else {
      map.set(r.symbol, { symbol: r.symbol, name: r.name, weight: r.weight, dollars: r.dollars, sleeves: [r.sleeve] });
    }
  }
  return [...map.values()];
}

/** Dollars by sleeve, e.g. { acn, innovation, core, bills }. */
export function sleeveDollars(capital, p, mixKey) {
  const mix = getMix(mixKey);
  return {
    acn: capital * p,
    innovation: capital * (1 - p) * mix.innovation,
    core: capital * (1 - p) * mix.core,
    bills: capital * (1 - p) * mix.bills,
  };
}

export function totalWeight(rows) {
  return rows.reduce((s, r) => s + r.weight, 0);
}
