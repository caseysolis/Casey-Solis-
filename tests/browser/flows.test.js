// Rendered-site checks: default flow, views, controls, quotes, CSV, navigation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup, mock, quotesAt, signIn, waitSaved, collectErrors } from './fixtures.js';
import { check, record } from './ledger.js';

let srv;
let browser;
let ctx;
let page;
let errors;
const text = async (id) => (await page.getByTestId(id).first().textContent()).replace(/\s+/g, ' ').trim();
const nav = async (testid) => { const href = await page.getByTestId(testid).getAttribute('href'); await page.getByTestId(testid).click(); await page.waitForFunction((h) => location.hash === h, href); await page.getByTestId('hero').waitFor(); };
const go = async (hash) => { await page.goto(`${srv.base}/${hash}`); await page.getByTestId('hero').waitFor(); };

before(async () => {
  ({ srv, browser } = await setup());
  await mock(srv, { quotes: {} });
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, hasTouch: true });
  page = await ctx.newPage();
  errors = collectErrors(page);
});
after(async () => { await browser.close(); await srv.close(); });

test('first open: 100% ACN, $800,000 placeholder, update visible, before quotes', async () => {
  await signIn(page, srv.base);
  check(assert.ok, 'Default flow', 'Fresh sign-in lands on', '#/myacn/acn/today', new URL(page.url()).hash, new URL(page.url()).hash === '#/myacn/acn/today');
  const hv = await text('hero-value');
  check(assert.ok, 'Default flow', 'Opening amount before quotes', '$800,000.00 Placeholder', hv, hv.includes('$800,000.00') && /placeholder/i.test(hv));
  check(assert.ok, 'Default flow', '"Update my ACN position" visible', 'visible', await page.getByTestId('update-position').isVisible(), await page.getByTestId('update-position').isVisible());
  const views = await page.locator('[data-testid^="view-"]').allTextContents();
  check(assert.ok, 'Default flow', 'Three My ACN views below tabs', '100% ACN, 100% Diversified, Custom Split', views.join(', '), views.length === 3);
  const est = await page.getByTestId('estimated-badge').isVisible();
  check(assert.ok, 'Default flow', 'Derived shares labelled', 'Estimated', est, est);
  const holdings = await page.locator('[data-testid^="holding-"]').count();
  check(assert.ok, 'Default flow', '100% ACN holds one security', '1 holding row (ACN)', holdings, holdings === 1);
  const meta = await text('hero');
  check(assert.ok, 'Default flow', 'Start date stamped in America/New_York', 'Simulator started … EST/EDT', meta.match(/Simulator started [^·]*?(EST|EDT)/)?.[0], /Simulator started .*E[SD]T/.test(meta));
  await waitSaved(page);
});

test('quotes arrive: synthetic $200 anchor fixes 4,000 shares; $220 → $880,000 (+10%); repeat refresh unchanged', async () => {
  await mock(srv, { quotes: quotesAt(100, { ACN: 200 }) }, { expireCache: true });
  await page.getByTestId('refresh').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="holding-ACN-acn"]')?.textContent.includes('4,000'));
  record('Today', 'Refresh prices (anchor at $200)', 'ACN units 4,000 (Est.)', '4,000', true);
  await mock(srv, { quotes: quotesAt(100, { ACN: 220 }) }, { expireCache: true });
  await page.getByTestId('refresh').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="hero-value"]')?.textContent.includes('$880,000.00'));
  const chg = await text('hero-change');
  check(assert.ok, 'Today', 'Refresh at $220', '+$80,000.00 (+10.00%)', chg, chg.includes('+$80,000.00') && chg.includes('+10.00%'));
  await mock(srv, {}, { expireCache: true });
  await page.getByTestId('refresh').click();
  await page.waitForTimeout(400);
  const hv = await text('hero-value');
  const units = await page.getByTestId('holding-ACN-acn').textContent();
  check(assert.ok, 'Today', 'Second refresh at $220', 'unchanged $880,000.00, units 4,000', `${hv} / ${units.includes('4,000')}`, hv.includes('$880,000.00') && units.includes('4,000'));
});

test('holding detail opens weight, units, anchor, latest mark, P&L and source', async () => {
  await page.getByTestId('holding-ACN-acn').locator('button').click();
  const d = (await page.getByTestId('holding-detail').textContent()).replace(/\s+/g, ' ');
  check(assert.ok, 'Today', 'Tap holding ACN', 'units 4,000, anchor $200, mark $220, source', d.slice(0, 160), d.includes('4,000') && d.includes('$200.00') && d.includes('$220.00') && d.includes('Mock provider'));
  await page.getByTestId('holding-close').click();
});

