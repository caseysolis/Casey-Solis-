import { DISPLAY_TZ } from './constants.js';

export const MAX_AMOUNT = 1e12;

/**
 * Parse a typed or pasted dollar amount. Accepts "$1,234,567.89",
 * " 800000 ", "800 000", "USD 1,000". Rejects blanks, negatives,
 * parentheses, more than two decimals and amounts above $1 trillion.
 */
export function parseMoney(input, { allowZero = true, max = MAX_AMOUNT } = {}) {
  if (input === null || input === undefined) return { ok: false, error: 'Enter an amount.' };
  let s = String(input).trim();
  if (s === '') return { ok: false, error: 'Enter an amount.' };
  if (/^\(.*\)$/.test(s) || /^-|^−|\$-|\$−/.test(s.replace(/\s/g, ''))) return { ok: false, error: 'Amount cannot be negative.' };
  s = s.replace(/^usd\s*/i, '').replace(/\s*usd$/i, '');
  s = s.replace(/[$\s  ]/g, '');
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d*)?$|^\.\d+$/.test(s)) return { ok: false, error: 'Enter a dollar amount using digits, commas and up to two decimals.' };
  s = s.replace(/,/g, '');
  const dec = s.split('.')[1];
  if (dec && dec.length > 2) return { ok: false, error: 'Use at most two decimal places (cents).' };
  const v = Number(s);
  if (!Number.isFinite(v)) return { ok: false, error: 'Enter a valid amount.' };
  if (!allowZero && v === 0) return { ok: false, error: 'Amount must be greater than $0.' };
  if (v > max) return { ok: false, error: `Amount must be ${formatUSD(max, { cents: false })} or less.` };
  return { ok: true, value: v };
}

/** Parse a positive count (shares). Fractional shares are preserved. */
export function parseQuantity(input, { max = 1e10 } = {}) {
  const s = String(input ?? '').trim().replace(/[,\s]/g, '');
  if (s === '') return { ok: false, error: 'Enter a share count.' };
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return { ok: false, error: 'Enter a positive number of shares.' };
  const v = Number(s);
  if (!(v > 0)) return { ok: false, error: 'Share count must be greater than zero.' };
  if (v > max) return { ok: false, error: 'Share count is too large.' };
  return { ok: true, value: v };
}

/** Parse a price (positive, up to 6 decimals). */
export function parsePrice(input) {
  const s = String(input ?? '').trim().replace(/[$,\s]/g, '');
  if (s === '') return { ok: false, error: 'Enter a price.' };
  if (!/^\d*\.?\d+$/.test(s)) return { ok: false, error: 'Enter a positive price.' };
  const dec = s.split('.')[1];
  if (dec && dec.length > 6) return { ok: false, error: 'Use at most six decimal places.' };
  const v = Number(s);
  if (!(v > 0)) return { ok: false, error: 'Price must be greater than zero.' };
  if (v > 1e8) return { ok: false, error: 'Price is too large.' };
  return { ok: true, value: v };
}

/** Parse a percentage typed as "2.5" or "2.5%" → 0.025. */
export function parsePercent(input, { min = -99.99, max = 100 } = {}) {
  const s = String(input ?? '').trim().replace(/%$/, '').replace(/−/g, '-').trim();
  if (s === '') return { ok: false, error: 'Enter a percentage.' };
  if (!/^-?\d*\.?\d+$/.test(s)) return { ok: false, error: 'Enter a number, e.g. 2.5.' };
  const v = Number(s);
  if (v < min || v > max) return { ok: false, error: `Enter a value between ${min}% and ${max}%.` };
  return { ok: true, value: v / 100 };
}

const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function roundCents(v) {
  return Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100;
}

export function formatUSD(v, { cents = true, sign = false } = {}) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const s = (cents ? usd2 : usd0).format(Math.abs(v) < 0.005 ? 0 : v);
  if (sign && v > 0.004) return '+' + s;
  return s.replace('-', '−');
}

export function formatMillions(v, digits = 2) {
  if (!Number.isFinite(v)) return '—';
  return `$${(v / 1e6).toFixed(digits)}M`;
}

export function formatPct(v, { digits = 2, sign = false } = {}) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const n = v * 100;
  const s = `${Math.abs(n).toFixed(digits)}%`;
  if (n < 0 && Math.abs(n) >= 0.5 * Math.pow(10, -digits)) return '−' + s;
  if (sign && n > 0) return '+' + s;
  return s;
}

export function formatUnits(v, digits = 4) {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function formatDateTime(iso, { tz = DISPLAY_TZ, withTime = true } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const opts = { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' };
  if (withTime) Object.assign(opts, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return new Intl.DateTimeFormat('en-US', opts).format(d);
}

/** YYYY-MM-DD in America/New_York. */
export function nyDate(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return parts;
}
