// Gross total return with verified, split-adjusted distributions.
// Method (auditable reinvestment): each verified cash distribution D with an
// ex-date price P_ex reinvests into hypothetical units: u ← u × (1 + D / P_ex).
// Hypothetical units live only in this series; the price-only share ledger is
// untouched. Events are de-duplicated by id so reprocessing cannot add value.

const day = (s) => String(s).slice(0, 10);

/**
 * history: { symbol, verifiedThrough: 'YYYY-MM-DD'|null, source, events: [{ id, exDate, amount, exPrice }] }
 * A history with a verifiedThrough date and no events is a verified zero.
 * A missing history is unknown → unavailable.
 */
export function incomeFactor({ anchorDate, throughDate, history }) {
  if (!history || !history.verifiedThrough) {
    return { available: false, reason: 'No verified distribution history' };
  }
  if (day(history.verifiedThrough) < day(throughDate)) {
    return { available: false, reason: `Distributions verified only through ${day(history.verifiedThrough)}` };
  }
  const seen = new Set();
  let factor = 1;
  const applied = [];
  const events = [...(history.events || [])].sort((a, b) => (a.exDate < b.exDate ? -1 : 1));
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (!(day(e.exDate) > day(anchorDate) && day(e.exDate) <= day(throughDate))) continue;
    if (!(e.amount >= 0) || !(e.exPrice > 0)) {
      return { available: false, reason: `Distribution ${e.id} lacks a verified amount or ex-date price` };
    }
    factor *= 1 + e.amount / e.exPrice;
    applied.push(e.id);
  }
  return { available: true, factor, applied, source: history.source || null, through: day(throughDate) };
}

/**
 * Total-return value of a fixed-unit run, weighted by opening invested dollars.
 * marks: { symbol: price at throughDate }.
 */
export function runTotalReturn({ run, marks, histories, throughDate }) {
  const symbols = Object.keys(run.units);
  const missing = [];
  const bySymbol = {};
  let value = 0;
  let cost = 0;
  const allSymbols = [...new Set(run.rows.map((r) => r.symbol))];
  for (const s of allSymbols) {
    if (!symbols.includes(s) || !run.anchors[s]) { missing.push(s); continue; }
    const mark = marks[s];
    if (!(mark > 0)) { missing.push(s); continue; }
    const anchorDate = day(run.anchors[s].marketTs || run.createdAt);
    const f = incomeFactor({ anchorDate, throughDate, history: histories[s] });
    if (!f.available) { missing.push(s); bySymbol[s] = f; continue; }
    const opening = run.units[s] * run.anchors[s].price;
    const v = run.units[s] * mark * f.factor;
    bySymbol[s] = { ...f, opening, value: v, priceReturn: mark / run.anchors[s].price - 1, totalReturn: (mark * f.factor) / run.anchors[s].price - 1 };
    value += v;
    cost += opening;
  }
  if (missing.length) return { available: false, missing, bySymbol, through: day(throughDate) };
  return { available: true, value, cost, totalReturn: cost > 0 ? value / cost - 1 : 0, bySymbol, through: day(throughDate) };
}

/**
 * Pick the total-return window. If every holding's distribution history is
 * verified through the latest mark date, use it. Otherwise, if all are
 * verified through an earlier common date with closes available, offer that
 * dated window. Otherwise report the missing symbols.
 */
export function totalReturnWindow({ run, latestMarks, latestDate, histories }) {
  const symbols = [...new Set(run.rows.map((r) => r.symbol))];
  const noHistory = symbols.filter((s) => !histories[s] || !histories[s].verifiedThrough);
  if (noHistory.length) return { available: false, missing: noHistory, reason: 'Missing verified distribution history' };
  const through = symbols.map((s) => day(histories[s].verifiedThrough)).sort()[0];
  if (through >= day(latestDate)) {
    return runTotalReturn({ run, marks: latestMarks, histories, throughDate: latestDate });
  }
  const marks = {};
  const missingCloses = [];
  for (const s of symbols) {
    const c = histories[s].closes && histories[s].closes[through];
    if (c > 0) marks[s] = c; else missingCloses.push(s);
  }
  if (missingCloses.length) return { available: false, missing: missingCloses, reason: `No verified close on common date ${through}` };
  return { ...runTotalReturn({ run, marks, histories, throughDate: through }), dated: true };
}