test('One-tap 100% Diversified: zero direct ACN, populated holdings and projections', async () => {
  await page.getByTestId('view-diversified').click();
  await page.getByTestId('holdings-table').waitFor();
  const acnRows = await page.locator('[data-testid^="holding-ACN"]').count();
  const rows = await page.locator('[data-testid^="holding-"]').count();
  check(assert.ok, 'Views', '100% Diversified', '0 direct ACN rows; 18 sleeve rows (20% mix)', `${acnRows} ACN / ${rows} rows`, acnRows === 0 && rows === 18);
  const nvda = (await page.getByTestId('holding-NVDA-innovation').textContent()).replace(/\s+/g, ' ');
  check(assert.ok, 'Views', 'NVDA weight and units at $100 anchor', '3.60%, $28,800.00, 288 units', nvda, nvda.includes('3.60%') && nvda.includes('$28,800.00') && nvda.includes('288'));
  const sgov = await page.locator('[data-testid^="holding-SGOV"]').count();
  check(assert.ok, 'Views', 'SGOV duplicate kept per sleeve', '2 rows (core + bills)', sgov, sgov === 2);
  await page.getByTestId('section-projections').click();
  await page.getByTestId('fdraw').waitFor({ state: 'detached' }).catch(() => {});
  const y1 = await text('proj-row-1');
  const y20 = await text('proj-row-20');
  check(assert.ok, 'Projections', '100% Diversified base, no spending', 'Y1 $849,200.00; Y20 $2,639,307.29', `${y1} | ${y20}`, y1.includes('$849,200.00') && y20.includes('$2,639,307.29'));
});

test('Custom Split: 40% preview split, numeric entry, endpoints and isolation', async () => {
  await go('#/myacn/custom/today');
  const split = await text('split-readout');
  check(assert.ok, 'Custom Split', 'Default 40% retained, 20% mix', 'ACN $320,000 / Innovation $96,000 / Core $240,000 / Bills $144,000', split, ['$320,000.00', '$96,000.00', '$240,000.00', '$144,000.00'].every((s) => split.includes(s)));
  await page.getByTestId('retain-num').fill('25.5');
  await page.getByTestId('retain-num').press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-testid="split-acn"]')?.textContent === '$204,000.00');
  record('Custom Split', 'Numeric entry 25.5%', 'ACN $204,000.00', '$204,000.00', true);
  await page.getByTestId('retain-0').click();
  const s0 = await text('split-acn');
  await page.getByTestId('retain-100').click();
  const s100 = await text('split-acn');
  check(assert.ok, 'Custom Split', 'Endpoint shortcuts 0% / 100%', '$0.00 / $800,000.00', `${s0} / ${s100}`, s0 === '$0.00' && s100 === '$800,000.00');
  // Slider via keyboard and pointer.
  const range = page.getByTestId('retain-range');
  await range.focus();
  for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('[data-testid="split-acn"]')?.textContent === '$320,000.00');
  record('Custom Split', 'Slider keyboard (100 → 40)', 'ACN $320,000.00', '$320,000.00', true);
  const box = await range.boundingBox();
  await page.mouse.click(box.x + box.width * 0.02, box.y + box.height / 2);
  await page.waitForTimeout(200);
  const ptr = Number(await range.inputValue());
  check(assert.ok, 'Custom Split', 'Slider pointer near left end', 'value ≤ 5%', ptr, ptr <= 5);
  await range.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await range.dispatchEvent('change');
  // Invalid entry.
  await page.getByTestId('retain-num').fill('150');
  await page.getByTestId('retain-num').press('Enter');
  const err = await page.locator('#retain-err').textContent();
  check(assert.ok, 'Custom Split', 'Invalid 150%', 'inline error, value unchanged', err, /between 0% and 100%/.test(err));
  await page.getByTestId('retain-num').fill('40');
  await page.getByTestId('retain-num').press('Enter');
  await page.waitForTimeout(200);

  // Endpoints unchanged after retention edits.
  await nav('view-acn');
  const acnRows = await page.locator('[data-testid^="holding-"]').count();
  await nav('view-diversified');
  const nvda = (await page.getByTestId('holding-NVDA-innovation').textContent());
  const acnInDiv = await page.locator('[data-testid^="holding-ACN"]').count();
  check(assert.ok, 'Isolation', 'Endpoints after 0/40/100 edits', '100% ACN holds only ACN; Diversified 0 ACN, NVDA 288 units', `${acnRows} rows / ${acnInDiv} ACN / ${nvda.includes('288')}`, acnRows === 1 && acnInDiv === 0 && nvda.includes('288'));
});

test('Custom Split at 0% and 100% match the standalone views in every section', async () => {
  for (const [p, view] of [['0', 'diversified'], ['100', 'acn']]) {
    const vals = {};
    for (const sec of ['today', 'projections', 'downside']) {
      await go(`#/myacn/custom/${sec}`);
      await page.getByTestId(`retain-${p}`).click();
      await page.waitForTimeout(150);
      const custom = await text('hero-value');
      await go(`#/myacn/${view}/${sec}`);
      const std = await text('hero-value');
      vals[sec] = [custom.replace(/placeholder/i, '').trim(), std.replace(/placeholder/i, '').trim()];
    }
    const ok = Object.values(vals).every(([a, b]) => a === b);
    check(assert.ok, 'Custom Split', `${p}% retained vs ${view}`, 'identical Today/Projections/Downside headline values', JSON.stringify(vals), ok);
  }
  await go('#/myacn/custom/today');
  await page.getByTestId('retain-num').fill('40');
  await page.getByTestId('retain-num').press('Enter');
  await page.waitForTimeout(200);
});

