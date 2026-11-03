// One clear SVG line chart per view, inspectable by pointer, touch and keyboard.
// Series are distinguished by dash pattern and markers as well as colour.

const charts = new Map();
const COLORS = ['#0f1f3a', '#2c7a75', '#a07d3b'];
const DASH = ['', '6 4', '2 4'];

function niceTicks(min, max, n = 4) {
  if (min === max) { const d = Math.abs(min) || 1; min -= d * 0.1; max += d * 0.1; }
  const span = max - min;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

/**
 * series: [{ name, points: [{ x, y, xLabel }] }]
 * opts: { id, yFmt, yTickFmt, xTickFmt, title, ariaLabel, singlePointLabel }
 */
export function lineChart(series, opts) {
  const W = 640;
  const H = 260;
  const m = { l: 64, r: 14, t: 14, b: 30 };
  const all = series.flatMap((s) => s.points);
  if (!all.length) return `<p class="note">No observed points yet.</p>`;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  const yt = niceTicks(Math.min(0, ...ys) === 0 && opts.zeroBase ? 0 : Math.min(...ys), Math.max(...ys));
  const sx = (x) => m.l + ((x - xMin) / (xMax - xMin)) * (W - m.l - m.r);
  const sy = (y) => H - m.b - ((y - yt.lo) / (yt.hi - yt.lo || 1)) * (H - m.t - m.b);
  const grid = yt.ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(t)}" y2="${sy(t)}" stroke="#e2dac9" stroke-width="1"/><text x="${m.l - 6}" y="${sy(t) + 4}" text-anchor="end" font-size="11" fill="#5a6474">${opts.yTickFmt(t)}</text>`).join('');
  const xTicks = (opts.xTicks || [...new Set(xs)].slice(0, 6)).map((t) => `<text x="${sx(t)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#5a6474">${opts.xTickFmt(t)}</text>`).join('');
  const lines = series.map((s, i) => {
    const pts = s.points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const markers = s.points.length <= 25 ? s.points.map((p) => markerShape(i, sx(p.x), sy(p.y))).join('') : '';
    return `<polyline fill="none" stroke="${COLORS[i % 3]}" stroke-width="2.5" stroke-dasharray="${DASH[i % 3]}" points="${pts}"/>${markers}`;
  }).join('');
  const single = all.length === 1 && opts.singlePointLabel
    ? `<text x="${sx(all[0].x)}" y="${sy(all[0].y) - 12}" text-anchor="middle" font-size="12" fill="#0f1f3a">${opts.singlePointLabel}</text>` : '';
  charts.set(opts.id, { series, opts, sx, xs: [...new Set(xs)].sort((a, b) => a - b), W, m });
  const legend = series.length > 1
    ? `<div class="legend" aria-hidden="true">${series.map((s, i) => `<span><svg width="26" height="12"><line x1="1" x2="25" y1="6" y2="6" stroke="${COLORS[i % 3]}" stroke-width="2.5" stroke-dasharray="${DASH[i % 3]}"/></svg> ${s.name}</span>`).join('')}</div>` : '';
  return `<div class="chart" data-chart="${opts.id}">
    ${legend}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.ariaLabel}" class="hit" tabindex="0" data-chart-svg="${opts.id}" aria-describedby="${opts.id}-readout">
      ${grid}${xTicks}${lines}${single}
      <line class="cursor" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="#2c7a75" stroke-width="1" visibility="hidden"/>
    </svg>
    <div class="readout" id="${opts.id}-readout" aria-live="polite">Tap, drag or use arrow keys to inspect values.</div>
  </div>`;
}

function markerShape(i, x, y) {
  const c = COLORS[i % 3];
  if (i === 0) return `<circle cx="${x}" cy="${y}" r="3.5" fill="${c}"/>`;
  if (i === 1) return `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="${c}"/>`;
  return `<path d="M${x} ${y - 4.5} L${x + 4.5} ${y + 3.5} L${x - 4.5} ${y + 3.5} Z" fill="${c}"/>`;
}

function inspect(id, idx) {
  const c = charts.get(id);
  if (!c) return;
  idx = Math.max(0, Math.min(c.xs.length - 1, idx));
  c.idx = idx;
  const x = c.xs[idx];
  const root = document.querySelector(`[data-chart="${id}"]`);
  if (!root) return;
  const cur = root.querySelector('.cursor');
  cur.setAttribute('x1', c.sx(x));
  cur.setAttribute('x2', c.sx(x));
  cur.setAttribute('visibility', 'visible');
  const parts = c.series.map((s) => {
    const p = s.points.find((q) => q.x === x);
    return p ? `${c.series.length > 1 ? s.name + ': ' : ''}${c.opts.yFmt(p.y)}` : null;
  }).filter(Boolean);
  const label = c.series.flatMap((s) => s.points).find((q) => q.x === x)?.xLabel || c.opts.xTickFmt(x);
  root.querySelector('.readout').textContent = `${label} — ${parts.join(' · ')}`;
}

function idxFromEvent(svg, id, ev) {
  const c = charts.get(id);
  const r = svg.getBoundingClientRect();
  const vx = ((ev.clientX - r.left) / r.width) * c.W;
  let best = 0;
  let bd = Infinity;
  c.xs.forEach((x, i) => { const d = Math.abs(c.sx(x) - vx); if (d < bd) { bd = d; best = i; } });
  return best;
}

export function bindCharts(root = document) {
  root.querySelectorAll('[data-chart-svg]').forEach((svg) => {
    const id = svg.dataset.chartSvg;
    svg.addEventListener('pointerdown', (e) => { inspect(id, idxFromEvent(svg, id, e)); });
    svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) inspect(id, idxFromEvent(svg, id, e)); });
    svg.addEventListener('keydown', (e) => {
      const c = charts.get(id);
      const cur = c.idx ?? -1;
      if (e.key === 'ArrowRight') { inspect(id, cur + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { inspect(id, cur < 0 ? c.xs.length - 1 : cur - 1); e.preventDefault(); }
      else if (e.key === 'Home') { inspect(id, 0); e.preventDefault(); }
      else if (e.key === 'End') { inspect(id, c.xs.length - 1); e.preventDefault(); }
    });
  });
}

export function chartData(id) { return charts.get(id); }
