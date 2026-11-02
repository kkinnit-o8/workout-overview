// Stats tab: GitHub-style activity heatmap and morning body-weight trend.

import { WORKOUTS, workoutById } from './plan.js';
import * as store from './store.js';
import { listPhotos } from './db.js';
import { esc, icon, formatDate, openSheet, toast } from './ui.js';

const HEAT_WEEKS = 53;
const RANGES = { '1m': 30, '3m': 91, '1y': 365, all: Infinity };
const RANGE_LABELS = { '1m': '1M', '3m': '3M', '1y': '1Y', all: 'All' };
const SVG_NS = 'http://www.w3.org/2000/svg';

let el = null;
let onSettings = null;
let range = '3m';
let showAllEntries = false;
let photoCounts = {};
let activity = {};
let resizeTimer = null;

export async function renderStats(container, opts = {}) {
  el = container;
  onSettings = opts.onSettings;
  if (!el.dataset.bound) {
    el.addEventListener('click', onClick);
    el.addEventListener('pointerover', onHover);
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onResize, 150);
    });
    el.dataset.bound = '1';
  }

  activity = store.activityByDate(WORKOUTS);
  photoCounts = {};
  for (const p of await listPhotos()) photoCounts[p.date] = (photoCounts[p.date] || 0) + 1;

  el.innerHTML = `
    <header class="page-head">
      <div>
        <div class="eyebrow">Consistency &amp; body weight</div>
        <h1>Stats</h1>
      </div>
      <button class="icon-btn" data-action="settings" aria-label="Settings">${icon('settings')}</button>
    </header>
    ${workoutTilesHTML()}
    <section class="card">
      <div class="card-head">
        <h2>Activity</h2>
        <span class="card-sub">${activeDaysLastYear()} active days in the last year</span>
      </div>
      ${heatmapHTML()}
    </section>
    <section class="card" id="weight-card"></section>
  `;

  const scroller = el.querySelector('.hm-scroll');
  scroller.scrollLeft = scroller.scrollWidth;
  renderWeightCard();
}

function onResize() {
  if (el && !el.hidden) drawChart();
}

// --- Workout stats -----------------------------------------------------------

function completedWorkouts() {
  const out = [];
  for (const [date, parts] of Object.entries(activity)) {
    for (const p of parts) if (p.done === p.total) out.push({ date, id: p.id });
  }
  return out;
}

function workoutTilesHTML() {
  const today = store.dateKey();
  const thisMonday = store.mondayOf(today);
  const perWeek = {};
  const completed = completedWorkouts();
  for (const c of completed) {
    const wk = store.mondayOf(c.date);
    perWeek[wk] = (perWeek[wk] || 0) + 1;
  }
  const target = WORKOUTS.length;

  // Weeks in a row with every planned workout done. This week counts once it's
  // complete; until then the streak runs through last week.
  let streak = 0;
  let wk = (perWeek[thisMonday] || 0) >= target ? thisMonday : store.addDays(thisMonday, -7);
  while ((perWeek[wk] || 0) >= target) {
    streak++;
    wk = store.addDays(wk, -7);
  }

  return `<div class="stats">
    <div><strong>${perWeek[thisMonday] || 0}<small>/${target}</small></strong><span>this week</span></div>
    <div><strong>${streak}</strong><span>${streak === 1 ? 'perfect week' : 'perfect weeks'} in a row</span></div>
    <div><strong>${completed.length}</strong><span>workouts done</span></div>
  </div>`;
}

// --- Heatmap -----------------------------------------------------------------

function activeDaysLastYear() {
  const from = store.addDays(store.dateKey(), -364);
  return Object.keys(activity).filter((d) => d >= from).length;
}

// 0 = nothing, 1–3 = part of the workout, 4 = everything done.
function levelFor(parts) {
  if (!parts) return 0;
  const done = parts.reduce((n, p) => n + p.done, 0);
  const total = parts.reduce((n, p) => n + p.total, 0);
  const ratio = done / total;
  if (ratio >= 1) return 4;
  if (ratio >= 2 / 3) return 3;
  if (ratio >= 1 / 3) return 2;
  return 1;
}

function describeDay(date) {
  const day = formatDate(store.parseDateKey(date), { weekday: 'short', day: 'numeric', month: 'short' });
  const parts = activity[date];
  const photos = photoCounts[date];
  const bits = (parts || []).map((p) => `${workoutById(p.id)?.title || p.id}: ${p.done}/${p.total} sets`);
  if (photos) bits.push(`${photos} photo${photos > 1 ? 's' : ''}`);
  return { day, text: bits.length ? bits.join(' · ') : 'No workout logged' };
}