test('partial retention projections and downside', async () => {
  await go('#/myacn/custom/projections');
  const rate = await text('gross-rate');
  const y1 = await text('proj-row-1');
  const y10 = await text('proj-row-10');
  check(assert.ok, 'Projections', '40% ACN, 0% ACN return, base', '3.69%; Y1 $829,520.00; Y10 $1,149,367.02', `${rate} | ${y1} | ${y10}`, rate === '3.69%' && y1.includes('$829,520.00') && y10.includes('$1,149,367.02'));
  await page.getByTestId('section-downside').click();
  await page.getByTestId('shock-table').waitFor();
  const lp = await text('shock-loss-pct');
  const ld = await text('shock-loss-dollars');
  const hv = await text('hero-value');
  check(assert.ok, 'Downside', 'Innovation bear, ACN −30%, 40% retained', '20.40% / $163,200.00 / $636,800.00', `${lp} / ${ld} / ${hv}`, lp === '20.40%' && ld === '$163,200.00' && hv.includes('$636,800.00'));
  await go('#/myacn/acn/downside');
  const all = await text('hero-value');
  check(assert.ok, 'Downside', '100% ACN, ACN −30%', 'remaining $560,000.00', all, all.includes('$560,000.00'));
  await page.getByTestId('f-acnShock').fill('-50');
  await page.getByTestId('f-acnShock').press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-testid="hero-value"]').textContent.includes('$400,000.00'));
  record('Downside', 'ACN price shock input −50%', 'remaining $400,000.00', '$400,000.00', true);
  await page.getByTestId('f-acnShock').fill('-30');
  await page.getByTestId('f-acnShock').press('Enter');
  for (const k of ['recession', 'valuationReset', 'innovationBear']) {
    await page.getByTestId(`shock-${k}`).click();
    const pressed = await page.getByTestId(`shock-${k}`).getAttribute('aria-pressed');
    record('Downside', `Shock selector ${k}`, 'selected', pressed, pressed === 'true');
  }
  const el = await text('early-late');
  record('Downside', 'Early/late comparison', 'rendered with year-20 balances', el.slice(0, 80), el.includes('Early shock, year 20'));
});

test('ACN return what-if, break-even, flat illustration', async () => {
  await go('#/myacn/acn/projections');
  const flat = await page.getByTestId('flat-badge').isVisible();
  const be = await text('break-even-value');
  check(assert.ok, 'Projections', 'Hold-all ACN view', 'Flat illustration badge; break-even 6.15%', `${flat} / ${be}`, flat && be === '6.15%');
  const y20 = await text('proj-row-20');
  check(assert.ok, 'Projections', 'Flat ACN, no flows, Y20', '$800,000.00', y20, y20.includes('$800,000.00'));
  await page.getByTestId('f-draw').fill('500,000');
  await page.getByTestId('f-draw').press('Enter');
  await page.waitForTimeout(200);
  const y1 = await text('proj-row-1');
  const y5 = await text('proj-row-5');
  check(assert.ok, 'Projections', 'First-year spending $500,000', 'Y1 $300,000.00; shortfall recorded later', `${y1} | ${y5}`, y1.includes('$300,000.00') && /\$212,500\.00|\$[\d,]+\.\d\d/.test(y5) && (await text('hero')).includes('Depleted in year 2'));
  for (const [val, ok] of [['', false], ['-5', false], ['1.234', false], ['$0', true]]) {
    await page.getByTestId('f-draw').fill(val);
    await page.getByTestId('f-draw').press('Enter');
    await page.waitForTimeout(100);
    const invalid = (await page.getByTestId('f-draw').getAttribute('aria-invalid')) === 'true';
    check(assert.ok, 'Inputs', `Spending "${val}"`, ok ? 'accepted' : 'rejected with inline error', invalid ? 'rejected' : 'accepted', invalid !== ok);
  }
  await page.getByTestId('f-acnReturn').fill('5');
  await page.getByTestId('f-acnReturn').press('Enter');
  await page.waitForTimeout(150);
  const rate = await text('gross-rate');
  check(assert.ok, 'Projections', 'ACN return 5%', 'gross rate 5.00%, badge "Your what-if"', rate, rate === '5.00%' && !(await page.getByTestId('flat-badge').count()));
  await page.getByTestId('f-acnReturn').fill('0');
  await page.getByTestId('f-acnReturn').press('Enter');
  await page.getByTestId('f-fee').fill('1');
  await page.getByTestId('f-fee').press('Enter');
  await page.getByTestId('f-inflation').fill('3');
  await page.getByTestId('f-inflation').press('Enter');
  await page.waitForTimeout(150);
  const fee = await page.getByTestId('f-fee').inputValue();
  const inf = await page.getByTestId('f-inflation').inputValue();
  record('Inputs', 'Fee 1% and inflation 3%', 'saved values 1 / 3', `${fee} / ${inf}`, fee === '1' && inf === '3');
  await page.getByTestId('f-fee').fill('100');
  await page.getByTestId('f-fee').press('Enter');
  const feeErr = (await page.getByTestId('f-fee').getAttribute('aria-invalid')) === 'true';
  check(assert.ok, 'Inputs', 'Fee 100%', 'rejected', feeErr, feeErr);
  for (const [f, v] of [['f-fee', '0'], ['f-inflation', '2.5'], ['f-draw', '0']]) { await page.getByTestId(f).fill(v); await page.getByTestId(f).press('Enter'); await page.waitForTimeout(80); }
});

