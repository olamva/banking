/**
 * Renders one self-contained HTML file to data/dashboard.html, with every
 * transaction embedded as JSON. No framework, no chart library, no network,
 * no server — vanilla JS + inline SVG runs entirely in the browser.
 *
 * There is no aggregation logic in this file. The page re-filters client-side,
 * and it does that by calling `monthStats`/`yearStats` from `src/stats.ts`,
 * embedded verbatim via `.toString()` — one implementation, one set of tests,
 * nothing to keep hand-synced. What lives here is browsing: which rows are in
 * view, and how to draw them.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { STATS_FNS } from '../core/stats.ts';
import type { Categorized } from '../core/types.ts';

export type Filters = {
  category: string;
  source: '' | 'sb1' | 'card';
  search: string;
  minAmount: number | null;
  maxAmount: number | null;
};

// ---------------------------------------------------------------------------
// Selection — which rows are in view. No money logic; that is stats.ts.
// Embedded into the page alongside STATS_FNS.
// ---------------------------------------------------------------------------

export function inMonth(t: Categorized, month: string): boolean {
  return t.date.slice(0, 7) === month;
}

export function inYear(t: Categorized, year: string): boolean {
  return t.date.slice(0, 4) === year;
}

export function matchesFilters(t: Categorized, f: Filters): boolean {
  if (f.category && t.category !== f.category) return false;
  if (f.source && t.source !== f.source) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = (t.description + ' ' + (t.counterparty ?? '')).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const abs = Math.abs(t.amount);
  if (f.minAmount != null && abs < f.minAmount) return false;
  if (f.maxAmount != null && abs > f.maxAmount) return false;
  return true;
}

export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function distinctMonths(txns: Categorized[]): string[] {
  return [...new Set(txns.map((t) => t.date.slice(0, 7)))].sort();
}

export function distinctYears(txns: Categorized[]): string[] {
  return [...new Set(txns.map((t) => t.date.slice(0, 4)))].sort();
}

export function distinctCategories(txns: Categorized[]): string[] {
  return [...new Set(txns.map((t) => t.category))].sort();
}

/** The selection helpers above. `STATS_FNS` supplies everything that sums money. */
const VIEW_FNS = [inMonth, inYear, matchesFilters, prevMonth, distinctMonths, distinctYears, distinctCategories];

// ---------------------------------------------------------------------------
// Presentation — CSS and client-side rendering. Not money logic.
// ---------------------------------------------------------------------------

