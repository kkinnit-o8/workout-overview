// Small JSON state in localStorage: set check-offs, lifting weights, body weight, settings.

const KEYS = {
  log: 'wo.log', // { [date]: { [workoutId]: { [exerciseIndex]: [bool, ...] } } }
  weights: 'wo.weights', // { [exerciseId]: { [date]: "22.5" } }
  body: 'wo.body', // { [date]: 82.4 } — morning body weight in kg
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
  const prev = Object.keys(ex).filter((d) => d < date).sort().pop();
  return prev ? { date: prev, value: ex[prev] } : null;
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

// --- Settings ------------------------------------------------------------

const DEFAULT_SETTINGS = { timer: 5, facing: 'user', overlay: 'ghost', hideInstallTip: false };

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}

export function updateSettings(patch) {
  write(KEYS.settings, { ...getSettings(), ...patch });
}

// --- Backup helpers ------------------------------------------------------

export function exportState() {
  return { log: read(KEYS.log, {}), weights: read(KEYS.weights, {}), body: read(KEYS.body, {}) };
}

// Merge imported state into what's already here (imported values win).
export function importState({ log = {}, weights = {}, body = {} }) {
  write(KEYS.body, { ...read(KEYS.body, {}), ...body });

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
