# Rendered-site control ledger

Generated from `npm run test:browser` on 2026-11-03. 148/148 checks passed.

Environment: Chromium (Playwright, headless), local server, mock quote provider. Quotes come from the mock provider; no live-provider result is included here.

| Area | Control / action | Expected observable change | Actual | Result |
|---|---|---|---|---|
| Default flow | Fresh sign-in lands on | #/myacn/acn/today | #/myacn/acn/today | PASS |
| Default flow | Opening amount before quotes | $800,000.00 Placeholder | $800,000.00 Placeholder | PASS |
| Default flow | "Update my ACN position" visible | visible | true | PASS |
| Default flow | Three My ACN views below tabs | 100% ACN, 100% Diversified, Custom Split | 100% ACN, 100% Diversified, Custom Split | PASS |
| Default flow | Derived shares labelled | Estimated | true | PASS |
| Default flow | 100% ACN holds one security | 1 holding row (ACN) | 1 | PASS |
| Default flow | Start date stamped in America/New_York | Simulator started … EST/EDT | Simulator started Nov 2, 2026, 9:33 PM EST | PASS |
| Today | Refresh prices (anchor at $200) | ACN units 4,000 (Est.) | 4,000 | PASS |
| Today | Refresh at $220 | +$80,000.00 (+10.00%) | +$80,000.00 (+10.00%) | PASS |
| Today | Second refresh at $220 | unchanged $880,000.00, units 4,000 | $880,000.00 Placeholder / true | PASS |
| Today | Tap holding ACN | units 4,000, anchor $200, mark $220, source |  Sleeve(s)Direct ACN Weight100.000% Opening dollars$800,000.00 Units4,000 (Estimated) Anchor$200.00 · Nov 2, 2026, 9:32 PM EST · Mock provider Latest mark$220.0 | PASS |
| Views | 100% Diversified | 0 direct ACN rows; 18 sleeve rows (20% mix) | 0 ACN / 18 rows | PASS |
| Views | NVDA weight and units at $100 anchor | 3.60%, $28,800.00, 288 units |  NVDANVIDIA · Innovation 3.60% $28,800.00 288 $100.00Delayed $28,800.00 $0.00  | PASS |
| Views | SGOV duplicate kept per sleeve | 2 rows (core + bills) | 2 | PASS |
| Projections | 100% Diversified base, no spending | Y1 $849,200.00; Y20 $2,639,307.29 | Year 1$849,200.00$828,487.80$0.00$0.00 \| Year 20$2,639,307.29$1,610,692.55$0.00$0.00 | PASS |
| Custom Split | Default 40% retained, 20% mix | ACN $320,000 / Innovation $96,000 / Core $240,000 / Bills $144,000 | Direct ACN $320,000.00Innovation $96,000.00Core $240,000.00Extra short T-bills $144,000.00 | PASS |
| Custom Split | Numeric entry 25.5% | ACN $204,000.00 | $204,000.00 | PASS |
| Custom Split | Endpoint shortcuts 0% / 100% | $0.00 / $800,000.00 | $0.00 / $800,000.00 | PASS |
| Custom Split | Slider keyboard (100 → 40) | ACN $320,000.00 | $320,000.00 | PASS |
| Custom Split | Slider pointer near left end | value ≤ 5% | 0 | PASS |
| Custom Split | Invalid 150% | inline error, value unchanged | Enter a value between 0% and 100%. | PASS |
| Isolation | Endpoints after 0/40/100 edits | 100% ACN holds only ACN; Diversified 0 ACN, NVDA 288 units | 1 rows / 0 ACN / true | PASS |
| Custom Split | 0% retained vs diversified | identical Today/Projections/Downside headline values | {"today":["$800,000.00","$800,000.00"],"projections":["$2,639,307.29","$2,639,307.29"],"downside":["$688,000.00","$688,000.00"]} | PASS |
| Custom Split | 100% retained vs acn | identical Today/Projections/Downside headline values | {"today":["$880,000.00","$880,000.00"],"projections":["$800,000.00","$800,000.00"],"downside":["$560,000.00","$560,000.00"]} | PASS |
| Projections | 40% ACN, 0% ACN return, base | 3.69%; Y1 $829,520.00; Y10 $1,149,367.02 | 3.69% \| Year 1$829,520.00$809,287.80$0.00$0.00 \| Year 10$1,149,367.02$897,883.68$0.00$0.00 | PASS |
| Downside | Innovation bear, ACN −30%, 40% retained | 20.40% / $163,200.00 / $636,800.00 | 20.40% / $163,200.00 / $636,800.00 Placeholder | PASS |
| Downside | 100% ACN, ACN −30% | remaining $560,000.00 | $560,000.00 Placeholder | PASS |
| Downside | ACN price shock input −50% | remaining $400,000.00 | $400,000.00 | PASS |
| Downside | Shock selector recession | selected | true | PASS |
| Downside | Shock selector valuationReset | selected | true | PASS |
| Downside | Shock selector innovationBear | selected | true | PASS |
| Downside | Early/late comparison | rendered with year-20 balances | Early shock, year 20$560,000.00 Late shock, year 20$560,000.00 Withdrawals paid, | PASS |
| Projections | Hold-all ACN view | Flat illustration badge; break-even 6.15% | true / 6.15% | PASS |
| Projections | Flat ACN, no flows, Y20 | $800,000.00 | Year 20$800,000.00$488,216.75$0.00$0.00 | PASS |
| Projections | First-year spending $500,000 | Y1 $300,000.00; shortfall recorded later | Year 1$300,000.00$292,682.93$500,000.00$0.00 \| Year 5$0.00$0.00$800,000.00$1,828,164.26 | PASS |
| Inputs | Spending "" | rejected with inline error | rejected | PASS |
| Inputs | Spending "-5" | rejected with inline error | rejected | PASS |
| Inputs | Spending "1.234" | rejected with inline error | rejected | PASS |
| Inputs | Spending "$0" | accepted | accepted | PASS |
| Projections | ACN return 5% | gross rate 5.00%, badge "Your what-if" | 5.00% | PASS |
| Inputs | Fee 1% and inflation 3% | saved values 1 / 3 | 1 / 3 | PASS |
| Inputs | Fee 100% | rejected | true | PASS |
| Mix | 10/20/30 buttons (base) | 4.75% / 6.15% / 7.55% | {"m10":"4.75%","m20":"6.15%","m30":"7.55%"} | PASS |
| Mix | Show higher-risk reference → 60% | hidden first; 8.60% | 0 / 8.60% | PASS |
| Mix | Hide reference while selected | returns to 20% (6.15%) | 6.15% | PASS |
| Market path | Conservative/Aggressive/Base | 4.55% / 7.50% / 6.15% | {"conservative":"4.55%","aggressive":"7.50%","base":"6.15%"} | PASS |
| Projections | Horizon 5y | headline equals year-5 table value | $1,078,176.79 / Year 5$1,078,176.79$952,951.18$0.00$0.00 | PASS |
| Projections | Starting-year dollars switch | headline changes to real value | $1,078,176.79 → $952,951.18 | PASS |
| Projections | Compare all three on common axes | 3 series | 3 | PASS |
| Chart | Keyboard inspection End | readout equals year-20 table value | Year 20 — $2,639,307.29 | PASS |
| Chart | Pointer/tap inspection | readout updates to a year | Year 2 — $901,425.80 | PASS |
| Chart | Touch tap inspection | readout updates | Year 9 — $1,368,894.48 | PASS |
| Proceeds | Central, 20% mix, base, $500k draw | Y10 $76,785,730.57; Y20 $130,066,240.64 / real $79,375,647.31 | Year 10$76,785,730.57$59,984,890.00$5,601,690.88$0.00 \| Year 20$130,066,240.64$79,375,647.31$12,772,328.81$0.00 | PASS |
| Proceeds | Central innovation bear | 14.00% / $6,484,679.74 | 14.00% / $6,484,679.74 | PASS |
| Proceeds | Low, 10% mix, conservative | Y20 real $30,470,672.57 | Year 20$49,929,745.01$30,470,672.57$12,772,328.81$0.00 | PASS |
| Proceeds | Low Today holdings | no ACN | 0 | PASS |
| Proceeds | Edit opening → Cancel | unchanged $46,319,141.00 | $46,319,141.00 | PASS |
| Proceeds | Deductions $319,141 + cash outside $1,000,000 | investable $45,000,000.00 | Investable opening capital $45,000,000.00. → $45,000,000.00 | PASS |
| Proceeds | Oversize deductions | refused, confirm disabled | Deductions and cash kept outside cannot exceed the opening amount. | PASS |
| Isolation | Editing Central leaves low | $31,982,606.00 | $31,982,606.00 | PASS |
| Isolation | Editing Central leaves high | $63,230,106.00 | $63,230,106.00 | PASS |
| Isolation | Editing Central leaves My ACN | $800,000.00 | $800,000.00 | PASS |
| Proceeds | Restore default → Cancel | still $45,000,000.00 | $45,000,000.00 | PASS |
| Proceeds | Restore default → Confirm | $46,319,141.00 as a new dated baseline | $46,319,141.00 | PASS |
| Proceeds | Earlier runs preserved | 3 runs selectable | 3 | PASS |
| Position | Update → Cancel | unchanged $800,000.00 | $800,000.00 | PASS |
| Position | Invalid amount "abc" | error, confirm disabled | Enter a dollar amount using digits, commas and up to two decimals. | PASS |
| Position | Shares preview | 3,500 × $200.00 = $700,000.00 | 3,500 shares × $200.00 = opening capital $700,000.00 as of 2026-11-02 (your entered price). | PASS |
| Position | Confirm new baseline | $700,000.00, no Placeholder label | $700,000.00 / $770,000.00 | PASS |
| Position | Actual units | 3,500 | true | PASS |
| Position | diversified view uses same capital | $700,000.00 | $700,000.00 | PASS |
| Position | custom view uses same capital | $700,000.00 | $700,000.00 | PASS |
| Position | Prior paper runs preserved | earlier placeholder run listed |  | PASS |
| Isolation | Position update leaves Central | $46,319,141.00 | $46,319,141.00 | PASS |
| Position | Pasted "$812,345.67" (amount mode) | previews $812,345.67 | New opening capital $812,345.67 for all three views. ≈ 3,692.480318 ACN shares at $220.00  | PASS |
| Track | Track → Cancel | still preview | true | PASS |
| Track | Track → Confirm | tracked run shown; hold-all benchmark row | Compare strategies — same capital and start Price return Total return StrategyOpeningPrice valueReturn100% ACNStarted Nov 2, 2026, 9:33 PM EST$700,000.00$770,000.00+10.00%100% DiversifiedStarted Nov 2 | PASS |
| Navigation | Reopen saved run by direct link | run_mw02prksd2_208122e9 | run_mw02prksd2_208122e9 | PASS |
| Privacy | URLs contain no personal amounts | no digits beyond run id | http://127.0.0.1:38775/#/myacn/custom/today/run/run_mw02prksd2_208122e9 | PASS |
| Quotes | Closed market + weekend BTC | VTI "Market closed"; BTC "Live" (real-time entitlement) | true / true | PASS |
| Quotes | Missing / zero / bad quotes | last verified mark kept (never zero) | true / true | PASS |
| Quotes | Provider 429 | keeps last verified $100.00 |  VTIVanguard Total Stock Market ETF · Core · U.S. broad equity 17.50% $122,500.0 | PASS |
| Quotes | Provider 401 | keeps last verified $100.00 |  VTIVanguard Total Stock Market ETF · Core · U.S. broad equity 17.50% $122,500.0 | PASS |
| Quotes | Provider 403 | keeps last verified $100.00 |  VTIVanguard Total Stock Market ETF · Core · U.S. broad equity 17.50% $122,500.0 | PASS |
| Quotes | Provider timeout | keeps last verified $100.00 |  VTIVanguard Total Stock Market ETF · Core · U.S. broad equity 17.50% $122,500.0 | PASS |
| Quotes | Provider 500 | keeps last verified $100.00 |  VTIVanguard Total Stock Market ETF · Core · U.S. broad equity 17.50% $122,500.0 | PASS |
| Quotes | Second sign-in context | loads | true | PASS |
| Quotes | Manual quote $0 | rejected | Price must be greater than zero. | PASS |
| Quotes | Manual quote $123.45 | NVDA marked $123.45 "Manual" |  NVDANVIDIA · Innovation 3.60% $25,200.00 252 $123.45Manual $31,109.40 +$5,909.40  | PASS |
| Quotes | NVDA unpriced | Incomplete; priced subtotal; 96.40% coverage; awaiting NVDA | Incomplete Priced subtotal $771,200.00 covering 96.40% of opening dollars. Awaiting: NVDA | PASS |
| Return basis | Price return (ACN $100 → $98 ex $2) | −2.00%, excludes dividends/distributions/fees/taxes | −$16,000.00 (−2.00%) \| Price return excludes dividends, ETF distributions, fees and | PASS |
| Return basis | Total return switch | 0.00% with source, through-date, convention | $0.00 (0.00%) \| Gross total return: verified, split-adjusted cash distributions reinvested at th | PASS |
| CSV | Export holdings (total basis) | header with scenario,strategy,return_basis,…,currency; total row; total_return_value | scenario,strategy,return_basis,as_of,run_started,symbol,sleeves,weight_pct,units | PASS |
| Return basis | Comparison total-return switch | diversified series unavailable (no verified history) — not substituted |  Compare strategies — same capital and start Price return Total return StrategyOpeningTotal-return valueReturn100% ACNStarted Nov 2, 2026, 9:33 PM EST$800,000.0 | PASS |
| Return basis | Diversified total return without history | unavailable, lists symbols | Total return unavailable. Positions awaiting anchor prices for: BTC/USD, NVDA, AMZN, GOOGL, AVGO, TSLA, COIN, XYZ, ISRG, | PASS |
| Return basis | Custom Split switch present | visible | true | PASS |
| Return basis | Remove verified event history | total return unavailable for ACN | Total return unavailable. Missing verified distribution history for: ACN. Price return is not substi | PASS |
| CSV | Export projection (Central) | year-20 nominal 130066240.64 matches table | 130066240.64 | PASS |
| Privacy | CSV filename | no amounts | acn-simulator_central_diversified_projection_2026-11-02.csv | PASS |
| Navigation | Back/back/forward | #/low/downside, #/low/today, #/low/downside | #/low/downside, #/low/today, #/low/downside | PASS |
| Navigation | Direct navigation + reload #/myacn/diversified/projections | same view after reload | My ACN · 100% Diversified · Projections | PASS |
| Navigation | Direct navigation + reload #/high/downside | same view after reload | High · High proceeds · Downside | PASS |
| Navigation | Direct navigation + reload #/myacn/custom/today | same view after reload | My ACN · Custom Split · Today | PASS |
| Disclosures | About & disclosures link | dialog with no-brokerage statement | About & disclosures            This is a private planning si | PASS |
| Disclosures | Research weights link | read-only weights table | Research weights (read-only)     Diversi | PASS |
| Disclosures | Data sources link | dialog opens | true | PASS |
| Console | No page errors during flows | none | [] | PASS |
| Layout | 320 portrait: horizontal page scroll | none | none | PASS |
| Layout | 320 portrait: touch targets ≥ 44px | none smaller | none | PASS |
| Layout | 320 portrait: values clipped outside cards | none | none | PASS |
| Layout | 320 portrait: all four scenario names reachable | visible without scrolling | true | PASS |
| Layout | 390 portrait: horizontal page scroll | none | none | PASS |
| Layout | 390 portrait: touch targets ≥ 44px | none smaller | none | PASS |
| Layout | 390 portrait: values clipped outside cards | none | none | PASS |
| Layout | 390 portrait: all four scenario names reachable | visible without scrolling | true | PASS |
| Layout | 820 tablet portrait: horizontal page scroll | none | none | PASS |
| Layout | 820 tablet portrait: touch targets ≥ 44px | none smaller | none | PASS |
| Layout | 820 tablet portrait: values clipped outside cards | none | none | PASS |
| Layout | 820 tablet portrait: all four scenario names reachable | visible without scrolling | true | PASS |
| Layout | 1180 tablet landscape: horizontal page scroll | none | none | PASS |
| Layout | 1180 tablet landscape: touch targets ≥ 44px | none smaller | none | PASS |
| Layout | 1180 tablet landscape: values clipped outside cards | none | none | PASS |
| Layout | 1180 tablet landscape: all four scenario names reachable | visible without scrolling | true | PASS |
| Layout | 1440 desktop: horizontal page scroll | none | none | PASS |
| Layout | 1440 desktop: touch targets ≥ 44px | none smaller | none | PASS |
| Layout | 1440 desktop: values clipped outside cards | none | none | PASS |
| Layout | 1440 desktop: all four scenario names reachable | visible without scrolling | true | PASS |
| Keyboard | Tab to "Central" scenario | focus ring visible (outline ≥ 2px) | solid 3px | PASS |
| Keyboard | Enter on focused tab | navigates to Central | #/central/today | PASS |
| Keyboard | Chart Home → ArrowRight | Year 1 readout | Year 1 — $48,667,768.17 | PASS |
| Accessibility | Hover-only reveals | 0 rules | 0 | PASS |
| Accessibility | Comparison series not colour-only | distinct dash patterns | ["","6 4","2 4"] | PASS |
| Sync | Session A share count → session B after reload | 3,500.125 shares @ $200, $700,025.00, same runs, ACN return 4.5% | $700,025.00; 3,500.125; 3500.125@200; runs 5/5; 0.045 | PASS |
| Sync | Other tab low unchanged | $31,982,606.00 | $31,982,606.00 | PASS |
| Sync | Other tab central unchanged | $46,319,141.00 | $46,319,141.00 | PASS |
| Sync | Other tab high unchanged | $63,230,106.00 | $63,230,106.00 | PASS |
| Sync | Edit in session B → visible in A | 600,000 | 600,000 | PASS |
| Sync | Edit while offline | Offline — pending shown | Offline — 1 pending | PASS |
| Sync | Reconnect retries pending edit once | B sees inflation 3 | 3 | PASS |
| Sync | Concurrent save from stale session | conflict banner, no silent overwrite | Conflict — review | PASS |
| Sync | Resolve conflict → load other version | fee 0.5 | 0.5 | PASS |
| Sync | Edit after resolution propagates | A sees 0.6 | 0.6 | PASS |
| Sync | Offline start (reload with network off) | cached workspace renders with offline notice | true | PASS |
| Privacy | Other account reads/deletes known record id | 404 / 404; own default $800,000.00 | 404 / 404; $800,000.00 | PASS |
| Privacy | Anonymous read | 401 | 401 | PASS |
| Privacy | Sign-out | login screen; no acn: cache keys; API 401 | 0 keys; 401 | PASS |
| Sync | Other session after sign-out in B | still signed in (200) | 200 | PASS |
| Console | No page errors in sync sessions | none | [] | PASS |
