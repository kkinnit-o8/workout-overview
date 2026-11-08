// Picks a bonus workout for a rest day you'd rather train on.
// Only workouts that don't train yesterday's or tomorrow's muscles qualify, so
// the plan days around it still get fresh muscles. Among those, the one you've
// done least recently (or never) comes first.

import { BONUS_WORKOUTS, workoutForWeekday } from './plan.js';
import * as store from './store.js';

function neighbours(date) {
  const wd = store.parseDateKey(date).getDay();
  return { yesterday: workoutForWeekday((wd + 6) % 7), tomorrow: workoutForWeekday((wd + 1) % 7) };
}

// Date each bonus workout was last done, before `date`.
function lastDone(date) {
  const out = {};
  for (const [day, parts] of Object.entries(store.activityByDate(BONUS_WORKOUTS))) {
    if (day >= date) continue;
    for (const p of parts) if (!out[p.id] || day > out[p.id]) out[p.id] = day;
  }
  return out;
}

// Bonus workouts that fit this day, best pick first.
export function bonusOptions(date) {
  const { yesterday, tomorrow } = neighbours(date);
  const busy = new Set([...(yesterday?.muscles || []), ...(tomorrow?.muscles || [])]);
  const fits = BONUS_WORKOUTS.filter((b) => !b.muscles.some((m) => busy.has(m)));
  const last = lastDone(date);
  // Never done ('') sorts first; the sort is stable, so ties keep plan order.
  return (fits.length ? fits : BONUS_WORKOUTS).slice().sort((a, b) => (last[a.id] || '').localeCompare(last[b.id] || ''));
}

// The app's pick, or with `current` the next option after it (for "Swap").
export function pickBonus(date, current = null) {
  const options = bonusOptions(date);
  if (!current) return options[0];
  const i = options.findIndex((o) => o.id === current);
  return options[(i + 1) % options.length];
}

// "Your plan doesn't train legs, so tomorrow's Shoulders + Chest + Lats still gets fresh muscles."
export function bonusReason(bonus, date) {
  const { tomorrow } = neighbours(date);
  const last = lastDone(date)[bonus.id];
  const why = tomorrow
    ? `Your plan doesn't train ${bonus.focus}, so tomorrow's ${tomorrow.title} still gets fresh muscles.`
    : `Your plan doesn't train ${bonus.focus}, so it won't eat into your recovery.`;
  const ago = last ? store.daysBetween(last, date) : 0;
  const when = last ? ` Last done ${ago === 1 ? 'yesterday' : `${ago} days ago`}.` : ' First time — go a bit lighter than you think.';
  return why + when;
}