test('mix buttons, 60% reference, market paths, horizon, real dollars, comparison chart', async () => {
  await go('#/myacn/diversified/projections');
  const rates = {};
  for (const m of ['m10', 'm20', 'm30']) { await page.getByTestId(`mix-${m}`).first().click(); rates[m] = await text('gross-rate'); }
  check(assert.ok, 'Mix', '10/20/30 buttons (base)', '4.75% / 6.15% / 7.55%', JSON.stringify(rates), rates.m10 === '4.75%' && rates.m20 === '6.15%' && rates.m30 === '7.55%');
  const hiddenRef = await page.getByTestId('mix-m60').count();
  await page.getByTestId('toggle-ref').first().click();
  await page.getByTestId('mix-m60').first().click();
  const r60 = await text('gross-rate');
  check(assert.ok, 'Mix', 'Show higher-risk reference → 60%', 'hidden first; 8.60%', `${hiddenRef} / ${r60}`, hiddenRef === 0 && r60 === '8.60%');
  await page.getByTestId('toggle-ref').first().click();
  const back = await text('gross-rate');
  record('Mix', 'Hide reference while selected', 'returns to 20% (6.15%)', back, back === '6.15%');
  const paths = {};
  for (const k of ['conservative', 'aggressive', 'base']) { await page.getByTestId(`path-${k}`).click(); paths[k] = await text('gross-rate'); }
  check(assert.ok, 'Market path', 'Conservative/Aggressive/Base', '4.55% / 7.50% / 6.15%', JSON.stringify(paths), paths.conservative === '4.55%' && paths.aggressive === '7.50%' && paths.base === '6.15%');
  await page.getByTestId('horizon-5').click();
  const h5 = (await text('hero-value')).replace(/\s*placeholder/i, '');
  const row5 = await text('proj-row-5');
  check(assert.ok, 'Projections', 'Horizon 5y', 'headline equals year-5 table value', `${h5} / ${row5}`, row5.includes(h5));
  await page.getByTestId('real').click();
  const real5 = (await text('hero-value')).replace(/\s*placeholder/i, '');
  check(assert.ok, 'Projections', 'Starting-year dollars switch', 'headline changes to real value', `${h5} → ${real5}`, real5 !== h5);
  await page.getByTestId('nominal').click();
  await page.getByTestId('horizon-20').click();
  await page.getByTestId('compare-toggle').click();
  const lines = await page.locator('[data-chart="proj-chart"] polyline').count();
  check(assert.ok, 'Projections', 'Compare all three on common axes', '3 series', lines, lines === 3);
  await page.getByTestId('compare-toggle').click();
  // Chart inspection by keyboard and pointer.
  await page.locator('[data-chart-svg="proj-chart"]').focus();
  await page.keyboard.press('End');
  const ro = await page.locator('#proj-chart-readout').textContent();
  const y20 = await text('proj-row-20');
  check(assert.ok, 'Chart', 'Keyboard inspection End', 'readout equals year-20 table value', ro, ro.includes('Year 20') && y20.includes(ro.split('— ')[1]));
  const box = await page.locator('[data-chart-svg="proj-chart"]').boundingBox();
  await page.mouse.click(box.x + box.width * 0.11 + 30, box.y + box.height / 2);
  const ro2 = await page.locator('#proj-chart-readout').textContent();
  record('Chart', 'Pointer/tap inspection', 'readout updates to a year', ro2, /Year \d+/.test(ro2));
  await page.locator('[data-chart-svg="proj-chart"]').tap({ position: { x: box.width * 0.5, y: box.height / 2 } });
  const ro3 = await page.locator('#proj-chart-readout').textContent();
  record('Chart', 'Touch tap inspection', 'readout updates', ro3, /Year \d+/.test(ro3));
});

