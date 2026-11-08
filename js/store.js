// Small JSON state in localStorage: set check-offs, lifting weights, body weight,
// goals, settings.

const KEYS = {
  log: 'wo.log', // { [date]: { [workoutId]: { [exerciseIndex]: [bool, ...] } } }
  weights: 'wo.weights', // { [exerciseId]: { [date]: "22.5" } }
  body: 'wo.body', // { [date]: 82.4 } — morning body weight in kg
  goals: 'wo.goals', // { body: Goal | null, exercises: { [exerciseId]: Goal } }
  bonus: 'wo.bonus', // { [date]: bonusWorkoutId } — rest days swapped for a bonus workout
  push: 'wo.push', // this device's notification keys + subscription (not backed up)
  settings: 'wo.settings',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Could not save', key, err);
  }
}

// --- Dates (local time, YYYY-MM-DD) --------------------------------------

export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daysBetween(a, b) {
  return Math.round((parseDateKey(b) - parseDateKey(a)) / 86400000);
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

// Monday of the week containing `key`.
export function mondayOf(key) {
  return addDays(key, -((parseDateKey(key).getDay() + 6) % 7));
}

// unit: 'days' | 'weeks' | 'months'
export function addPeriod(key, amount, unit) {
  if (unit === 'weeks') return addDays(key, amount * 7);
  if (unit === 'days') return addDays(key, amount);
  const d = parseDateKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + amount);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return dateKey(d);
}

// --- Sets ----------------------------------------------------------------

export function getSets(date, workout) {
  const entry = read(KEYS.log, {})[date]?.[workout.id] || {};
  return workout.exercises.map((ex, i) => {
    const saved = entry[i] || [];
    return Array.from({ length: ex.sets }, (_, s) => !!saved[s]);
  });
}

export function setDone(date, workout, exIndex, setIndex, done) {
  const log = read(KEYS.log, {});
  const day = (log[date] ||= {});
  const entry = (day[workout.id] ||= {});
  const sets = (entry[exIndex] ||= []);
  sets[setIndex] = done;
  write(KEYS.log, log);
}

function countSets(entry = {}, workout) {
  let done = 0;
  let total = 0;
  workout.exercises.forEach((ex, i) => {
    total += ex.sets;
    const saved = entry[i] || [];
    for (let s = 0; s < ex.sets; s++) if (saved[s]) done++;
  });
  return { done, total };
}

// Forget every checked set of one workout on one day.
export function clearWorkout(date, workoutId) {
  const log = read(KEYS.log, {});
  if (!log[date]?.[workoutId]) return;
  delete log[date][workoutId];
  if (!Object.keys(log[date]).length) delete log[date];
  write(KEYS.log, log);
}

export function progress(date, workout) {
  return countSets(read(KEYS.log, {})[date]?.[workout.id], workout);
}

// 'done' | 'partial' | null for a date, across all workouts logged that day.
export function dayStatus(date, workouts) {
  const day = read(KEYS.log, {})[date];
  if (!day) return null;
  let status = null;
  for (const w of workouts) {
    if (!day[w.id]) continue;
    const { done, total } = countSets(day[w.id], w);
    if (done === total) return 'done';
    if (done > 0) status = 'partial';
  }
  return status;
}

// --- Streak & day states ------------------------------------------------------

// A workout day keeps the streak when at least this share of a workout's sets is done.
export const STREAK_SHARE = 0.5;

