// Exercises card on the Stats tab: records, a weight chart per exercise, and goals.

import { ALL_WORKOUTS, DAY_NAMES } from './plan.js';
import * as store from './store.js';
import { drawLineChart } from './chart.js';
import { esc, icon, openSheet, toast } from './ui.js';
import { longDate, shortDate, timeLeft, periodFieldsHTML, bindPeriodFields, readPeriod, periodFromDate, goalProgress, progressBarHTML } from './goals.js';

// Every exercise in the plan (and the rest-day bonus workouts) once, in plan order:
// { id, name, bodyweight, noWeight, bonusOnly, days: ['Mon', ...], plans: ['4×6–12', ...] }
export function exerciseCatalog() {
  const byId = new Map();
  for (const w of ALL_WORKOUTS) {
    for (const ex of w.exercises) {
      if (!byId.has(ex.id)) {
        byId.set(ex.id, { id: ex.id, name: ex.name, bodyweight: !!ex.bodyweight, noWeight: !!ex.noWeight, bonusOnly: true, days: [], plans: [] });
      }
      const item = byId.get(ex.id);
      const day = w.bonus ? 'Bonus' : DAY_NAMES[w.weekday].slice(0, 3);
      if (!w.bonus) item.bonusOnly = false;
      if (item.days.includes(day)) continue;
      item.days.push(day);
      item.plans.push(`${ex.sets}×${ex.reps}${ex.unit ? ` ${ex.unit}` : ''}`);
    }
  }
  return [...byId.values()];
}

export function exerciseById(id) {
  return exerciseCatalog().find((e) => e.id === id) || null;
}

// "24 kg", or for bodyweight exercises "+10 kg" / "Bodyweight".
export function formatLoad(ex, kg) {
  if (ex?.bodyweight) return kg > 0 ? `+${store.formatLift(kg)} kg` : 'Bodyweight';
  return `${store.formatLift(kg)} kg`;
}

export function exerciseGoalStatus(id) {
  const goal = store.getGoals().exercises[id];
  if (!goal) return null;
  const best = store.exerciseBest(id);
  const current = best ? best.kg : goal.startKg;
  const reachedOn = store.exerciseHistory(id).find((e) => e.kg >= goal.targetKg && e.date >= goal.startDate)?.date || null;
  return { goal, current, ...goalProgress(goal, current), reachedOn };
}

let card = null;

export function renderExercisesCard(el) {
  card = el;
  if (!card.dataset.bound) {
    card.addEventListener('click', (e) => {
      const id = e.target.closest('[data-exercise]')?.dataset.exercise;
      if (id) openExerciseSheet(id);
    });
    card.dataset.bound = '1';
  }
  const weekAgo = store.addDays(store.dateKey(), -6);
  // Bonus-workout exercises only show up once you've logged a weight for them.
  const rows = exerciseCatalog()
    .filter((ex) => !ex.noWeight && (!ex.bonusOnly || store.exerciseHistory(ex.id).length))
    .map((ex) => {
      const best = store.exerciseBest(ex.id);
      const last = store.exerciseHistory(ex.id).pop();
      const records = store.exerciseRecords(ex.id);
      const fresh = records.length > 1 && records[records.length - 1].date >= weekAgo;
      const g = exerciseGoalStatus(ex.id);
      return `<li><button data-exercise="${esc(ex.id)}">
        <span class="exl-main">
          <span class="exl-name">${esc(ex.name)}${fresh ? '<em class="badge">New record</em>' : ''}</span>
          <small>${esc(ex.days.join(' · '))}${last ? ` · last ${esc(formatLoad(ex, last.kg))}` : ''}</small>
        </span>
        <span class="exl-best">${best ? `${icon('trophy')} ${esc(formatLoad(ex, best.kg))}` : '<small>No data yet</small>'}</span>
        ${icon('right')}
        ${
          g
            ? `<span class="exl-goal">${progressBarHTML(g.pct, `Goal progress for ${ex.name}`)}<small>${
                g.reached ? 'Goal reached!' : `Goal ${esc(formatLoad(ex, g.goal.targetKg))}${g.goal.targetDate ? ` · ${esc(timeLeft(g.goal.targetDate))}` : ''}`
              }</small></span>`
            : ''
        }
      </button></li>`;
    })
    .join('');

  card.innerHTML = `
    <div class="card-head">
      <h2>Exercises</h2>
      <span class="card-sub">Tap one for its chart, records and goal</span>
    </div>
    <ul class="ex-list">${rows}</ul>`;
}

// --- Exercise sheet ------------------------------------------------------------

