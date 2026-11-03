// Shared browser-test fixtures: a real server with the mock quote provider.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); // project devDependency or the preinstalled global copy
import { startServer } from '../helpers.js';

export const NOW_MS = Date.now();
export const SYMBOLS = ['ACN', 'BTC/USD', 'NVDA', 'AMZN', 'GOOGL', 'AVGO', 'TSLA', 'COIN', 'XYZ', 'ISRG', 'ROK', 'ADSK', 'VTI', 'VXUS', 'BND', 'VTIP', 'VIG', 'SGOV'];

export function quotesAt(price, overrides = {}, extra = {}) {
  const ts = new Date(Date.now() - 60_000).toISOString();
  return Object.fromEntries(SYMBOLS.map((s) => [s, { price: overrides[s] ?? price, marketTs: ts, entitlement: 'delayed', ...extra }]));
}

export async function setup({ users = [['owner@example.com', 'correct-horse-battery']] } = {}) {
  const srv = await startServer();
  for (const [e, p] of users) srv.auth.createUser(e, p);
  const browser = await chromium.launch();
  return { srv, browser };
}

export async function mock(srv, control, extra = {}) {
  await fetch(`${srv.base}/api/test/mock`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acn-client': '1' }, body: JSON.stringify({ control, ...extra }) });
}

export async function signIn(page, base, email = 'owner@example.com', password = 'correct-horse-battery') {
  await page.goto(base + '/');
  await page.getByTestId('l-email').fill(email);
  await page.getByTestId('l-pass').fill(password);
  await page.getByTestId('l-submit').click();
  await page.getByTestId('hero').waitFor();
}

export async function waitSaved(page) {
  await page.waitForFunction(() => document.querySelector('[data-testid="sync-status"]')?.textContent === 'Saved', null, { timeout: 10_000 });
}

export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return errors;
}