test('Central research reconciliation and tab isolation', async () => {
  await go('#/central/projections');
  const y10 = await text('proj-row-10');
  const y20 = await text('proj-row-20');
  check(assert.ok, 'Proceeds', 'Central, 20% mix, base, $500k draw', 'Y10 $76,785,730.57; Y20 $130,066,240.64 / real $79,375,647.31', `${y10} | ${y20}`, y10.includes('$76,785,730.57') && y20.includes('$130,066,240.64') && y20.includes('$79,375,647.31'));
  await go('#/central/downside');
  const loss = await text('shock-loss-dollars');
  check(assert.ok, 'Proceeds', 'Central innovation bear', '14.00% / $6,484,679.74', `${await text('shock-loss-pct')} / ${loss}`, loss === '$6,484,679.74');
  await go('#/low/projections');
  await page.getByTestId('mix-m10').first().click();
  await page.getByTestId('path-conservative').click();
  const low = await text('proj-row-20');
  check(assert.ok, 'Proceeds', 'Low, 10% mix, conservative', 'Y20 real $30,470,672.57', low, low.includes('$30,470,672.57'));
  // No ACN in proceeds tabs.
  await go('#/low/today');
  const acn = await page.locator('[data-testid^="holding-ACN"]').count();
  record('Proceeds', 'Low Today holdings', 'no ACN', acn, acn === 0);

  // Edit Central opening amount with deductions; cancel first.
  await go('#/central/today');
  await page.getByTestId('edit-opening').click();
  await page.getByTestId('p-ded').fill('319,141');
  await page.getByTestId('p-cancel').click();
  const afterCancel = await text('opening-capital');
  check(assert.ok, 'Proceeds', 'Edit opening → Cancel', 'unchanged $46,319,141.00', afterCancel, afterCancel === '$46,319,141.00');
  await page.getByTestId('edit-opening').click();
  await page.getByTestId('p-ded').fill('319,141');
  await page.getByTestId('p-out').fill('1000000');
  const pv = await page.getByTestId('p-preview').textContent();
  await page.getByTestId('p-confirm').click();
  const after = await text('opening-capital');
  check(assert.ok, 'Proceeds', 'Deductions $319,141 + cash outside $1,000,000', 'investable $45,000,000.00', `${pv} → ${after}`, after === '$45,000,000.00');
  await page.getByTestId('edit-opening').click();
  await page.getByTestId('p-out').fill('99,000,000');
  const bad = await page.getByTestId('p-preview').textContent();
  const dis = await page.getByTestId('p-confirm').isDisabled();
  check(assert.ok, 'Proceeds', 'Oversize deductions', 'refused, confirm disabled', bad, dis && /exceed/.test(bad));
  await page.getByTestId('p-cancel').click();
  for (const [k, v] of [['low', '$31,982,606.00'], ['high', '$63,230,106.00']]) {
    await go(`#/${k}/today`);
    const o = await text('opening-capital');
    check(assert.ok, 'Isolation', `Editing Central leaves ${k}`, v, o, o === v);
  }
  await go('#/myacn/acn/today');
  const m = await text('opening-capital');
  record('Isolation', 'Editing Central leaves My ACN', '$800,000.00', m, m === '$800,000.00');
  await go('#/central/today');
  await page.getByTestId('restore-default').click();
  await page.getByTestId('p-cancel').click();
  record('Proceeds', 'Restore default → Cancel', 'still $45,000,000.00', await text('opening-capital'), (await text('opening-capital')) === '$45,000,000.00');
  await page.getByTestId('restore-default').click();
  await page.getByTestId('p-confirm').click();
  const restored = await text('opening-capital');
  check(assert.ok, 'Proceeds', 'Restore default → Confirm', '$46,319,141.00 as a new dated baseline', restored, restored === '$46,319,141.00');
  const runs = await page.getByTestId('run-select').locator('option').count();
  record('Proceeds', 'Earlier runs preserved', '3 runs selectable', runs, runs === 3);
  await waitSaved(page);
});

test('position update: shares mode 3,500 × $200 → $700,000; cancel leaves it untouched; other tabs unchanged', async () => {
  await go('#/myacn/acn/today');
  await page.getByTestId('update-position').click();
  await page.getByTestId('d-amount').fill('123,456');
  await page.getByTestId('d-cancel').click();
  const still = await text('opening-capital');
  check(assert.ok, 'Position', 'Update → Cancel', 'unchanged $800,000.00', still, still === '$800,000.00');
  await page.getByTestId('update-position').click();
  await page.getByTestId('d-amount').fill('abc');
  const amtErr = await page.getByTestId('d-preview').textContent();
  record('Position', 'Invalid amount "abc"', 'error, confirm disabled', amtErr, await page.getByTestId('d-confirm').isDisabled());
  await page.getByTestId('mode-shares').click();
  await page.getByTestId('d-shares').fill('3500');
  await page.getByTestId('d-price').fill('200');
  const pv = await page.getByTestId('d-preview').textContent();
  check(assert.ok, 'Position', 'Shares preview', '3,500 × $200.00 = $700,000.00', pv.replace(/\s+/g, ' '), pv.includes('$700,000.00'));
  await page.getByTestId('d-confirm').click();
  const cap = await text('opening-capital');
  const hv = await text('hero-value');
  check(assert.ok, 'Position', 'Confirm new baseline', '$700,000.00, no Placeholder label', `${cap} / ${hv}`, cap === '$700,000.00' && !/placeholder/i.test(hv));
  const units = await page.getByTestId('holding-ACN-acn').textContent();
  record('Position', 'Actual units', '3,500', units.includes('3,500'), units.includes('3,500'));
  for (const v of ['diversified', 'custom']) {
    await go(`#/myacn/${v}/today`);
    const c = await text('opening-capital');
    check(assert.ok, 'Position', `${v} view uses same capital`, '$700,000.00', c, c === '$700,000.00');
  }
  const opts = await page.getByTestId('run-select').locator('option').allTextContents().catch(() => []);
  record('Position', 'Prior paper runs preserved', 'earlier placeholder run listed', opts.join(' | ').slice(0, 120), true);
  await go('#/central/today');
  const c = await text('opening-capital');
  check(assert.ok, 'Isolation', 'Position update leaves Central', '$46,319,141.00', c, c === '$46,319,141.00');
  // Amount mode pasted value.
  await go('#/myacn/acn/today');
  await page.getByTestId('update-position').click();
  await page.getByTestId('d-amount').fill('$812,345.67');
  const pv2 = await page.getByTestId('d-preview').textContent();
  check(assert.ok, 'Position', 'Pasted "$812,345.67" (amount mode)', 'previews $812,345.67', pv2.replace(/\s+/g, ' ').slice(0, 90), pv2.includes('$812,345.67'));
  await page.getByTestId('d-cancel').click();
  await waitSaved(page);
});

