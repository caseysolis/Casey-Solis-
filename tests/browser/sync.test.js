// Section 06 sync fixture in isolated browser identities.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, mock, quotesAt, signIn, waitSaved, collectErrors } from './fixtures.js';
import { check, record } from './ledger.js';

let srv;
let browser;
const ENV = 'Chromium (Playwright, headless), two isolated browser contexts, local server';

before(async () => {
  ({ srv, browser } = await setup({ users: [['owner@example.com', 'correct-horse-battery'], ['intruder@example.com', 'intruder-long-password']] }));
  await mock(srv, { quotes: quotesAt(100, { ACN: 200 }) });
});
after(async () => { await browser.close(); await srv.close(); });

const t = async (page, id) => (await page.getByTestId(id).first().textContent()).replace(/\s+/g, ' ').trim();

test('two-session sync, offline retry, conflicts, sign-out, unauthorized access, offline start', async () => {
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errs = [...collectErrors(a), ...collectErrors(b)];

  await signIn(a, srv.base);
  await waitSaved(a);
  // Session A saves a changed (fractional) ACN share count.
  await a.getByTestId('update-position').click();
  await a.getByTestId('mode-shares').click();
  await a.getByTestId('d-shares').fill('3500.125');
  await a.getByTestId('d-price').fill('200');
  await a.getByTestId('d-confirm').click();
  await a.getByTestId('f-draw').count(); // no-op
  await a.goto(`${srv.base}/#/myacn/acn/projections`);
  await a.getByTestId('f-acnReturn').fill('4.5');
  await a.getByTestId('f-acnReturn').press('Enter');
  await waitSaved(a);
  const runsA = await a.evaluate(() => window.__acnSim.state.tabs.myacn.runs.length);

  // Clean profile B, same account.
  await signIn(b, srv.base);
  await b.goto(`${srv.base}/#/myacn/acn/today`);
  await b.reload();
  await b.getByTestId('hero').waitFor();
  const capB = await t(b, 'opening-capital');
  await b.getByTestId('holding-ACN-acn').locator('button').click();
  const unitsB = await t(b, 'detail-units');
  await b.getByTestId('holding-close').click();
  const runsB = await b.evaluate(() => window.__acnSim.state.tabs.myacn.runs.length);
  const anchorB = await b.evaluate(() => { const t = window.__acnSim.state.tabs.myacn; const bl = t.baselines.at(-1); return `${bl.shares}@${bl.anchorPrice}`; });
  const retB = await b.evaluate(() => window.__acnSim.state.tabs.myacn.assumptions.acnReturn);
  check(assert.ok, 'Sync', 'Session A share count → session B after reload', '3,500.125 shares @ $200, $700,025.00, same runs, ACN return 4.5%', `${capB}; ${unitsB}; ${anchorB}; runs ${runsB}/${runsA}; ${retB}`,
    capB === '$700,025.00' && unitsB.startsWith('3,500.125') && anchorB === '3500.125@200' && runsB === runsA && Math.abs(retB - 0.045) < 1e-12);
  for (const [k, v] of [['low', '$31,982,606.00'], ['central', '$46,319,141.00'], ['high', '$63,230,106.00']]) {
    await b.goto(`${srv.base}/#/${k}/today`);
    const o = await t(b, 'opening-capital');
    check(assert.ok, 'Sync', `Other tab ${k} unchanged`, v, o, o === v);
  }

  // Edit in B, verify in A.
  await b.goto(`${srv.base}/#/central/projections`);
  await b.getByTestId('f-draw').fill('600,000');
  await b.getByTestId('f-draw').press('Enter');
  await waitSaved(b);
  await a.goto(`${srv.base}/#/central/projections`);
  await a.reload();
  await a.getByTestId('hero').waitFor();
  const drawA = await a.getByTestId('f-draw').inputValue();
  check(assert.ok, 'Sync', 'Edit in session B → visible in A', '600,000', drawA, drawA === '600,000');

  // Offline edit in A: pending, then retried on reconnect.
  await ctxA.setOffline(true);
  await a.evaluate(() => window.dispatchEvent(new Event('offline')));
  await a.getByTestId('f-inflation').fill('3');
  await a.getByTestId('f-inflation').press('Enter');
  await a.waitForFunction(() => /Offline/.test(document.querySelector('[data-testid="sync-status"]').textContent));
  const off = await t(a, 'sync-status');
  record('Sync', 'Edit while offline', 'Offline — pending shown', off, /Offline — \d+ pending/.test(off), ENV);
  await ctxA.setOffline(false);
  await a.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitSaved(a);
  await b.reload();
  await b.getByTestId('hero').waitFor();
  const infB = await b.getByTestId('f-inflation').inputValue();
  check(assert.ok, 'Sync', 'Reconnect retries pending edit once', 'B sees inflation 3', infB, infB === '3');

  // Concurrent saves: B edits on a stale revision → conflict, resolved by choice.
  await a.reload();
  await a.getByTestId('hero').waitFor();
  await a.getByTestId('f-fee').fill('0.5');
  await a.getByTestId('f-fee').press('Enter');
  await waitSaved(a);
  await b.getByTestId('f-fee').fill('0.75');
  await b.getByTestId('f-fee').press('Enter');
  await b.getByTestId('conflict').waitFor({ timeout: 8000 });
  record('Sync', 'Concurrent save from stale session', 'conflict banner, no silent overwrite', await t(b, 'sync-status'), true, ENV);
  await b.getByRole('button', { name: "Load the other device's version" }).click();
  await waitSaved(b);
  const feeB = await b.getByTestId('f-fee').inputValue();
  check(assert.ok, 'Sync', 'Resolve conflict → load other version', 'fee 0.5', feeB, feeB === '0.5');
  await b.getByTestId('f-fee').fill('0.6');
  await b.getByTestId('f-fee').press('Enter');
  await waitSaved(b);
  await a.reload();
  await a.getByTestId('hero').waitFor();
  record('Sync', 'Edit after resolution propagates', 'A sees 0.6', await a.getByTestId('f-fee').inputValue(), (await a.getByTestId('f-fee').inputValue()) === '0.6', ENV);

  // Offline start from the device cache (service worker shell + cached state).
  await a.evaluate(async () => { await navigator.serviceWorker.ready; });
  await a.reload();
  await a.getByTestId('hero').waitFor();
  await ctxA.setOffline(true);
  await a.reload().catch(() => {});
  let offlineOk = false;
  try { await a.getByTestId('hero').waitFor({ timeout: 8000 }); offlineOk = /offline/i.test(await a.locator('#main').textContent()); } catch { offlineOk = false; }
  check(assert.ok, 'Sync', 'Offline start (reload with network off)', 'cached workspace renders with offline notice', offlineOk, offlineOk);
  await ctxA.setOffline(false);
  await a.reload();
  await a.getByTestId('hero').waitFor();

  // Unauthorized access to a known record id from another identity.
  const recId = await b.evaluate(() => window.__acnSim.sync.meta['tab:myacn'].id);
  const ctxC = await browser.newContext();
  const c = await ctxC.newPage();
  await signIn(c, srv.base, 'intruder@example.com', 'intruder-long-password');
  const status = await c.evaluate(async (id) => (await fetch(`/api/records/${id}`)).status, recId);
  const del = await c.evaluate(async (id) => (await fetch(`/api/records/${id}`, { method: 'DELETE', headers: { 'x-acn-client': '1' } })).status, recId);
  const intruderCap = await t(c, 'opening-capital');
  check(assert.ok, 'Privacy', 'Other account reads/deletes known record id', '404 / 404; own default $800,000.00', `${status} / ${del}; ${intruderCap}`, status === 404 && del === 404 && intruderCap === '$800,000.00');
  const anon = await ctxC.request.get(`${srv.base}/api/records/${recId}`, { headers: { cookie: '' } });
  record('Privacy', 'Anonymous read', '401', anon.status(), [401, 404].includes(anon.status()), ENV);

  // Sign-out clears private cached views.
  await b.getByTestId('signout').click();
  await b.getByTestId('l-email').waitFor();
  const keys = await b.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('acn:')));
  const apiAfter = await b.evaluate(async () => (await fetch('/api/records')).status);
  check(assert.ok, 'Privacy', 'Sign-out', 'login screen; no acn: cache keys; API 401', `${keys.length} keys; ${apiAfter}`, keys.length === 0 && apiAfter === 401);
  const aStill = await a.evaluate(async () => (await fetch('/api/records')).status);
  record('Sync', 'Other session after sign-out in B', 'still signed in (200)', aStill, aStill === 200, ENV);

  record('Console', 'No page errors in sync sessions', 'none', JSON.stringify(errs.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e))), errs.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e)).length === 0, ENV);
  await ctxA.close(); await ctxB.close(); await ctxC.close();
});