function openExerciseSheet(id) {
  const ex = exerciseById(id);
  if (!ex) return;
  let showAll = false;
  openSheet(
    (sheet, close) => {
      const refresh = () => {
        render();
        if (card) renderExercisesCard(card);
      };
      sheet.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) close();
        else if (e.target.closest('[data-goal]')) openExerciseGoalEditor(ex, refresh);
        else if (e.target.closest('[data-toggle-log]')) {
          showAll = !showAll;
          render();
        } else {
          const date = e.target.closest('[data-edit-entry]')?.dataset.editEntry;
          if (date) openEntryEditor(ex, date, refresh);
        }
      });

      const render = () => {
        const history = store.exerciseHistory(id);
        const records = store.exerciseRecords(id);
        const best = records[records.length - 1] || null;
        const last = history[history.length - 1] || null;
        const first = history[0] || null;
        const g = exerciseGoalStatus(id);

        sheet.innerHTML = `
          <div class="sheet-handle"></div>
          <div class="sheet-head">
            <h2>${esc(ex.name)}</h2>
            <button class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
          </div>
          <p class="hint">${esc(ex.days.map((d, i) => `${d} ${ex.plans[i]}`).join(' · '))}${
            ex.bodyweight ? ' · weights are <strong>extra weight</strong> on top of your body weight' : ''
          }</p>
          ${
            history.length
              ? `<div class="wt-tiles">
                  <div><span>Record</span><strong>${esc(formatLoad(ex, best.kg))}</strong><em>${esc(shortDate(best.date))}</em></div>
                  <div><span>Last time</span><strong>${esc(formatLoad(ex, last.kg))}</strong><em>${esc(shortDate(last.date))}</em></div>
                  <div><span>Since start</span><strong>${first.kg === last.kg ? '±0' : `${last.kg > first.kg ? '+' : '−'}${store.formatLift(Math.abs(last.kg - first.kg))}`} <small>kg</small></strong><em>from ${esc(shortDate(first.date))}</em></div>
                </div>
                <div class="chart"></div>`
              : `<p class="card-empty">No weights logged yet. Type the weight you use into the box next to this exercise on the <strong>Today</strong> tab, and the chart builds itself.</p>`
          }
          ${goalSectionHTML(ex, g)}
          ${
            records.length
              ? `<h3 class="list-title">Records</h3>
                <ul class="wt-list">${[...records]
                  .reverse()
                  .map((r, i, arr) => {
                    const prev = arr[i + 1];
                    return `<li><div class="row"><span>${esc(longDate(r.date))}</span><strong>${icon('trophy')} ${esc(formatLoad(ex, r.kg))}</strong><small>${prev ? `+${store.formatLift(r.kg - prev.kg)}` : 'first'}</small></div></li>`;
                  })
                  .join('')}</ul>`
              : ''
          }
          ${history.length ? logHTML(ex, history, showAll) : ''}`;

        const wrap = sheet.querySelector('.chart');
        if (wrap) {
          const today = store.dateKey();
          let start = first.date;
          if (store.daysBetween(start, today) < 14) start = store.addDays(today, -14);
          drawLineChart(wrap, {
            start,
            end: today,
            dots: history.map((h) => ({ date: h.date, y: h.kg })),
            target: g && !g.reached ? { y: g.goal.targetKg, label: `${store.formatLift(g.goal.targetKg)}` } : null,
            mark: history.length > 1 ? { date: best.date, y: best.kg, label: `Record ${formatLoad(ex, best.kg)}` } : null,
            minSpan: 4,
            ariaLabel: `${ex.name}: ${history.length} logged weights, record ${formatLoad(ex, best.kg)}.`,
            tooltip: (i) => {
              const h = history[i];
              const rows = [
                { text: formatLoad(ex, h.kg), strong: true },
                { text: longDate(h.date) },
              ];
              if (ex.bodyweight) {
                const bw = store.bodyWeightOn(h.date);
                if (bw) rows.push({ text: `Total ${store.formatKg(bw.kg + h.kg)} kg (body ${store.formatKg(bw.kg)})` });
              }
              return rows;
            },
          });
        }
      };
      render();
    },
    { className: 'tall' },
  );
}

// Every logged weight, newest first; tap one to fix or delete it.
function logHTML(ex, history, showAll) {
  const list = [...history].reverse();
  const shown = showAll ? list : list.slice(0, 6);
  return `
    <h3 class="list-title">Logged weights</h3>
    <ul class="wt-list">${shown
      .map(
        (h) => `<li><button data-edit-entry="${h.date}" aria-label="Edit ${esc(longDate(h.date))}">
          <span>${esc(longDate(h.date))}</span>
          <strong>${esc(formatLoad(ex, h.kg))}</strong>
          <small>${icon('edit')}</small>
        </button></li>`,
      )
      .join('')}</ul>
    ${list.length > 6 ? `<button class="link-btn list-more" data-toggle-log>${showAll ? 'Show fewer' : `Show all ${list.length}`}</button>` : ''}`;
}