function heatmapHTML() {
  const today = store.dateKey();
  const start = store.addDays(store.mondayOf(today), -(HEAT_WEEKS - 1) * 7);
  let months = '';
  let cells = '';
  let prevMonth = null;

  for (let w = 0; w < HEAT_WEEKS; w++) {
    const monday = store.addDays(start, w * 7);
    const month = store.parseDateKey(monday).getMonth();
    // Label a month above its first full column; skip a sliver at the very start.
    if (month !== prevMonth) {
      const nextChange = [1, 2].some((k) => store.parseDateKey(store.addDays(monday, k * 7)).getMonth() !== month);
      if (w > 0 || !nextChange) {
        months += `<span style="grid-column:${w + 1}">${formatDate(store.parseDateKey(monday), { month: 'short' })}</span>`;
      }
      prevMonth = month;
    }
    for (let d = 0; d < 7; d++) {
      const date = store.addDays(monday, d);
      if (date > today) {
        cells += '<span class="hm-cell future"></span>';
        continue;
      }
      const { day, text } = describeDay(date);
      cells += `<button class="hm-cell l${levelFor(activity[date])}${date === today ? ' today' : ''}" data-date="${date}" aria-label="${esc(`${day}: ${text}`)}"></button>`;
    }
  }

  return `
    <div class="heatmap">
      <div class="hm-days" aria-hidden="true"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div>
      <div class="hm-scroll">
        <div class="hm-months" aria-hidden="true">${months}</div>
        <div class="hm-grid">${cells}</div>
      </div>
    </div>
    <div class="hm-foot">
      <p class="hm-readout" aria-live="polite">Tap a day to see what you did.</p>
      <div class="hm-legend" aria-hidden="true">Less <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> More</div>
    </div>`;
}

function showDay(cell) {
  el.querySelectorAll('.hm-cell.selected').forEach((c) => c.classList.remove('selected'));
  cell.classList.add('selected');
  const { day, text } = describeDay(cell.dataset.date);
  const readout = el.querySelector('.hm-readout');
  readout.innerHTML = '<strong></strong> ';
  readout.firstChild.textContent = day;
  readout.append(text);
}

// --- Body weight -------------------------------------------------------------

// 7-day trailing average (calendar days) at each weigh-in.
function withAverages(entries) {
  return entries.map((e, i) => {
    const from = store.addDays(e.date, -6);
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && entries[j].date >= from; j--) {
      sum += entries[j].kg;
      n++;
    }
    return { ...e, avg: sum / n };
  });
}

function signedKg(n) {
  const v = Math.round(n * 10) / 10;
  return v === 0 ? '±0.0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
}

