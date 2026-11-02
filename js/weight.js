// Body weight card on the Stats tab: trend chart, weigh-in list, and a weight goal.

import * as store from './store.js';
import { drawLineChart } from './chart.js';
import { esc, icon, formatDate, openSheet, toast } from './ui.js';
import { longDate, shortDate, timeLeft, periodFieldsHTML, bindPeriodFields, readPeriod, periodFromDate, goalProgress, progressBarHTML } from './goals.js';

const RANGES = { goal: null, '1m': 30, '3m': 91, '1y': 365, all: Infinity };
const RANGE_LABELS = { goal: 'Goal', '1m': '1M', '3m': '3M', '1y': '1Y', all: 'All' };

let card = null;
let range = null; // null = pick a default
let showAllEntries = false;

// 7-day trailing average (calendar days) at each weigh-in.
export function withAverages(entries) {
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

export function signedKg(n, digits = 1) {
  const v = Math.round(n * 10 ** digits) / 10 ** digits;
  return v === 0 ? `±${(0).toFixed(digits)}` : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;
}

// Trend pace in kg/week from the 7-day average over the last ~2 weeks (null if too little data).
function weeklyPace(entries) {
  if (entries.length < 3) return null;
  const last = entries[entries.length - 1];
  const from = store.addDays(last.date, -14);
  const base = entries.find((e) => e.date >= from);
  const days = store.daysBetween(base.date, last.date);
  if (days < 7) return null;
  return ((last.avg - base.avg) / days) * 7;
}

// Body-weight goal status, shared with the Today tab.
export function bodyGoalStatus() {
  const goal = store.getGoals().body;
  const entries = withAverages(store.getBodyWeights());
  if (!goal || !entries.length) return null;
  const current = entries[entries.length - 1].avg;
  const { dir, reached, pct, remaining } = goalProgress(goal, current);
  const daysLeft = store.daysBetween(store.dateKey(), goal.targetDate);
  const needed = daysLeft > 0 ? (remaining / daysLeft) * 7 : null;
  const pace = weeklyPace(entries);
  let status = 'unknown';
  if (reached) status = 'reached';
  else if (daysLeft <= 0) status = 'overdue';
  else if (pace != null) status = pace * dir >= needed * dir * 0.85 ? 'on-track' : 'behind';
  const eta = !reached && pace && pace * dir > 0 ? store.addDays(store.dateKey(), Math.round((remaining / pace) * 7)) : null;
  return { goal, current, dir, reached, pct, remaining, daysLeft, needed, pace, status, eta };
}

export function renderWeightCard(el) {
  card = el;
  if (!card.dataset.bound) {
    card.addEventListener('click', onClick);
    card.dataset.bound = '1';
  }
  const entries = withAverages(store.getBodyWeights());
  const goal = store.getGoals().body;
  if (range === null || (range === 'goal' && !goal)) range = goal ? 'goal' : '3m';

  const head = `
    <div class="card-head">
      <h2>Body weight</h2>
      <button class="btn btn-ghost btn-sm" data-w="add">${icon('plus')} Add</button>
    </div>`;

  if (!entries.length) {
    card.innerHTML = `${head}
      <p class="card-empty">No weigh-ins yet. Log your weight each morning from the <strong>Today</strong> tab, and the trend shows up here.</p>`;
    return;
  }

  const latest = entries[entries.length - 1];
  const monthAgo = store.addDays(latest.date, -30);
  const past = [...entries].reverse().find((e) => e.date <= monthAgo);
  const change = past ? latest.avg - past.avg : null;
  const list = [...entries].reverse();
  const shown = showAllEntries ? list : list.slice(0, 7);

  card.innerHTML = `${head}
    <div class="wt-tiles">
      <div><span>Latest</span><strong>${store.formatKg(latest.kg)} <small>kg</small></strong><em>${esc(relDay(latest.date))}</em></div>
      <div><span>7-day avg</span><strong>${latest.avg.toFixed(1)} <small>kg</small></strong><em>your trend</em></div>
      <div><span>30 days</span><strong>${change == null ? '–' : `${signedKg(change)} <small>kg</small>`}</strong><em>${change == null ? 'needs a month' : 'trend change'}</em></div>
    </div>
    ${goalPanelHTML()}
    <div class="segmented small" role="tablist" aria-label="Chart range">
      ${Object.keys(RANGES)
        .filter((r) => r !== 'goal' || goal)
        .map((r) => `<button role="tab" data-range="${r}" class="${r === range ? 'active' : ''}">${RANGE_LABELS[r]}</button>`)
        .join('')}
    </div>
    <div class="chart"></div>
    <div class="ch-legend">
      <span><i class="key-dot muted"></i>Morning weigh-in</span>
      <span><i class="key-line"></i>7-day average</span>
      ${goal ? '<span><i class="key-path"></i>Goal</span>' : ''}
    </div>
    <h3 class="list-title">Weigh-ins</h3>
    <ul class="wt-list">
      ${shown
        .map((e) => {
          const prev = entries[entries.indexOf(e) - 1];
          return `<li><button data-edit-weight="${e.date}">
            <span>${esc(longDate(e.date))}</span>
            <strong>${store.formatKg(e.kg)} kg</strong>
            <small>${prev ? signedKg(e.kg - prev.kg) : ''}</small>
          </button></li>`;
        })
        .join('')}
    </ul>
    ${list.length > 7 ? `<button class="link-btn list-more" data-w="toggle-entries">${showAllEntries ? 'Show fewer' : `Show all ${list.length}`}</button>` : ''}`;

  drawWeightChart();
}

function goalPanelHTML() {
  const s = bodyGoalStatus();
  if (!s) {
    return `<button class="goal-empty" data-w="goal">${icon('target')}<span><strong>Set a weight goal</strong><small>Pick a target and how many days, weeks or months to get there.</small></span>${icon('right')}</button>`;
  }
  const { goal, current, pct, remaining, needed, pace, status, eta } = s;
  const statusText = {
    reached: [icon('check'), 'Goal reached!'],
    'on-track': [icon('check'), 'On track'],
    behind: [icon('alert'), 'Behind pace'],
    overdue: [icon('alert'), 'Deadline passed'],
    unknown: [icon('clock'), 'Keep weighing in to see your pace'],
  }[status];
  return `
    <button class="goal-panel ${status}" data-w="goal" aria-label="Edit weight goal">
      <div class="goal-top">
        <span class="goal-title">${icon('target')} Goal <strong>${store.formatKg(goal.targetKg)} kg</strong></span>
        <span class="goal-when">${esc(shortDate(goal.targetDate))} · ${esc(timeLeft(goal.targetDate))}</span>
      </div>
      ${progressBarHTML(pct, 'Progress to weight goal')}
      <div class="goal-row">
        <span>${store.formatKg(goal.startKg)} → <strong>${current.toFixed(1)}</strong> → ${store.formatKg(goal.targetKg)} kg</span>
        <span class="goal-status">${statusText[0]} ${statusText[1]}</span>
      </div>
      ${
        status === 'reached'
          ? ''
          : `<div class="goal-row muted">
              <span>${Math.abs(remaining).toFixed(1)} kg to go${needed != null ? ` · need ${signedKg(needed, 2)} kg/wk` : ''}</span>
              <span>${pace != null ? `you: ${signedKg(pace, 2)} kg/wk` : ''}</span>
            </div>
            ${eta ? `<div class="goal-row muted"><span>At this pace you get there around ${esc(shortDate(eta))}.</span></div>` : ''}`
      }
    </button>`;
}

function relDay(date) {
  const diff = store.daysBetween(date, store.dateKey());
  if (diff === 0) return 'this morning';
  if (diff === 1) return 'yesterday';
  return formatDate(store.parseDateKey(date), { weekday: 'short', day: 'numeric', month: 'short' });
}

export function drawWeightChart() {
  const wrap = card?.querySelector('.chart');
  if (!wrap) return;
  const all = withAverages(store.getBodyWeights());
  const goal = store.getGoals().body;
  const today = store.dateKey();
  let start;
  let end = today;
  if (range === 'goal' && goal) {
    start = goal.startDate < all[0].date ? goal.startDate : all[0].date;
    end = goal.targetDate > today ? goal.targetDate : today;
  } else {
    start = RANGES[range] === Infinity ? all[0].date : store.addDays(today, -(RANGES[range] - 1));
    if (start < all[0].date) start = all[0].date;
  }
  if (start >= end) start = store.addDays(end, -1);
  const points = all.filter((e) => e.date >= start && e.date <= end);
  if (!points.length) {
    wrap.innerHTML = '<p class="card-empty">No weigh-ins in this period.</p>';
    return;
  }

  drawLineChart(wrap, {
    start,
    end,
    dots: points.map((p) => ({ date: p.date, y: p.kg })),
    line: points.map((p) => ({ date: p.date, y: p.avg })),
    path: goal ? [{ date: goal.startDate, y: goal.startKg }, { date: goal.targetDate, y: goal.targetKg }] : null,
    target: range === 'goal' && goal ? { y: goal.targetKg, label: store.formatKg(goal.targetKg) } : null,
    minSpan: 1,
    ariaLabel: `Body weight from ${start} to ${end}: ${points.length} weigh-ins.`,
    tooltip: (i) => [
      { text: `${store.formatKg(points[i].kg)} kg`, strong: true },
      { text: formatDate(store.parseDateKey(points[i].date), { weekday: 'short', day: 'numeric', month: 'short' }) },
      { text: `7-day avg ${points[i].avg.toFixed(1)} kg`, key: 'line' },
    ],
  });
}

// --- Sheets --------------------------------------------------------------------

// date = an existing entry to edit, or null to add a new one.
function openWeightEditor(date) {
  const existing = date ? store.getBodyWeights().find((e) => e.date === date) : null;
  const initialDate = date || store.dateKey();
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h2>${existing ? 'Edit weigh-in' : 'Add weigh-in'}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
      </div>
      <form class="sheet-form">
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
      renderWeightCard(card);
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
      if (clash && !confirm(`${shortDate(newDate)} already has ${store.formatKg(clash.kg)} kg. Replace it with ${store.formatKg(kg)} kg?`)) return;
      if (existing && newDate !== date) store.setBodyWeight(date, null);
      store.setBodyWeight(newDate, kg);
      toast(`Saved ${store.formatKg(kg)} kg`);
      close();
      renderWeightCard(card);
    });
    form.kg.addEventListener('input', () => form.kg.setCustomValidity(''));
    form.date.addEventListener('input', () => form.date.setCustomValidity(''));
  });
}

