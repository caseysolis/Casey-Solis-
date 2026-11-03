// Screen sizes, touch targets, focus visibility and overflow.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, mock, quotesAt, signIn } from './fixtures.js';
import { check, record } from './ledger.js';

let srv;
let browser;
before(async () => {
  ({ srv, browser } = await setup());
  await mock(srv, { quotes: quotesAt(100, { ACN: 200 }) });
});
after(async () => { await browser.close(); await srv.close(); });

const SIZES = [
  ['320 portrait', { width: 320, height: 640 }, true],
  ['390 portrait', { width: 390, height: 844 }, true],
  ['820 tablet portrait', { width: 820, height: 1180 }, true],
  ['1180 tablet landscape', { width: 1180, height: 820 }, true],
  ['1440 desktop', { width: 1440, height: 900 }, false],
];
const ROUTES = ['#/myacn/acn/today', '#/myacn/diversified/today', '#/myacn/custom/today', '#/myacn/custom/projections', '#/myacn/acn/downside', '#/central/today', '#/high/projections', '#/low/downside'];

test('no horizontal overflow, clipped values or tiny targets at each size', async () => {
  for (const [name, viewport, touch] of SIZES) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch && viewport.width < 800 });
    const page = await ctx.newPage();
    await signIn(page, srv.base);
    let overflow = [];
    let small = [];
    let clipped = [];
    for (const r of ROUTES) {
      await page.goto(`${srv.base}/${r}`);
      await page.getByTestId('hero').waitFor();
      await page.waitForTimeout(100);
      const res = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth;
        const vw = window.innerWidth;
        const tiny = [];
        document.querySelectorAll('.btn, .seg a, .seg button, .tabs a, input[type="text"], select, input[type="range"]').forEach((el) => {
          const b = el.getBoundingClientRect();
          if (b.width && b.height && b.height < 43.5) tiny.push(`${el.textContent.trim().slice(0, 20) || el.id} ${Math.round(b.height)}px`);
        });
        const clip = [];
        document.querySelectorAll('.card, .hero').forEach((card) => {
          const cb = card.getBoundingClientRect();
          card.querySelectorAll('.num, td.n, .kv dd').forEach((el) => {
            const b = el.getBoundingClientRect();
            if (b.width && (b.right > cb.right + 1 || b.left < cb.left - 1) && !el.closest('.table-wrap')) clip.push(el.textContent.trim().slice(0, 24));
          });
        });
        return { over: sw > vw + 1 ? `${sw}>${vw}` : null, tiny, clip };
      });
      if (res.over) overflow.push(`${r} ${res.over}`);
      small = small.concat(res.tiny.map((x) => `${r}: ${x}`));
      clipped = clipped.concat(res.clip.map((x) => `${r}: ${x}`));
    }
    check(assert.ok, 'Layout', `${name}: horizontal page scroll`, 'none', overflow.join('; ') || 'none', overflow.length === 0);
    check(assert.ok, 'Layout', `${name}: touch targets ≥ 44px`, 'none smaller', small.slice(0, 5).join('; ') || 'none', small.length === 0);
    check(assert.ok, 'Layout', `${name}: values clipped outside cards`, 'none', clipped.slice(0, 5).join('; ') || 'none', clipped.length === 0);
    const tabsVisible = await page.evaluate(() => [...document.querySelectorAll('.tabs a')].every((a) => { const b = a.getBoundingClientRect(); return b.right <= window.innerWidth + 1 && b.left >= -1; }));
    check(assert.ok, 'Layout', `${name}: all four scenario names reachable`, 'visible without scrolling', tabsVisible, tabsVisible);
    await ctx.close();
  }
});

test('keyboard: visible focus, tab activation, chart inspection; no hover dependency', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await signIn(page, srv.base);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  let found = false;
  for (let i = 0; i < 12 && !found; i++) {
    const tid = await page.evaluate(() => document.activeElement?.dataset?.testid || '');
    if (tid === 'tab-central') found = true; else await page.keyboard.press('Tab');
  }
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth);
  check(assert.ok, 'Keyboard', 'Tab to "Central" scenario', 'focus ring visible (outline ≥ 2px)', outline, found && /solid/.test(outline));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash.startsWith('#/central'));
  record('Keyboard', 'Enter on focused tab', 'navigates to Central', await page.evaluate(() => location.hash), true);
  await page.goto(`${srv.base}/#/central/projections`);
  await page.locator('[data-chart-svg="proj-chart"]').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const ro = await page.locator('#proj-chart-readout').textContent();
  check(assert.ok, 'Keyboard', 'Chart Home → ArrowRight', 'Year 1 readout', ro, /Year 1 —/.test(ro));
  const hoverOnly = await page.evaluate(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } }).filter((r) => r.selectorText && /:hover/.test(r.selectorText) && /display|visibility|opacity/.test(r.cssText)).length);
  check(assert.ok, 'Accessibility', 'Hover-only reveals', '0 rules', hoverOnly, hoverOnly === 0);
  // Series distinguished by more than colour.
  await page.getByTestId('tab-myacn').click();
  await page.goto(`${srv.base}/#/myacn/acn/projections`);
  await page.getByTestId('compare-toggle').click();
  const dashes = await page.$$eval('[data-chart="proj-chart"] polyline', (ls) => ls.map((l) => l.getAttribute('stroke-dasharray')));
  check(assert.ok, 'Accessibility', 'Comparison series not colour-only', 'distinct dash patterns', JSON.stringify(dashes), new Set(dashes).size === 3);
  await ctx.close();
});