function renderWeightCard() {
  const card = el.querySelector('#weight-card');
  const entries = withAverages(store.getBodyWeights());

  if (!entries.length) {
    card.innerHTML = `
      <div class="card-head">
        <h2>Body weight</h2>
        <button class="btn btn-ghost btn-sm" data-action="add-weight">${icon('plus')} Add</button>
      </div>
      <p class="card-empty">No weigh-ins yet. Log your weight each morning from the <strong>Today</strong> tab, and the trend shows up here.</p>`;
    return;
  }

  const latest = entries[entries.length - 1];
  const monthAgo = store.addDays(latest.date, -30);
  const past = [...entries].reverse().find((e) => e.date <= monthAgo);
  const change = past ? latest.avg - past.avg : null;

  const list = [...entries].reverse();
  const shown = showAllEntries ? list : list.slice(0, 7);

  card.innerHTML = `
    <div class="card-head">
      <h2>Body weight</h2>
      <button class="btn btn-ghost btn-sm" data-action="add-weight">${icon('plus')} Add</button>
    </div>
    <div class="wt-tiles">
      <div><span>Latest</span><strong>${store.formatKg(latest.kg)} <small>kg</small></strong><em>${esc(relDay(latest.date))}</em></div>
      <div><span>7-day avg</span><strong>${latest.avg.toFixed(1)} <small>kg</small></strong><em>your trend</em></div>
      <div><span>30 days</span><strong>${change == null ? '–' : `${signedKg(change)} <small>kg</small>`}</strong><em>${change == null ? 'needs a month' : 'trend change'}</em></div>
    </div>
    <div class="wt-ranges segmented small" role="tablist" aria-label="Chart range">
      ${Object.keys(RANGES)
        .map((r) => `<button role="tab" data-range="${r}" class="${r === range ? 'active' : ''}">${RANGE_LABELS[r]}</button>`)
        .join('')}
    </div>
    <div class="wt-chart"></div>
    <div class="wt-legend">
      <span><i class="key-dot"></i>Morning weigh-in</span>
      <span><i class="key-line"></i>7-day average</span>
    </div>
    <h3 class="wt-list-title">Weigh-ins</h3>
    <ul class="wt-list">
      ${shown
        .map((e) => {
          const prev = entries[entries.indexOf(e) - 1];
          return `<li><button data-edit-weight="${e.date}">
            <span>${esc(formatDate(store.parseDateKey(e.date), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</span>
            <strong>${store.formatKg(e.kg)} kg</strong>
            <small>${prev ? signedKg(e.kg - prev.kg) : ''}</small>
          </button></li>`;
        })
        .join('')}
    </ul>
    ${list.length > 7 ? `<button class="link-btn wt-more" data-action="toggle-entries">${showAllEntries ? 'Show fewer' : `Show all ${list.length}`}</button>` : ''}`;

  drawChart();
}

function relDay(date) {
  const diff = store.daysBetween(date, store.dateKey());
  if (diff === 0) return 'this morning';
  if (diff === 1) return 'yesterday';
  return formatDate(store.parseDateKey(date), { weekday: 'short', day: 'numeric', month: 'short' });
}

function niceStep(span) {
  for (const step of [0.2, 0.5, 1, 2, 5, 10, 20]) if (span / step <= 4) return step;
  return 50;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function drawChart() {
  const wrap = el?.querySelector('.wt-chart');
  if (!wrap) return;
  const all = withAverages(store.getBodyWeights());
  const today = store.dateKey();
  let start = RANGES[range] === Infinity ? all[0].date : store.addDays(today, -(RANGES[range] - 1));
  if (start < all[0].date) start = all[0].date;
  if (start === today) start = store.addDays(today, -1);
  const points = all.filter((e) => e.date >= start);

  wrap.innerHTML = '';
  if (!points.length) {
    wrap.innerHTML = '<p class="card-empty">No weigh-ins in this period.</p>';
    return;
  }

  const W = wrap.clientWidth || 320;
  const H = 200;
  const m = { top: 12, right: 10, bottom: 26, left: 40 };
  const span = store.daysBetween(start, today);
  const values = points.flatMap((p) => [p.kg, p.avg]);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  }
  const step = niceStep(hi - lo);
  const y0 = Math.floor(lo / step) * step;
  const y1 = Math.ceil(hi / step) * step;
  const x = (date) => m.left + (store.daysBetween(start, date) / span) * (W - m.left - m.right);
  const y = (kg) => m.top + (1 - (kg - y0) / (y1 - y0)) * (H - m.top - m.bottom);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'wt-svg', role: 'img' });
  root.setAttribute(
    'aria-label',
    `Body weight from ${start} to ${today}: ${points.length} weigh-ins between ${store.formatKg(Math.min(...points.map((p) => p.kg)))} and ${store.formatKg(Math.max(...points.map((p) => p.kg)))} kg.`,
  );

  // Grid + y labels
  const decimals = step < 1 ? 1 : 0;
  for (let v = y0; v <= y1 + 1e-9; v += step) {
    root.append(svg('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), class: 'wt-grid' }));
    const t = svg('text', { x: m.left - 8, y: y(v) + 4, class: 'wt-axis', 'text-anchor': 'end' });
    t.textContent = v.toFixed(decimals);
    root.append(t);
  }
  // x labels: start, middle, end
  [start, store.addDays(start, Math.round(span / 2)), today].forEach((d, i) => {
    const t = svg('text', { x: x(d), y: H - 6, class: 'wt-axis', 'text-anchor': ['start', 'middle', 'end'][i] });
    t.textContent = formatDate(store.parseDateKey(d), span > 300 ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });
    root.append(t);
  });

  // Daily dots, then the 7-day average on top.
  const r = points.length > 90 ? 2.5 : 4;
  const dots = svg('g', { class: 'wt-dots' });
  for (const p of points) dots.append(svg('circle', { cx: x(p.date), cy: y(p.kg), r }));
  root.append(dots);
  if (points.length > 1) {
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.avg).toFixed(1)}`).join('');
    root.append(svg('path', { d, class: 'wt-avg' }));
  }

  // Crosshair layer
  const cross = svg('line', { y1: m.top, y2: H - m.bottom, class: 'wt-cross', visibility: 'hidden' });
  const focus = svg('circle', { r: 5, class: 'wt-focus', visibility: 'hidden' });
  const focusAvg = svg('circle', { r: 4, class: 'wt-focus-avg', visibility: 'hidden' });
  root.append(cross, focus, focusAvg);
  wrap.append(root);

  const tip = document.createElement('div');
  tip.className = 'wt-tip';
  tip.hidden = true;
  wrap.append(tip);

  const move = (ev) => {
    const box = root.getBoundingClientRect();
    const px = ev.clientX - box.left;
    let best = points[0];
    for (const p of points) if (Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px)) best = p;
    const cx = x(best.date);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    focus.setAttribute('cx', cx);
    focus.setAttribute('cy', y(best.kg));
    focusAvg.setAttribute('cx', cx);
    focusAvg.setAttribute('cy', y(best.avg));
    [cross, focus, focusAvg].forEach((n) => n.setAttribute('visibility', 'visible'));

    tip.replaceChildren();
    const value = document.createElement('strong');
    value.textContent = `${store.formatKg(best.kg)} kg`;
    const when = document.createElement('span');
    when.textContent = formatDate(store.parseDateKey(best.date), { weekday: 'short', day: 'numeric', month: 'short' });
    const avg = document.createElement('span');
    avg.innerHTML = '<i class="key-line"></i>';
    avg.append(`7-day avg ${best.avg.toFixed(1)} kg`);
    tip.append(value, when, avg);
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(W - tw, cx - tw / 2))}px`;
  };
  const hide = () => {
    [cross, focus, focusAvg].forEach((n) => n.setAttribute('visibility', 'hidden'));
    tip.hidden = true;
  };
  root.addEventListener('pointerdown', move);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerleave', (ev) => ev.pointerType === 'mouse' && hide());
}