function openEntryEditor(ex, date, onSaved) {
  const current = store.getWeight(ex.id, date);
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h2>${esc(ex.name)}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
      </div>
      <form class="sheet-form">
        <p class="hint">${esc(longDate(date))}</p>
        <label class="field"><span>${ex.bodyweight ? 'Extra weight (kg) — not your body weight' : 'Weight (kg)'}</span>
          <input type="text" name="kg" inputmode="decimal" autocomplete="off" required value="${esc(current)}">
        </label>
        <button class="btn btn-primary btn-block" type="submit">Save</button>
        <button class="btn btn-danger btn-block" type="button" data-delete>${icon('trash')} Delete this entry</button>
      </form>`;
    const form = sheet.querySelector('form');
    sheet.querySelector('[data-close]').addEventListener('click', close);
    sheet.querySelector('[data-delete]').addEventListener('click', () => {
      store.setWeight(ex.id, date, '');
      toast('Entry deleted');
      close();
      onSaved();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = Number(form.kg.value.replace(',', '.'));
      if (!form.kg.value.trim() || !Number.isFinite(n) || n < 0 || n > 500) {
        form.kg.setCustomValidity('Enter a weight in kg, e.g. 22.5');
        form.kg.reportValidity();
        return;
      }
      store.setWeight(ex.id, date, store.formatLift(n));
      toast('Saved');
      close();
      onSaved();
    });
    form.kg.addEventListener('input', () => form.kg.setCustomValidity(''));
  });
}

function goalSectionHTML(ex, g) {
  if (!g) {
    return `<button class="goal-empty" data-goal>${icon('target')}<span><strong>Set a goal</strong><small>e.g. ${ex.bodyweight ? '+20 kg' : '30 kg'}${ex.bodyweight ? ' extra' : ''}, with or without a deadline.</small></span>${icon('right')}</button>`;
  }
  const { goal, current, pct, reached, reachedOn, remaining } = g;
  return `
    <button class="goal-panel ${reached ? 'reached' : ''}" data-goal aria-label="Edit goal">
      <div class="goal-top">
        <span class="goal-title">${icon('target')} Goal <strong>${esc(formatLoad(ex, goal.targetKg))}</strong></span>
        <span class="goal-when">${goal.targetDate ? `${esc(shortDate(goal.targetDate))} · ${esc(timeLeft(goal.targetDate))}` : 'no deadline'}</span>
      </div>
      ${progressBarHTML(pct, `Progress to ${ex.name} goal`)}
      <div class="goal-row">
        <span>${esc(formatLoad(ex, goal.startKg))} → <strong>${esc(formatLoad(ex, current))}</strong></span>
        <span class="goal-status">${reached ? `${icon('check')} Reached${reachedOn ? ` ${esc(shortDate(reachedOn))}` : ''}!` : `${store.formatLift(Math.abs(remaining))} kg to go`}</span>
      </div>
    </button>`;
}

function openExerciseGoalEditor(ex, onSaved) {
  const goal = store.getGoals().exercises[ex.id];
  const best = store.exerciseBest(ex.id);
  const period = goal ? periodFromDate(goal.targetDate) : { amount: '', unit: 'weeks' };
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h2>Goal: ${esc(ex.name)}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
      </div>
      <form class="sheet-form">
        <p class="hint">${best ? `Your record is <strong>${esc(formatLoad(ex, best.kg))}</strong>.` : 'No weights logged yet — the goal starts from 0.'}</p>
        <label class="field"><span>${ex.bodyweight ? 'Target extra weight (kg)' : 'Target weight (kg)'}</span>
          <input type="text" name="kg" inputmode="decimal" autocomplete="off" required value="${goal ? store.formatLift(goal.targetKg) : ''}" placeholder="${ex.bodyweight ? 'e.g. 20' : 'e.g. 30'}">
        </label>
        ${periodFieldsHTML(period)}
        <button class="btn btn-primary btn-block" type="submit">Save goal</button>
        ${goal ? `<button class="btn btn-danger btn-block" type="button" data-delete>${icon('trash')} Remove goal</button>` : ''}
      </form>`;
    const form = sheet.querySelector('form');
    bindPeriodFields(form);
    sheet.querySelector('[data-close]').addEventListener('click', close);
    sheet.querySelector('[data-delete]')?.addEventListener('click', () => {
      store.setExerciseGoal(ex.id, null);
      toast('Goal removed');
      close();
      onSaved();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = Number(form.kg.value.replace(',', '.'));
      if (!form.kg.value.trim() || !Number.isFinite(n) || n <= 0 || n > 500) {
        form.kg.setCustomValidity('Enter a weight in kg, e.g. 30');
        form.kg.reportValidity();
        return;
      }
      const targetKg = Math.round(n * 100) / 100;
      if (best && targetKg <= best.kg) {
        form.kg.setCustomValidity(`Your record is already ${formatLoad(ex, best.kg)} — aim higher.`);
        form.kg.reportValidity();
        return;
      }
      store.setExerciseGoal(ex.id, {
        targetKg,
        startKg: goal ? goal.startKg : best ? best.kg : 0,
        startDate: goal ? goal.startDate : store.dateKey(),
        targetDate: readPeriod(form),
      });
      toast(`Goal set: ${formatLoad(ex, targetKg)}`);
      close();
      onSaved();
    });
    form.kg.addEventListener('input', () => form.kg.setCustomValidity(''));
  });
}
