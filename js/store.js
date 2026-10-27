// Small JSON state in localStorage: set check-offs, weights, settings.

const KEYS = {
  log: 'wo.log', // { [date]: { [workoutId]: { [exerciseIndex]: [bool, ...] } } }
  weights: 'wo.weights', // { [exerciseId]: { [date]: "22.5" } }
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

export function progress(date, workout) {
  const sets = getSets(date, workout).flat();
  return { done: sets.filter(Boolean).length, total: sets.length };
}

// 'done' | 'partial' | null for a date, across all workouts logged that day.
export function dayStatus(date, workouts) {
  const day = read(KEYS.log, {})[date];
  if (!day) return null;
  let status = null;
  for (const w of workouts) {
    if (!day[w.id]) continue;
    const { done, total } = progress(date, w);
    if (done === total) return 'done';
    if (done > 0) status = 'partial';
  }
  return status;
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
  return { log: read(KEYS.log, {}), weights: read(KEYS.weights, {}) };
}

// Merge imported state into what's already here (imported values win).
export function importState({ log = {}, weights = {} }) {
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