// Classifies every day for the heatmap and streak:
//   'done' | 'most' (≥ half) | 'some' (< half) — sets were logged
//   'rest'    planned rest day, nothing logged
//   'missed'  planned workout day that passed without enough sets
//   'pending' today is a workout day that isn't done yet
//   'none'    before you started tracking
export function trainingDays(workouts) {
  const activity = activityByDate(workouts);
  const start = Object.keys(activity).sort()[0] || null;
  const today = dateKey();
  const plannedDays = new Set(workouts.filter((w) => w.weekday != null).map((w) => w.weekday));
  const isWorkoutDay = (date) => plannedDays.has(parseDateKey(date).getDay());

  function state(date) {
    const parts = activity[date];
    if (parts) {
      const best = Math.max(...parts.map((p) => p.done / p.total));
      if (best >= 1) return 'done';
      if (best >= STREAK_SHARE) return 'most';
      return date === today && isWorkoutDay(date) ? 'pending' : 'some';
    }
    if (!start || date < start) return 'none';
    if (!isWorkoutDay(date)) return 'rest';
    return date === today ? 'pending' : 'missed';
  }

  // Rest days always count; workout days need at least half a workout.
  const counts = (date) => {
    if (!start || date < start) return false;
    if (!isWorkoutDay(date)) return true;
    const st = state(date);
    return st === 'done' || st === 'most';
  };

  function streak() {
    if (!start) return { current: 0, best: 0, todayCounts: false, pendingToday: isWorkoutDay(today) };
    const todayCounts = counts(today);
    let current = 0;
    // Today can't break the streak until it's over.
    for (let d = todayCounts ? today : addDays(today, -1); d >= start && counts(d); d = addDays(d, -1)) current++;
    let best = 0;
    let run = 0;
    for (let d = start; d < today; d = addDays(d, 1)) {
      run = counts(d) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return { current, best: Math.max(best, current), todayCounts, pendingToday: !todayCounts && isWorkoutDay(today) };
  }

  return { activity, start, today, state, counts, streak, isWorkoutDay };
}

// Every day with at least one checked set: { [date]: [{ id, done, total }, ...] }
export function activityByDate(workouts) {
  const out = {};
  for (const [date, day] of Object.entries(read(KEYS.log, {}))) {
    const parts = workouts
      .filter((w) => day[w.id])
      .map((w) => ({ id: w.id, ...countSets(day[w.id], w) }))
      .filter((p) => p.done > 0);
    if (parts.length) out[date] = parts;
  }
  return out;
}

// --- Weights -------------------------------------------------------------

export function getWeight(exerciseId, date) {
  return read(KEYS.weights, {})[exerciseId]?.[date] || '';
}

export function setWeight(exerciseId, date, value) {
  const weights = read(KEYS.weights, {});
  const ex = (weights[exerciseId] ||= {});
  if (value === '') delete ex[date];
  else ex[date] = value;
  write(KEYS.weights, weights);
}

// Most recent weight logged before `date`.
export function lastWeight(exerciseId, date) {
  const ex = read(KEYS.weights, {})[exerciseId] || {};
  const prev = Object.keys(ex).filter((d) => d < date && ex[d] !== '').sort().pop();
  return prev ? { date: prev, value: ex[prev] } : null;
}

// Every logged weight for an exercise, oldest first: [{ date, kg }].
// For bodyweight exercises this is the extra weight (0 = bodyweight only).
export function exerciseHistory(exerciseId) {
  const ex = read(KEYS.weights, {})[exerciseId] || {};
  return Object.keys(ex)
    .sort()
    .map((date) => ({ date, kg: Number(ex[date]) }))
    .filter((e) => ex[e.date] !== '' && Number.isFinite(e.kg) && e.kg >= 0);
}

// Heaviest weight (earliest date on ties), optionally only before `beforeDate`.
export function exerciseBest(exerciseId, beforeDate = null) {
  let best = null;
  for (const e of exerciseHistory(exerciseId)) {
    if (beforeDate && e.date >= beforeDate) break;
    if (!best || e.kg > best.kg) best = e;
  }
  return best;
}

// The entries that set a new best, oldest first.
export function exerciseRecords(exerciseId) {
  const out = [];
  for (const e of exerciseHistory(exerciseId)) {
    if (!out.length || e.kg > out[out.length - 1].kg) out.push(e);
  }
  return out;
}

// --- Body weight -------------------------------------------------------------

// All weigh-ins, oldest first: [{ date, kg }]
export function getBodyWeights() {
  return Object.entries(read(KEYS.body, {}))
    .map(([date, kg]) => ({ date, kg: Number(kg) }))
    .filter((e) => e.kg > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// kg = null removes the entry for that date.
export function setBodyWeight(date, kg) {
  const body = read(KEYS.body, {});
  if (kg == null) delete body[date];
  else body[date] = kg;
  write(KEYS.body, body);
}

// "82,4" / "82.4" → 82.4, or null if it isn't a plausible body weight.
export function parseKg(str) {
  const n = Number(String(str).replace(',', '.').trim());
  return str !== '' && Number.isFinite(n) && n >= 20 && n <= 400 ? Math.round(n * 100) / 100 : null;
}

export function formatKg(n) {
  return Math.abs(n * 10 - Math.round(n * 10)) < 1e-6 ? n.toFixed(1) : n.toFixed(2);
}

// Lifting weights: drop a trailing ".0" (22.5 → "22.5", 20 → "20").
export function formatLift(n) {
  return String(Math.round(n * 100) / 100);
}

// Body weight on a date: that morning's weigh-in, else the latest one before it,
// else the earliest one there is.
export function bodyWeightOn(date) {
  const entries = getBodyWeights();
  let found = null;
  for (const e of entries) {
    if (e.date > date) break;
    found = e;
  }
  return found || entries[0] || null;
}

// --- Goals -----------------------------------------------------------------
// Goal: { targetKg, startKg, startDate, targetDate (null = no deadline) }

export function getGoals() {
  const goals = read(KEYS.goals, {});
  return { body: goals.body || null, exercises: goals.exercises || {} };
}

export function setBodyGoal(goal) {
  write(KEYS.goals, { ...getGoals(), body: goal });
}

export function setExerciseGoal(exerciseId, goal) {
  const goals = getGoals();
  if (goal) goals.exercises[exerciseId] = goal;
  else delete goals.exercises[exerciseId];
  write(KEYS.goals, goals);
}

// --- Rest-day bonus workouts ------------------------------------------------

export function getBonus(date) {
  return read(KEYS.bonus, {})[date] || null;
}

export function setBonus(date, workoutId) {
  const bonus = read(KEYS.bonus, {});
  if (workoutId) bonus[date] = workoutId;
  else delete bonus[date];
  write(KEYS.bonus, bonus);
}

// --- Notifications (this device only) ---------------------------------------

export function getPush() {
  return read(KEYS.push, null);
}

export function setPush(value) {
  write(KEYS.push, value);
}

// --- Settings ------------------------------------------------------------

const DEFAULT_SETTINGS = {
  timer: 5,
  facing: 'user',
  overlay: 'ghost',
  hideInstallTip: false,
  // Reminder hours (local time), null = off.
  reminders: { weighIn: 7, workout: 16, streak: 20, weekly: 19 },
};

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}

export function updateSettings(patch) {
  write(KEYS.settings, { ...getSettings(), ...patch });
}

// --- Backup helpers ------------------------------------------------------

export function exportState() {
  return { log: read(KEYS.log, {}), weights: read(KEYS.weights, {}), body: read(KEYS.body, {}), goals: getGoals(), bonus: read(KEYS.bonus, {}) };
}

// Merge imported state into what's already here (imported values win).
export function importState({ log = {}, weights = {}, body = {}, goals = null, bonus = {} }) {
  write(KEYS.body, { ...read(KEYS.body, {}), ...body });
  write(KEYS.bonus, { ...read(KEYS.bonus, {}), ...bonus });
  if (goals) {
    const cur = getGoals();
    write(KEYS.goals, { body: goals.body || cur.body, exercises: { ...cur.exercises, ...goals.exercises } });
  }

  const curLog = read(KEYS.log, {});
  for (const [date, workouts] of Object.entries(log)) {
    curLog[date] = { ...curLog[date], ...workouts };
  }
  write(KEYS.log, curLog);

  const curWeights = read(KEYS.weights, {});
  for (const [ex, dates] of Object.entries(weights)) {
    curWeights[ex] = { ...curWeights[ex], ...dates };
  }
  write(KEYS.weights, curWeights);
}
