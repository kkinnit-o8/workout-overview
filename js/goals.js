// Shared goal helpers: the "in X days / weeks / months" picker and progress maths.

import * as store from './store.js';
import { esc, formatDate } from './ui.js';

const UNITS = ['days', 'weeks', 'months'];

export function longDate(date) {
  return formatDate(store.parseDateKey(date), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function shortDate(date) {
  return formatDate(store.parseDateKey(date), { day: 'numeric', month: 'short' });
}

// "13 weeks left", "5 days left", "2 months left"
export function timeLeft(targetDate) {
  const days = store.daysBetween(store.dateKey(), targetDate);
  if (days < 0) return 'deadline passed';
  if (days === 0) return 'due today';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} left`;
  if (days < 90) return `${Math.round(days / 7)} weeks left`;
  return `${Math.round(days / 30.4)} months left`;
}

// Number + Days/Weeks/Months, with a live "→ date" preview.
// `required` = a deadline must be given (body-weight goals); otherwise empty = no deadline.
export function periodFieldsHTML({ amount = '', unit = 'weeks', required = false } = {}) {
  return `
    <div class="field period">
      <span>${required ? 'Reach it in' : 'Deadline (optional)'}</span>
      <div class="period-row">
        <input type="text" name="amount" inputmode="numeric" autocomplete="off" value="${esc(amount)}" placeholder="${required ? '12' : '–'}" ${required ? 'required' : ''} aria-label="Amount">
        <div class="segmented small period-units" role="radiogroup" aria-label="Unit">
          ${UNITS.map((u) => `<button type="button" role="radio" data-unit="${u}" aria-checked="${u === unit}" class="${u === unit ? 'active' : ''}">${u[0].toUpperCase() + u.slice(1)}</button>`).join('')}
        </div>
      </div>
      <small class="period-preview" aria-live="polite"></small>
    </div>`;
}

export function bindPeriodFields(form) {
  const preview = form.querySelector('.period-preview');
  const update = () => {
    const date = readPeriod(form);
    preview.textContent = date ? `→ ${longDate(date)}` : form.amount.required ? '' : 'No deadline';
  };
  form.querySelector('.period-units').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unit]');
    if (!b) return;
    form.querySelectorAll('[data-unit]').forEach((x) => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-checked', x === b);
    });
    update();
  });
  form.amount.addEventListener('input', update);
  update();
}

// Target date from the picker, or null when no amount is given.
export function readPeriod(form) {
  const amount = parseInt(form.amount.value, 10);
  if (!amount || amount < 1 || amount > 1000) return null;
  const unit = form.querySelector('[data-unit].active')?.dataset.unit || 'weeks';
  return store.addPeriod(store.dateKey(), amount, unit);
}

// Best guess at how a stored target date was entered, to pre-fill the picker.
export function periodFromDate(targetDate) {
  if (!targetDate) return { amount: '', unit: 'weeks' };
  const days = store.daysBetween(store.dateKey(), targetDate);
  if (days <= 0) return { amount: '', unit: 'weeks' };
  if (days % 7 === 0) return { amount: days / 7, unit: 'weeks' };
  return { amount: days, unit: 'days' };
}

// Share of the way from start to target (0–1), and whether it's reached.
export function goalProgress(goal, current) {
  const dir = Math.sign(goal.targetKg - goal.startKg) || 1;
  const reached = dir > 0 ? current >= goal.targetKg : current <= goal.targetKg;
  const total = goal.targetKg - goal.startKg;
  const pct = total === 0 ? 1 : Math.max(0, Math.min(1, (current - goal.startKg) / total));
  return { dir, reached, pct: reached ? 1 : pct, remaining: goal.targetKg - current };
}

export function progressBarHTML(pct, label) {
  return `<div class="goal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}" aria-label="${esc(label)}"><span style="width:${(pct * 100).toFixed(1)}%"></span></div>`;
}