const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
:root {
  color-scheme: light;
  --page: #f9f9f7;
  --surface-1: #fcfcfb;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --text-muted: #898781;
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --border: rgba(11,11,11,0.10);
  --series-1: #2a78d6;
  --series-1-track: #cde2fb;
  --series-2: #eb6834;
  --diverging-pos: #e34948;
  --diverging-neg: #2a78d6;
  --diverging-mid: #f0efec;
  --good: #0ca30c;
  --critical: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d;
    --surface-1: #1a1a19;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --grid: #2c2c2a;
    --axis: #383835;
    --border: rgba(255,255,255,0.10);
    --series-1: #3987e5;
    --series-1-track: #184f95;
    --series-2: #d95926;
    --diverging-pos: #e66767;
    --diverging-neg: #3987e5;
    --diverging-mid: #383835;
  }
}
html[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d;
  --surface-1: #1a1a19;
  --text-primary: #ffffff;
  --text-secondary: #c3c2b7;
  --text-muted: #898781;
  --grid: #2c2c2a;
  --axis: #383835;
  --border: rgba(255,255,255,0.10);
  --series-1: #3987e5;
  --series-1-track: #184f95;
  --series-2: #d95926;
  --diverging-pos: #e66767;
  --diverging-neg: #3987e5;
  --diverging-mid: #383835;
}
body {
  background: var(--page);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 20px 24px 60px;
}
.wrap { max-width: 1180px; margin: 0 auto; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
h1 { font-size: 20px; margin: 0; }
.subtitle { color: var(--text-secondary); font-size: 13px; }
#themeToggle {
  background: var(--surface-1); color: var(--text-secondary); border: 1px solid var(--border);
  border-radius: 6px; padding: 6px 10px; font-size: 12px; cursor: pointer;
}
.filters {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 12px; margin-bottom: 20px;
}
.filters select, .filters input {
  background: var(--page); color: var(--text-primary); border: 1px solid var(--border);
  border-radius: 6px; padding: 6px 8px; font-size: 13px; font-family: inherit;
}
.filters input[type="search"] { width: 160px; }
.filters input[type="number"] { width: 90px; }
.seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.seg button {
  background: var(--page); color: var(--text-secondary); border: none; padding: 6px 12px;
  font-size: 13px; font-family: inherit; cursor: pointer;
}
.seg button[aria-pressed="true"] { background: var(--series-1); color: #fff; }
.filters button.reset {
  background: transparent; color: var(--text-muted); border: 1px solid var(--border);
  border-radius: 6px; padding: 6px 10px; font-size: 12px; cursor: pointer; margin-left: auto;
}
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
.tile { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.tile .label { font-size: 12px; color: var(--text-secondary); }
.tile .value { font-size: 26px; font-weight: 600; margin-top: 4px; }
.tile .delta { font-size: 12px; margin-top: 4px; }
.tile .delta.good { color: var(--good); }
.tile .delta.bad { color: var(--critical); }
.tile .delta.flat { color: var(--text-muted); }
.meter-track { background: var(--series-1-track); border-radius: 6px; height: 10px; overflow: hidden; margin-top: 8px; }
.meter-fill { background: var(--series-1); height: 100%; border-radius: 6px; }
.tile .note { font-size: 11px; color: var(--text-muted); margin-top: 6px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px; }
.card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 16px; min-width: 0; }
.card h2 { font-size: 14px; margin: 0 0 10px; }
.card.wide { grid-column: 1 / -1; }
svg text { fill: var(--text-secondary); font-size: 11px; font-family: inherit; }
svg .muted { fill: var(--text-muted); }
svg .grid { stroke: var(--grid); stroke-width: 1; }
svg .axis { stroke: var(--axis); stroke-width: 1; }
.bar-label { fill: var(--text-secondary); }
.bar-value { fill: var(--text-primary); font-weight: 600; }
.legend { display: flex; gap: 14px; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
.legend .key { display: inline-flex; align-items: center; gap: 6px; }
.legend .swatch { width: 12px; height: 3px; border-radius: 2px; display: inline-block; }
.hoverable { cursor: default; }
.hoverable:hover { opacity: 0.85; }
table.dtable { width: 100%; border-collapse: collapse; font-size: 12px; }
table.dtable th, table.dtable td { text-align: left; padding: 4px 8px 4px 0; border-bottom: 1px solid var(--grid); }
table.dtable td.num, table.dtable th.num { text-align: right; font-variant-numeric: tabular-nums; }
details.tv { margin-top: 10px; }
details.tv summary { cursor: pointer; font-size: 12px; color: var(--text-muted); }
.tv-wrap { overflow-x: auto; margin-top: 8px; }
.tooltip {
  position: fixed; pointer-events: none; background: var(--surface-1); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 9px; font-size: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.15); z-index: 10; display: none; max-width: 240px;
}
.tooltip .t-value { font-weight: 600; }
.tooltip .t-label { color: var(--text-secondary); }
.empty { color: var(--text-muted); padding: 40px 0; text-align: center; }
.card-note { font-size: 11px; color: var(--text-muted); margin-top: 8px; }
@media (max-width: 480px) {
  .filters input[type="search"] { width: 120px; }
}
`;

const UI_SCRIPT = `
function fmtNOK(n) {
  var r = Math.round(n);
  return r.toLocaleString('nb-NO') + ' kr';
}
function fmtPct(share) {
  return Math.round(share * 1000) / 10 + '%';
}
function svgEl(tag, attrs) {
  var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (var k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function niceStep(maxVal) {
  if (maxVal <= 0) return 1;
  var rough = maxVal / 4;
  var mag = Math.pow(10, Math.floor(Math.log10(rough)));
  var norm = rough / mag;
  var step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

var tooltip = document.getElementById('tooltip');
function showTooltip(evt, html) {
  tooltip.innerHTML = html;
  tooltip.style.display = 'block';
  var x = evt.clientX + 14, y = evt.clientY + 14;
  var vw = window.innerWidth, vh = window.innerHeight;
  tooltip.style.left = Math.min(x, vw - 250) + 'px';
  tooltip.style.top = Math.min(y, vh - 100) + 'px';
}
function hideTooltip() { tooltip.style.display = 'none'; }

function textEl(x, y, str, cls) {
  var t = svgEl('text', { x: x, y: y });
  if (cls) t.setAttribute('class', cls);
  t.textContent = str;
  return t;
}

/** Horizontal bar list: category totals or top counterparties. One hue — magnitude, not identity. */
function horizontalBars(container, items, opts) {
  container.innerHTML = '';
  if (!items.length) {
    var e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'Nothing in this range.';
    container.appendChild(e);
    return;
  }
  var rowH = 26;
  var labelW = 130;
  var pad = 8;
  var width = Math.max(container.clientWidth || 340, 240);
  var barAreaW = width - labelW - 60;
  var height = items.length * rowH + pad;
  var svg = svgEl('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height });
  var maxVal = Math.max.apply(null, items.map(function (i) { return i.total; })) || 1;
  items.forEach(function (item, i) {
    var y = i * rowH + pad / 2;
    var w = Math.max((item.total / maxVal) * barAreaW, 1);
    var label = textEl(labelW - 8, y + 16, item.label, 'bar-label');
    label.setAttribute('text-anchor', 'end');
    svg.appendChild(label);
    var rect = svgEl('rect', { x: labelW, y: y + 3, width: w, height: 16, rx: 4, fill: 'var(--series-1)', class: 'hoverable' });
    svg.appendChild(rect);
    var valueLabel = textEl(labelW + w + 8, y + 16, fmtNOK(item.total), 'bar-value');
    svg.appendChild(valueLabel);
    rect.addEventListener('pointermove', function (evt) {
      showTooltip(evt, '<div class="t-label">' + item.label + '</div><div class="t-value">' + fmtNOK(item.total) + (item.count ? ' &middot; ' + item.count + ' txns' : '') + '</div>');
    });
    rect.addEventListener('pointerleave', hideTooltip);
  });
  container.appendChild(svg);
}

/** Diverging bar chart for category deltas: red = spent more, blue = spent less. */
function divergingBars(container, deltas) {
  container.innerHTML = '';
  var shown = deltas.filter(function (d) { return Math.abs(d.delta) > 0.5; }).slice(0, 8);
  if (!shown.length) {
    var e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'No change from last month.';
    container.appendChild(e);
    return;
  }
  var rowH = 26;
  var pad = 8;
  var width = Math.max(container.clientWidth || 340, 240);
  var mid = width / 2;
  var maxAbs = Math.max.apply(null, shown.map(function (d) { return Math.abs(d.delta); })) || 1;
  var halfW = (width / 2) - 90;
  var height = shown.length * rowH + pad;
  var svg = svgEl('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height });
  svg.appendChild(svgEl('line', { x1: mid, x2: mid, y1: 0, y2: height, class: 'axis' }));
  shown.forEach(function (d, i) {
    var y = i * rowH + pad / 2;
    var w = Math.max((Math.abs(d.delta) / maxAbs) * halfW, 1);
    var positive = d.delta > 0;
    var x = positive ? mid : mid - w;
    var rect = svgEl('rect', { x: x, y: y + 3, width: w, height: 16, rx: 4, fill: positive ? 'var(--diverging-pos)' : 'var(--diverging-neg)', class: 'hoverable' });
    svg.appendChild(rect);
    var catLabel = textEl(positive ? mid - w - 8 : mid + w + 8, y + 16, d.category, 'bar-label');
    catLabel.setAttribute('text-anchor', positive ? 'end' : 'start');
    svg.appendChild(catLabel);
    rect.addEventListener('pointermove', function (evt) {
      showTooltip(evt, '<div class="t-label">' + d.category + '</div><div class="t-value">' + (positive ? '+' : '') + fmtNOK(d.delta) + '</div><div class="t-label">was ' + fmtNOK(d.previous) + '</div>');
    });
    rect.addEventListener('pointerleave', hideTooltip);
  });
  container.appendChild(svg);
}

/** Grouped bar chart: totalIn vs totalOut per month across a year. */
function monthlyGroupedBars(container, series) {
  container.innerHTML = '';
  if (!series.length) {
    var e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'No months in range.';
    container.appendChild(e);
    return;
  }
  var width = Math.max(container.clientWidth || 500, 280);
  var height = 220;
  var padL = 50, padB = 24, padT = 10;
  var plotW = width - padL - 16;
  var plotH = height - padB - padT;
  var maxVal = Math.max.apply(null, series.map(function (m) { return Math.max(m.totalIn, m.totalOut); })) || 1;
  var step = niceStep(maxVal);
  var gridMax = Math.ceil(maxVal / step) * step;
  var svg = svgEl('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height });
  for (var v = 0; v <= gridMax; v += step) {
    var gy = padT + plotH - (v / gridMax) * plotH;
    svg.appendChild(svgEl('line', { x1: padL, x2: width - 8, y1: gy, y2: gy, class: 'grid' }));
    var t = textEl(padL - 8, gy + 3, fmtNOK(v).replace(' kr', ''), 'muted');
    t.setAttribute('text-anchor', 'end');
    svg.appendChild(t);
  }
  var clusterW = plotW / series.length;
  var barW = Math.min(24, clusterW / 3);
  series.forEach(function (m, i) {
    var cx = padL + i * clusterW + clusterW / 2;
    var outH = (m.totalOut / gridMax) * plotH;
    var inH = (m.totalIn / gridMax) * plotH;
    var outRect = svgEl('rect', { x: cx - barW - 1, y: padT + plotH - outH, width: barW, height: Math.max(outH, 0), rx: 3, fill: 'var(--series-1)', class: 'hoverable' });
    var inRect = svgEl('rect', { x: cx + 1, y: padT + plotH - inH, width: barW, height: Math.max(inH, 0), rx: 3, fill: 'var(--series-2)', class: 'hoverable' });
    svg.appendChild(outRect);
    svg.appendChild(inRect);
    var label = textEl(cx, height - 6, monthLabel(m.month), 'muted');
    label.setAttribute('text-anchor', 'middle');
    svg.appendChild(label);
    var tipHtml = '<div class="t-label">' + m.month + '</div>' +
      '<div class="t-value">out ' + fmtNOK(m.totalOut) + '</div>' +
      '<div class="t-value">in ' + fmtNOK(m.totalIn) + '</div>' +
      '<div class="t-label">net ' + fmtNOK(m.net) + ' &middot; card ' + fmtPct(m.cardShare) + '</div>';
    [outRect, inRect].forEach(function (r) {
      r.addEventListener('pointermove', function (evt) { showTooltip(evt, tipHtml); });
      r.addEventListener('pointerleave', hideTooltip);
    });
  });
  svg.appendChild(svgEl('line', { x1: padL, x2: padL, y1: padT, y2: padT + plotH, class: 'axis' }));
  svg.appendChild(svgEl('line', { x1: padL, x2: width - 8, y1: padT + plotH, y2: padT + plotH, class: 'axis' }));
  container.appendChild(svg);
}

function monthLabel(month) {
  var parts = month.split('-');
  var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, 1));
  return d.toLocaleDateString('nb-NO', { month: 'short', timeZone: 'UTC' });
}

function statTile(container, label, value, delta, deltaGood, note) {
  var tile = document.createElement('div');
  tile.className = 'tile';
  var html = '<div class="label">' + label + '</div><div class="value">' + value + '</div>';
  if (delta !== undefined && delta !== null) {
    var cls = Math.abs(delta.pct) < 0.005 ? 'flat' : (delta.good ? 'good' : 'bad');
    var arrow = delta.raw > 0 ? '\\u2191' : delta.raw < 0 ? '\\u2193' : '\\u2192';
    html += '<div class="delta ' + cls + '">' + arrow + ' ' + fmtNOK(Math.abs(delta.raw)) + ' vs last month</div>';
  }
  if (note) html += '<div class="note">' + note + '</div>';
  tile.innerHTML = html;
  container.appendChild(tile);
}

function meterTile(container, label, share, note) {
  var tile = document.createElement('div');
  tile.className = 'tile';
  tile.innerHTML = '<div class="label">' + label + '</div><div class="value">' + fmtPct(share) + '</div>' +
    '<div class="meter-track"><div class="meter-fill" style="width:' + Math.min(share * 100, 100) + '%"></div></div>' +
    '<div class="note">' + note + '</div>';
  container.appendChild(tile);
}

function dataTable(headers, rows) {
  var wrap = document.createElement('div');
  wrap.className = 'tv-wrap';
  var table = document.createElement('table');
  table.className = 'dtable';
  var thead = document.createElement('tr');
  headers.forEach(function (h) {
    var th = document.createElement('th');
    if (h.num) th.className = 'num';
    th.textContent = h.label;
    thead.appendChild(th);
  });
  table.appendChild(thead);
  rows.forEach(function (row) {
    var tr = document.createElement('tr');
    row.forEach(function (cell, i) {
      var td = document.createElement('td');
      if (headers[i].num) td.className = 'num';
      td.textContent = cell;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  wrap.appendChild(table);
  return wrap;
}

function tableToggle(container, headers, rows) {
  var details = document.createElement('details');
  details.className = 'tv';
  var summary = document.createElement('summary');
  summary.textContent = 'Table';
  details.appendChild(summary);
  details.appendChild(dataTable(headers, rows));
  container.appendChild(details);
}

function card(title) {
  var el = document.createElement('div');
  el.className = 'card';
  var h = document.createElement('h2');
  h.textContent = title;
  el.appendChild(h);
  return el;
}

// ---- state -----------------------------------------------------------

var state = {
  view: 'month',
  month: null,
  year: null,
  filters: { category: '', source: '', search: '', minAmount: null, maxAmount: null }
};

var months = distinctMonths(TXNS);
var years = distinctYears(TXNS);
var categories = distinctCategories(TXNS);
state.month = months[months.length - 1] || null;
state.year = years[years.length - 1] || null;

function populateSelects() {
  var monthSel = document.getElementById('monthSel');
  months.forEach(function (m) {
    var o = document.createElement('option');
    o.value = m; o.textContent = m;
    monthSel.appendChild(o);
  });
  monthSel.value = state.month;

  var yearSel = document.getElementById('yearSel');
  years.forEach(function (y) {
    var o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearSel.appendChild(o);
  });
  yearSel.value = state.year;

  var catSel = document.getElementById('categorySel');
  categories.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });
}

function wireFilters() {
  document.getElementById('viewMonthBtn').addEventListener('click', function () { setView('month'); });
  document.getElementById('viewYearBtn').addEventListener('click', function () { setView('year'); });
  document.getElementById('monthSel').addEventListener('change', function (e) { state.month = e.target.value; render(); });
  document.getElementById('yearSel').addEventListener('change', function (e) { state.year = e.target.value; render(); });
  document.getElementById('categorySel').addEventListener('change', function (e) { state.filters.category = e.target.value; render(); });
  document.getElementById('sourceSel').addEventListener('change', function (e) { state.filters.source = e.target.value; render(); });
  document.getElementById('searchInput').addEventListener('input', function (e) { state.filters.search = e.target.value; render(); });
  document.getElementById('minAmount').addEventListener('input', function (e) { state.filters.minAmount = e.target.value === '' ? null : Number(e.target.value); render(); });
  document.getElementById('maxAmount').addEventListener('input', function (e) { state.filters.maxAmount = e.target.value === '' ? null : Number(e.target.value); render(); });
  document.getElementById('resetBtn').addEventListener('click', function () {
    state.filters = { category: '', source: '', search: '', minAmount: null, maxAmount: null };
    document.getElementById('categorySel').value = '';
    document.getElementById('sourceSel').value = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('minAmount').value = '';
    document.getElementById('maxAmount').value = '';
    render();
  });
  document.getElementById('themeToggle').addEventListener('click', function () {
    var html = document.documentElement;
    var current = html.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : current === 'light' ? null : 'dark';
    if (next) { html.setAttribute('data-theme', next); localStorage.setItem('dashboardTheme', next); }
    else { html.removeAttribute('data-theme'); localStorage.removeItem('dashboardTheme'); }
  });
  var savedTheme = localStorage.getItem('dashboardTheme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
}

function setView(view) {
  state.view = view;
  document.getElementById('viewMonthBtn').setAttribute('aria-pressed', String(view === 'month'));
  document.getElementById('viewYearBtn').setAttribute('aria-pressed', String(view === 'year'));
  document.getElementById('monthSel').style.display = view === 'month' ? '' : 'none';
  document.getElementById('yearSel').style.display = view === 'year' ? '' : 'none';
  render();
}

function round2(n) { return Math.round(n * 100) / 100; }

/** What the card meter says underneath. blindSpot comes from stats.ts. */
function cardNote(rows) {
  var blind = blindSpot(rows);
  if (!blind.count) return 'Every card row has a merchant.';
  return blind.count + ' rows still have no merchant (' + fmtNOK(blind.total) + ') \\u2014 no statement export covers them.';
}

function deltaInfo(current, previous, goodIfUp) {
  var raw = round2(current - previous);
  var pct = previous !== 0 ? raw / Math.abs(previous) : (raw === 0 ? 0 : 1);
  var up = raw > 0;
  var good = raw === 0 ? true : (goodIfUp ? up : !up);
  return { raw: raw, pct: pct, good: good };
}

/** monthStats reports subscriptions and recurring separately; the card shows one list. */
function subsAndRecurring(stats) {
  var seen = {};
  return stats.subscriptions.concat(stats.recurring).filter(function (t) {
    var key = t.source + ':' + t.id;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  }).sort(byDate);
}

function renderMonthView(root) {
  var month = state.month;
  if (!month) { root.appendChild(emptyState()); return; }
  var periodAll = TXNS.filter(function (t) { return inMonth(t, month); });
  var periodFiltered = periodAll.filter(function (t) { return matchesFilters(t, state.filters); });
  var prevM = prevMonth(month);
  var prevFiltered = TXNS.filter(function (t) { return inMonth(t, prevM); }).filter(function (t) { return matchesFilters(t, state.filters); });

  var s = monthStats(month, periodFiltered, prevFiltered);
  var prev = monthStats(prevM, prevFiltered);
  var cats = s.categories.map(function (c) { return { label: c.category, total: c.total }; });
  var cps = s.topCounterparties.map(function (c) { return { label: c.counterparty, total: c.total, count: c.count }; });
  var subs = subsAndRecurring(s);
  var deltas = s.categoryDeltas;
  // Excluded is reported for the whole month, not the filtered slice — it is an audit line.
  var excl = monthStats(month, periodAll).excluded;
  var card_ = s.cardShare;

  var kpis = document.createElement('div');
  kpis.className = 'kpis';
  statTile(kpis, 'Spent', fmtNOK(s.totalOut), deltaInfo(s.totalOut, prev.totalOut, false));
  statTile(kpis, 'Income', fmtNOK(s.totalIn), deltaInfo(s.totalIn, prev.totalIn, true));
  statTile(kpis, 'Net', fmtNOK(s.net), deltaInfo(s.net, prev.net, true));
  meterTile(kpis, 'Card spend', card_, cardNote(periodFiltered));
  root.appendChild(kpis);

  var cards = document.createElement('div');
  cards.className = 'cards';

  var catCard = card('Spending by category');
  var catChart = document.createElement('div');
  catCard.appendChild(catChart);
  cards.appendChild(catCard);

  var deltaCard = card('Biggest changes vs last month');
  var deltaChart = document.createElement('div');
  deltaCard.appendChild(deltaChart);
  cards.appendChild(deltaCard);

  var cpCard = card('Biggest counterparties');
  var cpChart = document.createElement('div');
  cpCard.appendChild(cpChart);
  if (state.filters.source === 'card') {
    var note = document.createElement('div');
    note.className = 'card-note';
    note.textContent = 'Card rows have no counterparty \\u2014 this list is always empty when filtered to card only.';
    cpCard.appendChild(note);
  }
  cards.appendChild(cpCard);

  var subCard = card('Subscriptions & recurring');
  if (subs.length) {
    subscriptionsTable(subCard, subs);
  } else {
    var e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'None this month.';
    subCard.appendChild(e);
  }
  cards.appendChild(subCard);

  root.appendChild(cards);

  var noteRow = document.createElement('div');
  noteRow.className = 'card-note';
  noteRow.style.marginTop = '12px';
  noteRow.textContent = excl.count + ' transaction(s) totalling ' + fmtNOK(excl.total) + ' excluded this month (internal transfers, card bill payments).';
  root.appendChild(noteRow);

  horizontalBars(catChart, cats, {});
  tableToggle(catCard, [{ label: 'Category' }, { label: 'Total', num: true }], cats.map(function (c) { return [c.label, fmtNOK(c.total)]; }));
  divergingBars(deltaChart, deltas);
  tableToggle(deltaCard, [{ label: 'Category' }, { label: 'This month', num: true }, { label: 'Last month', num: true }, { label: 'Delta', num: true }],
    deltas.slice(0, 8).map(function (d) { return [d.category, fmtNOK(d.current), fmtNOK(d.previous), (d.delta > 0 ? '+' : '') + fmtNOK(d.delta)]; }));
  horizontalBars(cpChart, cps, {});
  tableToggle(cpCard, [{ label: 'Counterparty' }, { label: 'Total', num: true }, { label: 'Count', num: true }],
    cps.map(function (c) { return [c.label, fmtNOK(c.total), String(c.count)]; }));
}

function subscriptionsTable(container, txns) {
  container.appendChild(dataTable(
    [{ label: 'Date' }, { label: 'Description' }, { label: 'Category' }, { label: 'Amount', num: true }],
    txns.map(function (t) { return [t.date, t.counterparty || t.description, t.category, fmtNOK(t.amount)]; })
  ));
}

function renderYearView(root) {
  var year = state.year;
  if (!year) { root.appendChild(emptyState()); return; }
  var periodAll = TXNS.filter(function (t) { return inYear(t, year); });
  var periodFiltered = periodAll.filter(function (t) { return matchesFilters(t, state.filters); });
  var y = yearStats(year, byMonth(periodFiltered));
  var series = y.months;
  var cats = y.categories.map(function (c) { return { label: c.category, total: c.total }; });
  var excl = yearStats(year, byMonth(periodAll)).excluded;
  var card_ = y.cardShare;

  var kpis = document.createElement('div');
  kpis.className = 'kpis';
  statTile(kpis, 'Average monthly spend', fmtNOK(y.averageMonth.totalOut));
  statTile(kpis, 'Average monthly income', fmtNOK(y.averageMonth.totalIn));
  statTile(kpis, 'Average monthly net', fmtNOK(y.averageMonth.net));
  meterTile(kpis, 'Card spend', card_, cardNote(periodFiltered));
  root.appendChild(kpis);

  var cards = document.createElement('div');
  cards.className = 'cards';

  var seriesCard = card('Income & spend by month');
  seriesCard.className = 'card wide';
  var legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = '<span class="key"><span class="swatch" style="background:var(--series-1)"></span>Spent</span>' +
    '<span class="key"><span class="swatch" style="background:var(--series-2)"></span>Income</span>';
  seriesCard.appendChild(legend);
  var seriesChart = document.createElement('div');
  seriesCard.appendChild(seriesChart);
  cards.appendChild(seriesCard);

  var catCard = card('Spending by category (year)');
  var catChart = document.createElement('div');
  catCard.appendChild(catChart);
  cards.appendChild(catCard);

  root.appendChild(cards);

  var noteRow = document.createElement('div');
  noteRow.className = 'card-note';
  noteRow.style.marginTop = '12px';
  noteRow.textContent = excl.count + ' transaction(s) totalling ' + fmtNOK(excl.total) + ' excluded this year (internal transfers, card bill payments).';
  root.appendChild(noteRow);

  monthlyGroupedBars(seriesChart, series);
  tableToggle(seriesCard, [{ label: 'Month' }, { label: 'Spent', num: true }, { label: 'Income', num: true }, { label: 'Net', num: true }, { label: 'Card share', num: true }],
    series.map(function (m) { return [m.month, fmtNOK(m.totalOut), fmtNOK(m.totalIn), fmtNOK(m.net), fmtPct(m.cardShare)]; }));
  horizontalBars(catChart, cats, {});
  tableToggle(catCard, [{ label: 'Category' }, { label: 'Total', num: true }], cats.map(function (c) { return [c.label, fmtNOK(c.total)]; }));
}

function emptyState() {
  var e = document.createElement('div');
  e.className = 'empty';
  e.textContent = 'No transactions match the current filters.';
  return e;
}

function render() {
  var root = document.getElementById('content');
  root.innerHTML = '';
  if (!TXNS.length) { root.appendChild(emptyState()); return; }
  if (state.view === 'month') renderMonthView(root);
  else renderYearView(root);
}

populateSelects();
wireFilters();
setView('month');
`;

/**
 * `const <name> = <source>;` for each function, which works for both `function`
 * declarations and the arrow consts in stats.ts. Order is the array order, so
 * STATS_FNS must stay in dependency order.
 */
function embed(fns: readonly Function[]): string {
  return fns.map((f) => `const ${f.name} = ${f.toString()};`).join('\n');
}

/** The analysis half of the page's <script>, exported so a test can evaluate it. */
export function embeddedSource(): string {
  return embed(STATS_FNS) + '\n' + embed(VIEW_FNS);
}

function pageShell(dataJson: string): string {
  const helperSource = embeddedSource();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spending dashboard</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>Spending dashboard</h1>
      <div class="subtitle">Local file, generated once. Never share this page or a screenshot of it.</div>
    </div>
    <button id="themeToggle" type="button">Toggle theme</button>
  </header>
  <div class="filters">
    <div class="seg">
      <button id="viewMonthBtn" type="button" aria-pressed="true">Month</button>
      <button id="viewYearBtn" type="button" aria-pressed="false">Year</button>
    </div>
    <select id="monthSel"></select>
    <select id="yearSel" style="display:none"></select>
    <select id="categorySel"><option value="">All categories</option></select>
    <select id="sourceSel">
      <option value="">Bank + card</option>
      <option value="sb1">Bank only</option>
      <option value="card">Card only</option>
    </select>
    <input id="searchInput" type="search" placeholder="Search description…">
    <input id="minAmount" type="number" placeholder="Min NOK">
    <input id="maxAmount" type="number" placeholder="Max NOK">
    <button id="resetBtn" class="reset" type="button">Reset filters</button>
  </div>
  <div id="content"></div>
</div>
<div id="tooltip" class="tooltip"></div>
<script>
const TXNS = ${dataJson};
${helperSource}
${UI_SCRIPT}
</script>
</body>
</html>
`;
}

/** Pure: builds the full HTML string. No I/O. */
export function renderDashboard(txns: Categorized[]): string {
  return pageShell(JSON.stringify(txns));
}

/** I/O: writes the rendered dashboard to disk. */
export async function writeDashboard(txns: Categorized[], outFile = 'data/dashboard.html'): Promise<void> {
  const dir = outFile.slice(0, outFile.lastIndexOf('/'));
  if (dir) await mkdir(dir, { recursive: true });
  await writeFile(outFile, renderDashboard(txns));
}