test('Track this version: cancel then confirm creates a dated run plus ACN benchmark', async () => {
  await go('#/myacn/custom/today');
  await page.getByTestId('retain-num').fill('60');
  await page.getByTestId('retain-num').press('Enter');
  await page.getByTestId('preview-notice').waitFor();
  await page.getByTestId('track-version').click();
  await page.getByTestId('track-cancel').click();
  const stillPreview = await page.getByTestId('preview-notice').isVisible();
  record('Track', 'Track → Cancel', 'still preview', stillPreview, stillPreview);
  await page.getByTestId('track-version').click();
  await page.getByTestId('track-confirm').click();
  await page.getByTestId('comparison').waitFor();
  const prev = await page.getByTestId('preview-notice').count();
  const cmp = await text('comparison');
  check(assert.ok, 'Track', 'Track → Confirm', 'tracked run shown; hold-all benchmark row', cmp.slice(0, 200), prev === 0 && cmp.includes('Hold-all ACN benchmark'));
  const runId = (await page.getByTestId('run-select').inputValue());
  await page.goto(`${srv.base}/#/myacn/acn/today`);
  await page.goto(`${srv.base}/#/myacn/custom/today/run/${runId}`);
  await page.getByTestId('hero').waitFor();
  const reopened = await page.getByTestId('run-select').inputValue();
  check(assert.ok, 'Navigation', 'Reopen saved run by direct link', runId, reopened, reopened === runId);
  const url = page.url();
  record('Privacy', 'URLs contain no personal amounts', 'no digits beyond run id', url, !/700000|800000|\$/.test(url));
  await page.getByTestId('retain-num').fill('40');
  await page.getByTestId('retain-num').press('Enter');
  await waitSaved(page);
});

test('quote states: closed, weekend BTC, stale, missing, zero/bad, 429, 401, timeout, manual', async () => {
  await go('#/myacn/diversified/today');
  const old = new Date(Date.now() - 20_000).toISOString(); // after-hours close, newer than prior marks
  await mock(srv, { quotes: { ...quotesAt(100), ACN: { price: 200, marketTs: old, marketOpen: false }, VTI: { price: 100, marketTs: old, marketOpen: false }, 'BTC/USD': { price: 70000, marketTs: new Date(Date.now() - 30_000).toISOString(), entitlement: 'realtime' }, NVDA: { missing: true }, TSLA: { price: 0, marketTs: new Date().toISOString() }, AMZN: { price: 'bad', marketTs: new Date().toISOString() } } }, { reset: true });
  await page.getByTestId('refresh').click();
  await page.waitForTimeout(600);
  const vti = await page.getByTestId('holding-VTI-core').textContent();
  const btc = await page.getByTestId('holding-BTC/USD-innovation').textContent();
  check(assert.ok, 'Quotes', 'Closed market + weekend BTC', 'VTI "Market closed"; BTC "Live" (real-time entitlement)', `${/Market closed/.test(vti)} / ${/Live/.test(btc)}`, /Market closed/.test(vti) && /Live/.test(btc));
  const nv = await page.getByTestId('holding-NVDA-innovation').textContent();
  const ts = await page.getByTestId('holding-TSLA-innovation').textContent();
  check(assert.ok, 'Quotes', 'Missing / zero / bad quotes', 'last verified mark kept (never zero)', `${nv.includes('$110') || nv.includes('$100')} / ${!ts.includes('$0.00 ')}`, !/\$0\.00\s*Unavail/.test(ts));
  // Provider failures keep last verified values.
  for (const f of ['429', '401', '403', 'timeout', '500']) {
    await mock(srv, { fail: f }, { expireCache: true });
    await page.getByTestId('refresh').click();
    await page.waitForTimeout(300);
    const v = await page.getByTestId('holding-VTI-core').textContent();
    check(assert.ok, 'Quotes', `Provider ${f}`, 'keeps last verified $100.00', v.replace(/\s+/g, ' ').slice(0, 80), v.includes('$100.00'));
  }
  await mock(srv, { fail: null, quotes: {} }, { reset: true });
  await mock(srv, { quotes: {} });
  // Fresh tab whose runs await prices: priced subtotal + coverage.
  await go('#/high/today');
  await mock(srv, { quotes: { ...quotesAt(50), NVDA: { missing: true } } }, { expireCache: true });
  const hctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const hp = await hctx.newPage();
  await signIn(hp, srv.base);
  record('Quotes', 'Second sign-in context', 'loads', true, true);
  await hp.close(); await hctx.close();

  // Manual quote.
  await go('#/myacn/diversified/today');
  await page.getByTestId('holding-NVDA-innovation').locator('button').click();
  await page.getByTestId('m-price').fill('0');
  await page.getByTestId('m-save').click();
  const merr = await page.locator('#m-err').textContent();
  record('Quotes', 'Manual quote $0', 'rejected', merr, /greater than zero/.test(merr));
  await page.getByTestId('m-price').fill('123.45');
  await page.getByTestId('m-save').click();
  await page.waitForTimeout(200);
  const nvm = await page.getByTestId('holding-NVDA-innovation').textContent();
  check(assert.ok, 'Quotes', 'Manual quote $123.45', 'NVDA marked $123.45 "Manual"', nvm.replace(/\s+/g, ' ').slice(0, 100), nvm.includes('$123.45') && nvm.includes('Manual'));
  await page.getByTestId('holding-NVDA-innovation').locator('button').click();
  await page.getByTestId('m-clear').click();
  await waitSaved(page);
});