// --- Add / edit weigh-in -----------------------------------------------------------

// date = an existing entry to edit, or null to add a new one.
function openWeightEditor(date, onSaved) {
  const existing = date ? store.getBodyWeights().find((e) => e.date === date) : null;
  const initialDate = date || store.dateKey();
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h2>${existing ? 'Edit weigh-in' : 'Add weigh-in'}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
      </div>
      <form class="wt-form">
        <label class="field"><span>Date</span><input type="date" name="date" required max="${store.dateKey()}" value="${initialDate}"></label>
        <label class="field"><span>Morning weight (kg)</span>
          <input type="text" name="kg" inputmode="decimal" autocomplete="off" required value="${existing ? store.formatKg(existing.kg) : ''}" placeholder="e.g. 82.4">
        </label>
        <p class="hint">Weigh yourself in the morning, after the bathroom and before eating, so the numbers compare.</p>
        <button class="btn btn-primary btn-block" type="submit">Save</button>
        ${existing ? `<button class="btn btn-danger btn-block" type="button" data-delete>${icon('trash')} Delete</button>` : ''}
      </form>`;
    const form = sheet.querySelector('form');
    if (!existing) setTimeout(() => form.kg.focus(), 250);
    sheet.querySelector('[data-close]').addEventListener('click', close);
    sheet.querySelector('[data-delete]')?.addEventListener('click', () => {
      store.setBodyWeight(date, null);
      toast('Weigh-in deleted');
      close();
      onSaved?.();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const kg = store.parseKg(form.kg.value);
      const newDate = form.date.value;
      if (kg == null) {
        form.kg.setCustomValidity('Enter your weight in kg, e.g. 82.4');
        form.kg.reportValidity();
        return;
      }
      if (!newDate || newDate > store.dateKey()) {
        form.date.setCustomValidity('Pick a date up to today');
        form.date.reportValidity();
        return;
      }
      const clash = store.getBodyWeights().find((x) => x.date === newDate && newDate !== date);
      if (clash) {
        const day = formatDate(store.parseDateKey(newDate), { weekday: 'short', day: 'numeric', month: 'short' });
        if (!confirm(`${day} already has ${store.formatKg(clash.kg)} kg. Replace it with ${store.formatKg(kg)} kg?`)) return;
      }
      if (existing && newDate !== date) store.setBodyWeight(date, null);
      store.setBodyWeight(newDate, kg);
      toast(`Saved ${store.formatKg(kg)} kg`);
      close();
      onSaved?.();
    });
    form.kg.addEventListener('input', () => form.kg.setCustomValidity(''));
    form.date.addEventListener('input', () => form.date.setCustomValidity(''));
  });
}

// --- Events ------------------------------------------------------------------

function onClick(e) {
  const cell = e.target.closest('.hm-cell[data-date]');
  if (cell) {
    showDay(cell);
    return;
  }
  const r = e.target.closest('[data-range]')?.dataset.range;
  if (r) {
    range = r;
    el.querySelectorAll('[data-range]').forEach((b) => b.classList.toggle('active', b.dataset.range === r));
    drawChart();
    return;
  }
  const edit = e.target.closest('[data-edit-weight]')?.dataset.editWeight;
  if (edit) {
    openWeightEditor(edit, renderWeightCard);
    return;
  }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'settings') onSettings?.();
  else if (action === 'add-weight') openWeightEditor(null, renderWeightCard);
  else if (action === 'toggle-entries') {
    showAllEntries = !showAllEntries;
    renderWeightCard();
  }
}

function onHover(e) {
  if (e.pointerType !== 'mouse') return;
  const cell = e.target.closest('.hm-cell[data-date]');
  if (cell) showDay(cell);
}