function openGoalEditor() {
  const goal = store.getGoals().body;
  const entries = withAverages(store.getBodyWeights());
  const current = entries.length ? entries[entries.length - 1].avg : null;
  const period = goal ? periodFromDate(goal.targetDate) : { amount: 12, unit: 'weeks' };

  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h2>${goal ? 'Weight goal' : 'Set a weight goal'}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
      </div>
      <form class="sheet-form">
        <p class="hint">${current != null ? `Your 7-day average is <strong>${current.toFixed(1)} kg</strong>.` : 'Log a weigh-in first so the goal has a starting point.'}</p>
        <label class="field"><span>Target weight (kg)</span>
          <input type="text" name="kg" inputmode="decimal" autocomplete="off" required value="${goal ? store.formatKg(goal.targetKg) : ''}" placeholder="e.g. 85">
        </label>
        ${periodFieldsHTML({ ...period, required: true })}
        <p class="hint goal-pace-preview" aria-live="polite"></p>
        <button class="btn btn-primary btn-block" type="submit" ${current == null ? 'disabled' : ''}>Save goal</button>
        ${goal ? `<button class="btn btn-danger btn-block" type="button" data-delete>${icon('trash')} Remove goal</button>` : ''}
      </form>`;
    const form = sheet.querySelector('form');
    bindPeriodFields(form);
    const pacePreview = sheet.querySelector('.goal-pace-preview');
    const updatePace = () => {
      const kg = store.parseKg(form.kg.value);
      const date = readPeriod(form);
      if (kg == null || !date || current == null) {
        pacePreview.textContent = '';
        return;
      }
      const weeks = store.daysBetween(store.dateKey(), date) / 7;
      const perWeek = (kg - current) / weeks;
      pacePreview.textContent = `That's ${signedKg(kg - current)} kg — about ${signedKg(perWeek, 2)} kg per week.`;
    };
    form.addEventListener('input', updatePace);
    form.addEventListener('click', (e) => e.target.closest('[data-unit]') && updatePace());
    updatePace();

    sheet.querySelector('[data-close]').addEventListener('click', close);
    sheet.querySelector('[data-delete]')?.addEventListener('click', () => {
      store.setBodyGoal(null);
      toast('Weight goal removed');
      close();
      renderWeightCard(card);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const kg = store.parseKg(form.kg.value);
      const targetDate = readPeriod(form);
      if (kg == null) {
        form.kg.setCustomValidity('Enter a target in kg, e.g. 85');
        form.kg.reportValidity();
        return;
      }
      if (!targetDate) {
        form.amount.setCustomValidity('How many days, weeks or months?');
        form.amount.reportValidity();
        return;
      }
      // Keep the original starting point when only the target or deadline changes.
      const startKg = goal ? goal.startKg : Math.round(current * 10) / 10;
      const startDate = goal ? goal.startDate : store.dateKey();
      store.setBodyGoal({ targetKg: kg, startKg, startDate, targetDate });
      range = 'goal';
      toast(`Goal set: ${store.formatKg(kg)} kg by ${shortDate(targetDate)}`);
      close();
      renderWeightCard(card);
    });
    form.kg.addEventListener('input', () => form.kg.setCustomValidity(''));
    form.amount.addEventListener('input', () => form.amount.setCustomValidity(''));
  });
}

function onClick(e) {
  const r = e.target.closest('[data-range]')?.dataset.range;
  if (r) {
    range = r;
    card.querySelectorAll('[data-range]').forEach((b) => b.classList.toggle('active', b.dataset.range === r));
    drawWeightChart();
    return;
  }
  const edit = e.target.closest('[data-edit-weight]')?.dataset.editWeight;
  if (edit) {
    openWeightEditor(edit);
    return;
  }
  const action = e.target.closest('[data-w]')?.dataset.w;
  if (action === 'add') openWeightEditor(null);
  else if (action === 'goal') openGoalEditor();
  else if (action === 'toggle-entries') {
    showAllEntries = !showAllEntries;
    renderWeightCard(card);
  }
}