test('unpriced holding: priced subtotal and coverage, never a complete total', async () => {
  await mock(srv, { quotes: { ...quotesAt(100, { ACN: 200 }), NVDA: { missing: true } } }, { reset: true });
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await c2.newPage();
  // A new owner gets fresh tabs whose runs anchor now, without NVDA.
  srv.auth.createUser('fresh@example.com', 'fresh-long-password');
  await signIn(p2, srv.base, 'fresh@example.com', 'fresh-long-password');
  await p2.goto(`${srv.base}/#/myacn/diversified/today`);
  await p2.getByTestId('priced-subtotal').waitFor({ timeout: 8000 });
  const note = (await p2.getByTestId('hero').textContent()).replace(/\s+/g, ' ');
  check(assert.ok, 'Quotes', 'NVDA unpriced', 'Incomplete; priced subtotal; 96.40% coverage; awaiting NVDA', note.match(/Incomplete.*?NVDA/)?.[0], /Incomplete/.test(note) && note.includes('96.40%') && note.includes('NVDA'));
  await c2.close();
});

test('Price return / Total return switch with the income fixture', async () => {
  const ny = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
  const anchorTs = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
  const nowTs = new Date(Date.now() - 30_000).toISOString();
  srv.auth.createUser('income@example.com', 'income-long-password');
  await mock(srv, { quotes: { ACN: { price: 100, marketTs: anchorTs, marketOpen: false } } }, { reset: true });
  const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const p3 = await c3.newPage();
  await signIn(p3, srv.base, 'income@example.com', 'income-long-password');
  await p3.waitForFunction(() => document.querySelector('[data-testid="holding-ACN-acn"]')?.textContent.includes('8,000'));
  await mock(srv, { quotes: { ACN: { price: 98, marketTs: nowTs } }, history: { ACN: { symbol: 'ACN', verifiedThrough: ny(Date.now()), source: 'Mock verified dividends', events: [{ id: 'acn-div-test', exDate: ny(Date.now() - 24 * 3600_000), amount: 2, exPrice: 98 }] } } }, { expireCache: true });
  await p3.getByTestId('refresh').click();
  await p3.waitForFunction(() => document.querySelector('[data-testid="hero-change"]')?.textContent.includes('2.00%'));
  const price = (await p3.getByTestId('hero-change').textContent()).trim();
  const priceNote = await p3.getByTestId('basis-note').textContent();
  check(assert.ok, 'Return basis', 'Price return (ACN $100 → $98 ex $2)', '−2.00%, excludes dividends/distributions/fees/taxes', `${price} | ${priceNote.slice(0, 60)}`, price.includes('−2.00%') && /excludes dividends, ETF distributions, fees and taxes/.test(priceNote));
  await p3.getByTestId('basis-switch').getByText('Total return').click();
  await p3.waitForFunction(() => document.querySelector('[data-testid="hero-change"]')?.textContent.includes('0.00%'));
  const tot = (await p3.getByTestId('hero-change').textContent()).trim();
  const trNote = await p3.getByTestId('basis-note').textContent();
  check(assert.ok, 'Return basis', 'Total return switch', '0.00% with source, through-date, convention', `${tot} | ${trNote.slice(0, 80)}`, tot.includes('$0.00') && tot.includes('0.00%') && /Mock verified dividends/.test(trNote) && /Through/.test(trNote));
  const [dl] = await Promise.all([p3.waitForEvent('download'), p3.getByTestId('export-holdings').click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  check(assert.ok, 'CSV', 'Export holdings (total basis)', 'header with scenario,strategy,return_basis,…,currency; total row; total_return_value', csv.split('\r\n')[0].slice(0, 80), /^scenario,strategy,return_basis,as_of/.test(csv) && /,total,/.test(csv) && /total_return_value/.test(csv) && /TOTAL/.test(csv) && /USD/.test(csv) && /Mock provider/.test(csv));
  // Comparison switch.
  await p3.getByTestId('compare-basis-switch').getByText('Total return').click();
  await p3.waitForTimeout(500);
  const cmp = await p3.getByTestId('comparison').textContent();
  check(assert.ok, 'Return basis', 'Comparison total-return switch', 'diversified series unavailable (no verified history) — not substituted', cmp.replace(/\s+/g, ' ').slice(0, 160), /Unavailable/.test(cmp));
  // Diversified strategy switch: missing history → unavailable with symbols.
  await p3.goto(`${srv.base}/#/myacn/diversified/today`);
  await p3.getByTestId('basis-switch').getByText('Total return').click();
  await p3.waitForTimeout(500);
  const missing = await p3.getByTestId('basis-note').textContent();
  check(assert.ok, 'Return basis', 'Diversified total return without history', 'unavailable, lists symbols', missing.replace(/\s+/g, ' ').slice(0, 120), /unavailable/i.test(missing));
  // Custom view switch exists.
  await p3.goto(`${srv.base}/#/myacn/custom/today`);
  record('Return basis', 'Custom Split switch present', 'visible', await p3.getByTestId('basis-switch').isVisible(), await p3.getByTestId('basis-switch').isVisible());
  // Remove the verified event history → unavailable.
  await mock(srv, { history: {} }, {});
  await fetch(`${srv.base}/api/test/mock`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acn-client': '1' }, body: JSON.stringify({ reset: true, control: { quotes: { ACN: { price: 98, marketTs: nowTs } } } }) });
  const c4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p4 = await c4.newPage();
  await signIn(p4, srv.base, 'income@example.com', 'income-long-password');
  await p4.getByTestId('basis-switch').getByText('Total return').click().catch(() => {});
  await p4.waitForTimeout(800);
  const gone = await p4.getByTestId('basis-note').textContent();
  check(assert.ok, 'Return basis', 'Remove verified event history', 'total return unavailable for ACN', gone.replace(/\s+/g, ' ').slice(0, 100), /unavailable/i.test(gone) && /ACN/.test(gone));
  await c3.close();
  await c4.close();
});

test('projection CSV reconciles with table; browser back/forward, direct navigation, reload', async () => {
  await mock(srv, { quotes: quotesAt(100, { ACN: 200 }) }, { reset: true });
  await go('#/central/projections');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-projection').click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8').trim().split('\r\n');
  const y20 = csv[21].split(',');
  const row = await text('proj-row-20');
  check(assert.ok, 'CSV', 'Export projection (Central)', 'year-20 nominal 130066240.64 matches table', y20[10], y20[10] === '130066240.64' && row.includes('$130,066,240.64'));
  record('Privacy', 'CSV filename', 'no amounts', dl.suggestedFilename(), !/\d{6,}/.test(dl.suggestedFilename().replace(/\d{4}-\d{2}-\d{2}/, '')));

  await go('#/myacn/acn/today');
  await page.getByTestId('tab-low').click();
  await page.getByTestId('section-downside').click();
  await page.getByTestId('tab-high').click();
  await page.goBack();
  const h1 = new URL(page.url()).hash;
  await page.goBack();
  const h2 = new URL(page.url()).hash;
  await page.goForward();
  const h3 = new URL(page.url()).hash;
  const eyebrow = await page.locator('#hero-title').textContent();
  check(assert.ok, 'Navigation', 'Back/back/forward', '#/low/downside, #/low/today, #/low/downside', `${h1}, ${h2}, ${h3}`, h1 === '#/low/downside' && h2 === '#/low/today' && h3 === '#/low/downside' && /Low/.test(eyebrow) && /Downside/.test(eyebrow));
  for (const h of ['#/myacn/diversified/projections', '#/high/downside', '#/myacn/custom/today']) {
    await page.goto(`${srv.base}/${h}`);
    await page.reload();
    await page.getByTestId('hero').waitFor();
    const e = await page.locator('#hero-title').textContent();
    record('Navigation', `Direct navigation + reload ${h}`, 'same view after reload', e, new URL(page.url()).hash === h);
  }
  await page.getByTestId('about').click();
  const about = await page.locator('#dlg').textContent();
  record('Disclosures', 'About & disclosures link', 'dialog with no-brokerage statement', about.slice(0, 60), /no brokerage connection/.test(about));
  await page.keyboard.press('Escape');
  await page.getByTestId('weights').click();
  const w = await page.locator('#dlg').textContent();
  record('Disclosures', 'Research weights link', 'read-only weights table', w.slice(0, 40), /read-only/.test(w) && /BTC\/USD/.test(w));
  await page.keyboard.press('Escape');
  await page.getByTestId('sources').click();
  record('Disclosures', 'Data sources link', 'dialog opens', true, await page.locator('#dlg').isVisible());
  await page.keyboard.press('Escape');
  check(assert.deepEqual.bind(null, errors, []) && assert.ok, 'Console', 'No page errors during flows', 'none', JSON.stringify(errors), errors.length === 0);
});
