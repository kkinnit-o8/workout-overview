// Stats tab: streak, GitHub-style activity heatmap, body weight, and exercises.

import { WORKOUTS, workoutById, workoutForWeekday } from './plan.js';
import * as store from './store.js';
import { listPhotos } from './db.js';
import { esc, icon, formatDate } from './ui.js';
import { renderWeightCard, drawWeightChart } from './weight.js';
import { renderExercisesCard, exerciseCatalog } from './exercises.js';

const HEAT_WEEKS = 53;
// Heatmap level per day state (see store.trainingDays).
const LEVEL = { none: 0, missed: 0, pending: 0, rest: 1, some: 2, most: 3, done: 4 };

let el = null;
let onSettings = null;
let days = null;
let photoCounts = {};
let resizeTimer = null;

export async function renderStats(container, opts = {}) {
  el = container;
  onSettings = opts.onSettings;
  if (!el.dataset.bound) {
    el.addEventListener('click', onClick);
    el.addEventListener('pointerover', onHover);
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => el && !el.hidden && drawWeightChart(), 150);
    });
    el.dataset.bound = '1';
  }

  days = store.trainingDays(WORKOUTS);
  photoCounts = {};
  for (const p of await listPhotos()) photoCounts[p.date] = (photoCounts[p.date] || 0) + 1;

  el.innerHTML = `
    <header class="page-head">
      <div>
        <div class="eyebrow">Consistency, records &amp; goals</div>
        <h1>Stats</h1>
      </div>
      <button class="icon-btn" data-action="settings" aria-label="Settings">${icon('settings')}</button>
    </header>
    ${streakHTML()}
    ${tilesHTML()}
    <section class="card">
      <div class="card-head">
        <h2>Activity</h2>
        <span class="card-sub">${trainingDaysLastYear()} workouts in the last year</span>
      </div>
      ${heatmapHTML()}
    </section>
    <section class="card" id="weight-card"></section>
    <section class="card" id="exercises-card"></section>
  `;

  const scroller = el.querySelector('.hm-scroll');
  scroller.scrollLeft = scroller.scrollWidth;
  renderWeightCard(el.querySelector('#weight-card'));
  renderExercisesCard(el.querySelector('#exercises-card'));
}

// --- Streak & tiles ----------------------------------------------------------------

function streakHTML() {
  const s = days.streak();
  const todays = workoutForWeekday(store.parseDateKey(days.today).getDay());
  let status;
  if (!days.start) status = 'Finish your first workout to start a streak.';
  else if (s.pendingToday) status = `Do at least half of today's ${esc(todays?.title || 'workout')} to make it ${s.current + 1}.`;
  else if (todays) status = 'Today is done — nice work.';
  else status = 'Rest day — it counts. Recover well.';
  return `
    <section class="streak-card ${s.pendingToday ? 'pending' : ''}">
      <div class="streak-icon">${icon('flame')}</div>
      <div class="streak-main">
        <div><strong class="streak-num">${s.current}</strong> <span>day streak</span></div>
        <p>${status}</p>
      </div>
      <div class="streak-best"><span>Best</span><strong>${s.best}</strong></div>
    </section>
    <p class="streak-rule">Rest days count. Workout days count when you do at least half the sets.</p>`;
}

function tilesHTML() {
  const today = store.dateKey();
  const thisMonday = store.mondayOf(today);
  let thisWeek = 0;
  let total = 0;
  for (const [date, parts] of Object.entries(days.activity)) {
    const n = parts.filter((p) => p.done === p.total).length;
    total += n;
    if (date >= thisMonday) thisWeek += n;
  }
  const monthAgo = store.addDays(today, -29);
  let records = 0;
  for (const ex of exerciseCatalog()) {
    // The first logged weight isn't a "record" — only beating it is.
    records += store.exerciseRecords(ex.id).slice(1).filter((r) => r.date >= monthAgo).length;
  }
  return `<div class="stats">
    <div><strong>${thisWeek}<small>/${WORKOUTS.length}</small></strong><span>this week</span></div>
    <div><strong>${total}</strong><span>workouts done</span></div>
    <div><strong>${records}</strong><span>records in 30 days</span></div>
  </div>`;
}

// --- Heatmap -------------------------------------------------------------------

function trainingDaysLastYear() {
  const from = store.addDays(store.dateKey(), -364);
  return Object.keys(days.activity).filter((d) => d >= from && ['done', 'most'].includes(days.state(d))).length;
}

function describeDay(date) {
  const day = formatDate(store.parseDateKey(date), { weekday: 'short', day: 'numeric', month: 'short' });
  const st = days.state(date);
  const planned = workoutForWeekday(store.parseDateKey(date).getDay());
  const bits = (days.activity[date] || []).map((p) => `${workoutById(p.id)?.title || p.id}: ${p.done}/${p.total} sets`);
  if (!bits.length) {
    if (st === 'rest') bits.push('Rest day');
    else if (st === 'missed') bits.push(`Missed: ${planned.title}`);
    else if (st === 'pending') bits.push(`Today: ${planned.title} — not done yet`);
    else bits.push('Before you started tracking');
  }
  const photos = photoCounts[date];
  if (photos) bits.push(`${photos} photo${photos > 1 ? 's' : ''}`);
  return { day, text: bits.join(' · ') };
}

function heatmapHTML() {
  const today = days.today;
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
      const st = days.state(date);
      const { day, text } = describeDay(date);
      cells += `<button class="hm-cell l${LEVEL[st]}${date === today ? ' today' : ''}" data-date="${date}" aria-label="${esc(`${day}: ${text}`)}"></button>`;
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
    <div class="hm-legend" aria-hidden="true">
      <span><i class="l0"></i>Missed</span>
      <span><i class="l1"></i>Rest</span>
      <span><i class="l2"></i><i class="l3"></i>Partly</span>
      <span><i class="l4"></i>Done</span>
    </div>
    <p class="hm-readout" aria-live="polite">Tap a day to see what you did.</p>`;
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

// --- Events ------------------------------------------------------------------

function onClick(e) {
  const cell = e.target.closest('.hm-cell[data-date]');
  if (cell) {
    showDay(cell);
    return;
  }
  if (e.target.closest('[data-action="settings"]')) onSettings?.();
}

function onHover(e) {
  if (e.pointerType !== 'mouse') return;
  const cell = e.target.closest('.hm-cell[data-date]');
  if (cell) showDay(cell);
}
