// CSV export helpers. No personal data leaves the device except via the user's own download.

export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(header, rows) {
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

const num = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '' : v.toFixed(d));

/** Holdings export: one row per combined ticker with price source and freshness. */
export function holdingsCSV({ scenario, strategy, basis, asOf, valuation, currency = 'USD', runCreatedAt }) {
  const header = ['scenario', 'strategy', 'return_basis', 'as_of', 'run_started', 'symbol', 'sleeves', 'weight_pct', 'units', 'anchor_price', 'anchor_time', 'latest_price', 'price_time', 'price_source', 'price_status', 'opening_value', 'market_value', 'pnl', 'currency'];
  const rows = valuation.holdings.map((h) => [
    scenario, strategy, basis, asOf, runCreatedAt, h.symbol, h.sleeves.join('+'), num(h.weight * 100, 6),
    h.units === null ? '' : h.units.toFixed(8), h.anchor ? num(h.anchor.price, 6) : '', h.anchor ? h.anchor.marketTs : '',
    num(h.mark, 6), h.quote ? h.quote.marketTs || '' : '', h.quote ? h.quote.source || '' : '', h.quote ? h.quote.status || '' : 'unavailable',
    num(h.openingDollars), num(h.value), num(h.pnl), currency,
  ]);
  rows.push([scenario, strategy, basis, asOf, runCreatedAt, valuation.complete ? 'TOTAL' : `PRICED SUBTOTAL (${(valuation.coverage * 100).toFixed(2)}% coverage)`, '', '', '', '', '', '', '', '', '', num(valuation.pricedCost), num(valuation.pricedValue), valuation.complete ? num(valuation.pnl) : '', currency]);
  return toCSV(header, rows);
}

/** Projection export. */
export function projectionCSV({ scenario, strategy, startDate, rate, rows, currency = 'USD', assumptions }) {
  const header = ['scenario', 'strategy', 'start_date', 'year', 'gross_rate_pct', 'fee_pct', 'inflation_pct', 'requested_withdrawal', 'paid_withdrawal', 'shortfall', 'nominal_balance', 'real_balance_start_year_dollars', 'cumulative_withdrawals', 'cumulative_shortfall', 'currency', 'basis'];
  const out = rows.map((r) => [
    scenario, strategy, startDate, r.year, num((r.rate ?? rate) * 100, 4), num(assumptions.fee * 100, 4), num(assumptions.inflation * 100, 4),
    num(r.requested), num(r.paid), num(r.shortfall), num(r.end), num(r.real), num(r.cumPaid), num(r.cumShortfall), currency, 'pre-investment-tax planning assumption',
  ]);
  return toCSV(header, out);
}
