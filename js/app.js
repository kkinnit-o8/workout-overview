import { WORKOUTS, REST_DAY_POSES, DAY_NAMES, workoutForWeekday } from './plan.js';
import { POSES } from './poses.js';
import * as store from './store.js';
import { listPhotos, thumbUrl } from './db.js';
import { openPhotoSession } from './camera.js';
import { renderProgress } from './library.js';
import { renderStats } from './stats.js';
import { bodyGoalStatus } from './weight.js';
import { exerciseById, exerciseGoalStatus, formatLoad } from './exercises.js';
import { updateNotifySummary } from './notify.js';
import { openSettings, isStandalone } from './settings.js';
import { esc, icon, toast, formatDate, vibrate } from './ui.js';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const views = {
  today: document.getElementById('view-today'),
  progress: document.getElementById('view-progress'),
  stats: document.getElementById('view-stats'),
};

const state = {
  date: store.dateKey(),
  weekday: new Date().getDay(), // which plan day is shown on the Today tab
};

// --- Tabs ------------------------------------------------------------------

function currentTab() {
  const tab = location.hash.slice(1);
  return tab in views ? tab : 'today';
}

function showTab() {
  const tab = currentTab();
  for (const [name, el] of Object.entries(views)) el.hidden = name !== tab;
  document.querySelectorAll('.tabbar [data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  });
  if (tab === 'today') renderToday();
  else if (tab === 'progress') renderProgress(views.progress, { onSettings: settings });
  else renderStats(views.stats, { onSettings: settings });
  window.scrollTo(0, 0);
}

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  const hash = `#${btn.dataset.tab}`;
  if (location.hash === hash) showTab();
  else location.hash = hash;
});
window.addEventListener('hashchange', showTab);

function settings() {
  openSettings({ onChange: showTab });
}

// --- Today -----------------------------------------------------------------

function weekDates() {
  // Dates (Mon → Sun) of the current week.
  const today = store.parseDateKey(state.date);
  const offset = (today.getDay() + 6) % 7;
  return WEEK_ORDER.map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - offset + i);
    return d;
  });
}

function nextWorkout(fromWeekday) {
  for (let i = 1; i <= 7; i++) {
    const w = workoutForWeekday((fromWeekday + i) % 7);
    if (w) return w;
  }
  return null;
}

async function renderToday() {
  const el = views.today;
  const now = store.parseDateKey(state.date);
  const todayWeekday = now.getDay();
  const workout = workoutForWeekday(state.weekday);
  const isOtherDay = state.weekday !== todayWeekday;

  const strip = weekDates()
    .map((d) => {
      const wd = d.getDay();
      const w = workoutForWeekday(wd);
      const status = store.dayStatus(store.dateKey(d), WORKOUTS);
      const cls = [
        'day',
        w ? 'has-workout' : 'rest',
        wd === todayWeekday ? 'today' : '',
        wd === state.weekday ? 'selected' : '',
        status ? `status-${status}` : '',
      ].join(' ');
      return `<button class="${cls}" data-weekday="${wd}" aria-label="${DAY_NAMES[wd]}${w ? `: ${esc(w.title)}` : ': rest'}">
        <span class="day-letter">${DAY_NAMES[wd].slice(0, 3)}</span>
        <span class="day-date">${d.getDate()}</span>
        <span class="day-dot"></span>
      </button>`;
    })
    .join('');

  el.innerHTML = `
    ${installTip()}
    <header class="page-head">
      <div>
        <div class="eyebrow">${esc(formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
        <h1>${workout ? esc(workout.title) : 'Rest day'}</h1>
      </div>
      <div class="head-actions">
        <a class="streak-chip" id="streak-chip" href="#stats"></a>
        <button class="icon-btn" data-action="settings" aria-label="Settings">${icon('settings')}</button>
      </div>
    </header>
    <nav class="week-strip" aria-label="Week">${strip}</nav>
    <div id="weigh-slot">${weighInHTML()}</div>
    ${
      isOtherDay
        ? `<div class="note">
            <span>Showing <strong>${DAY_NAMES[state.weekday]}</strong>${workout ? ' — sets you check are logged for today.' : '.'}</span>
            <button class="link-btn" data-action="back-today">Back to today</button>
          </div>`
        : ''
    }
    <div class="today-body">${workout ? workoutHTML(workout) : restHTML(state.weekday)}</div>
  `;

  renderPhotoCard(workout);
  renderStreak();
  updateNotifySummary();
}

// --- Streak ------------------------------------------------------------------

const MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365];

function renderStreak() {
  const s = store.trainingDays(WORKOUTS).streak();
  const chip = views.today.querySelector('#streak-chip');
  if (chip) {
    chip.className = `streak-chip ${s.pendingToday ? 'pending' : ''}`;
    chip.innerHTML = `${icon('flame')}<strong>${s.current}</strong>`;
    chip.setAttribute('aria-label', `${s.current}-day streak${s.pendingToday ? ', today not done yet' : ''}. Open stats.`);
  }
  const line = views.today.querySelector('#streak-line');
  if (line) {
    const workout = workoutForWeekday(state.weekday);
    const todayIsWorkout = !!workoutForWeekday(store.parseDateKey(state.date).getDay());
    if (!todayIsWorkout) {
      line.innerHTML = `${icon('flame')}<span>Rest days count — your streak is <strong>${s.current} day${s.current === 1 ? '' : 's'}</strong>.</span>`;
    } else if (s.pendingToday && workout) {
      const { done, total } = store.progress(state.date, workout);
      const need = Math.max(1, Math.ceil(total * store.STREAK_SHARE) - done);
      line.innerHTML = `${icon('flame')}<span>${need} more set${need === 1 ? '' : 's'} to ${s.current ? `keep your <strong>${s.current}-day streak</strong>` : 'start a streak'}.</span>`;
    } else if (!s.pendingToday) {
      line.innerHTML = `${icon('flame')}<span>Streak secured: <strong>${s.current} day${s.current === 1 ? '' : 's'}</strong>.</span>`;
    } else {
      line.innerHTML = '';
    }
    line.classList.toggle('kept', !s.pendingToday);
  }
  return s;
}

function workoutHTML(workout) {
  const sets = store.getSets(state.date, workout);
  const { done, total } = store.progress(state.date, workout);
  const items = workout.exercises
    .map((ex, i) => {
      const exSets = sets[i];
      const allDone = exSets.every(Boolean);
      const weight = store.getWeight(ex.id, state.date);
      const last = store.lastWeight(ex.id, state.date);
      const unit = ex.bodyweight ? '+kg' : 'kg';
      const best = store.exerciseBest(ex.id, state.date);
      const isRecord = weight !== '' && best && Number(weight) > best.kg;
      return `<li class="ex ${allDone ? 'done' : ''} ${isRecord ? 'record' : ''}" data-ex="${i}" data-exercise="${esc(ex.id)}">
        <div class="ex-head">
          <div class="ex-num">${allDone ? icon('check') : i + 1}</div>
          <div class="ex-title">
            <h3>${esc(ex.name)}</h3>
            <div class="ex-meta">${ex.sets} sets × ${esc(ex.reps)} reps</div>
          </div>
          <label class="ex-weight">
            <input type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off"
              data-weight="${esc(ex.id)}" value="${esc(weight)}"
              placeholder="${last ? esc(last.value) : ex.bodyweight ? '0' : '–'}"
              aria-label="${ex.bodyweight ? `Extra weight for ${esc(ex.name)} in kg, on top of your body weight` : `Weight for ${esc(ex.name)} in kg`}">
            <span>${unit}</span>
          </label>
        </div>
        <div class="sets">
          ${exSets
            .map(
              (d, s) => `<button class="set ${d ? 'done' : ''}" data-set="${s}" aria-pressed="${d}" aria-label="Set ${s + 1}">
                <span class="set-n">${s + 1}</span>${icon('check', 'set-check')}
              </button>`,
            )
            .join('')}
        </div>
        ${ex.bodyweight ? `<div class="ex-bw">${bodyweightLine(weight)}</div>` : ''}
        <div class="ex-last">${exerciseInfo(ex, last)}</div>
      </li>`;
    })
    .join('');

  return `
    <div class="progress-card ${done === total ? 'complete' : ''}">
      <div class="progress-top">
        <span class="progress-label">${done === total ? 'Workout complete 💪' : 'Sets done'}</span>
        <strong class="progress-count">${done} / ${total}</strong>
      </div>
      <div class="bar"><span style="width:${(done / total) * 100}%"></span></div>
      <p class="streak-line" id="streak-line"></p>
    </div>
    <ol class="exercises">${items}</ol>
    <section class="photo-card" id="photo-card"></section>
  `;
}

// "Last 20 kg · 27 Oct · Record 24 kg · Goal 30 kg"
function exerciseInfo(ex, last) {
  const bits = [];
  const fmt = (kg) => esc(formatLoad(ex, kg));
  if (last) bits.push(`Last ${fmt(Number(last.value))} · ${esc(formatDate(store.parseDateKey(last.date), { day: 'numeric', month: 'short' }))}`);
  const best = store.exerciseBest(ex.id, state.date);
  if (best && (!last || best.kg !== Number(last.value))) bits.push(`${icon('trophy')} Record ${fmt(best.kg)}`);
  const g = exerciseGoalStatus(ex.id);
  if (g && !g.reached) bits.push(`${icon('target')} Goal ${fmt(g.goal.targetKg)}`);
  if (g && g.reached) bits.push(`${icon('target')} Goal reached`);
  return bits.join('<span class="sep">·</span>');
}

// For pull-ups/dips: you only type the extra weight; the app adds your body weight.
function bodyweightLine(extraStr) {
  const bw = store.bodyWeightOn(state.date);
  const extra = Number(extraStr) || 0;
  if (!bw) return 'Write only the <strong>extra</strong> weight (leave empty or 0 for none). Log your morning weight to see the total.';
  return `Body ${store.formatKg(bw.kg)} kg + extra ${store.formatLift(extra)} kg = <strong>${store.formatKg(bw.kg + extra)} kg</strong> total`;
}

function restHTML(weekday) {
  const next = nextWorkout(weekday);
  return `
    <div class="rest-card">
      <div class="rest-icon">${icon('moon')}</div>
      <h2>Recovery day</h2>
      <p>Muscles grow while you rest. Eat well, sleep well.</p>
      <p class="streak-line kept" id="streak-line"></p>
      ${
        next
          ? `<button class="next-up" data-weekday="${next.weekday}">
              <span class="eyebrow">Next up · ${DAY_NAMES[next.weekday]}</span>
              <strong>${esc(next.title)}</strong>
              ${icon('right')}
            </button>`
          : ''
      }
    </div>
    <section class="photo-card" id="photo-card"></section>
  `;
}

async function renderPhotoCard(workout) {
  const card = views.today.querySelector('#photo-card');
  if (!card) return;
  const poses = workout ? workout.poses : REST_DAY_POSES;
  const todays = (await listPhotos()).filter((p) => p.date === state.date);
  const { done, total } = workout ? store.progress(state.date, workout) : { done: 0, total: 1 };
  const complete = workout && done === total;
  const poseNames = poses.map((p) => esc(POSES[p].name)).join(' · ');

  if (todays.length) {
    card.innerHTML = `
      <div class="photo-card-head">
        <div>
          <div class="eyebrow">Progress photos</div>
          <h2>${todays.length} taken today ${icon('check', 'inline-check')}</h2>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="photos">${icon('camera')} More</button>
      </div>
      <a class="photo-strip" href="#progress" aria-label="Open Progress">${todays.map((p) => `<img data-thumb="${p.id}" alt="${esc(POSES[p.pose]?.name || '')}">`).join('')}</a>
    `;
    for (const img of card.querySelectorAll('[data-thumb]')) {
      thumbUrl(img.dataset.thumb).then((url) => (img.src = url));
    }
  } else {
    card.innerHTML = `
      <button class="photo-cta ${complete ? 'pulse' : ''}" data-action="photos">
        <span class="photo-cta-icon">${icon('camera')}</span>
        <span class="photo-cta-text">
          <strong>${workout ? (complete ? 'Take your progress photos' : 'Finish with progress photos') : 'Progress check-in'}</strong>
          <small>${poseNames}</small>
        </span>
        ${icon('right')}
      </button>`;
  }
}

// --- Morning weigh-in ----------------------------------------------------------

function relDay(date) {
  const diff = store.daysBetween(date, state.date);
  if (diff === 1) return 'yesterday';
  return formatDate(store.parseDateKey(date), { weekday: 'short', day: 'numeric', month: 'short' });
}

function weighInHTML(editing = false) {
  const entries = store.getBodyWeights();
  const today = entries.find((e) => e.date === state.date);
  const prev = entries.filter((e) => e.date < state.date).pop();

  if (today && !editing) {
    const diff = prev ? Math.round((today.kg - prev.kg) * 10) / 10 : null;
    const diffText = diff == null ? '' : diff === 0 ? 'same as' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)} kg vs`;
    return `<div class="weigh-in logged">
      <span class="weigh-icon">${icon('scale')}</span>
      <div class="weigh-text">
        <span class="weigh-label">Morning weight</span>
        <small>${diff == null ? 'First weigh-in logged' : `${diffText} ${esc(relDay(prev.date))}`}${goalHint()}</small>
      </div>
      <strong class="weigh-value">${store.formatKg(today.kg)}<small> kg</small></strong>
      <button class="icon-btn sm" data-action="edit-weight" aria-label="Change today's weight">${icon('edit')}</button>
    </div>`;
  }

  return `<form class="weigh-in" data-weigh-form>
    <span class="weigh-icon">${icon('scale')}</span>
    <div class="weigh-text">
      <span class="weigh-label">Morning weight</span>
      <small>${prev ? `Last: ${store.formatKg(prev.kg)} kg · ${esc(relDay(prev.date))}` : 'Before breakfast, every day'}</small>
    </div>
    <label class="weigh-input">
      <input type="text" name="kg" inputmode="decimal" enterkeyhint="done" autocomplete="off"
        value="${today ? store.formatKg(today.kg) : ''}" placeholder="${prev ? store.formatKg(prev.kg) : '0.0'}"
        aria-label="This morning's weight in kg">
      <span>kg</span>
    </label>
    <button class="icon-btn weigh-save" type="submit" aria-label="Save weight">${icon('check')}</button>
  </form>`;
}

function goalHint() {
  const g = bodyGoalStatus();
  if (!g) return '';
  if (g.reached) return ' · goal reached 🎉';
  return ` · goal ${store.formatKg(g.goal.targetKg)} kg${g.status === 'on-track' ? ' ✓' : ''}`;
}

function renderWeighIn(editing = false) {
  const slot = views.today.querySelector('#weigh-slot');
  if (!slot) return;
  slot.innerHTML = weighInHTML(editing);
  if (editing) slot.querySelector('input')?.focus();
}

views.today.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-weigh-form]');
  if (!form) return;
  e.preventDefault();
  const input = form.kg;
  const kg = store.parseKg(input.value);
  if (kg == null) {
    if (input.value.trim() === '' && store.getBodyWeights().some((x) => x.date === state.date)) {
      renderWeighIn(); // left empty while editing: keep the saved value
      return;
    }
    input.classList.add('invalid');
    toast('Enter your weight in kg, e.g. 82.4');
    input.focus();
    return;
  }
  store.setBodyWeight(state.date, kg);
  vibrate(12);
  renderWeighIn();
  updateNotifySummary();
  // Total load on pull-ups/dips depends on today's body weight.
  views.today.querySelectorAll('.ex-bw').forEach((line) => {
    line.innerHTML = bodyweightLine(line.closest('.ex').querySelector('[data-weight]').value.replace(',', '.'));
  });
  toast(`Morning weight saved: ${store.formatKg(kg)} kg`);
});

function startPhotos() {
  const workout = workoutForWeekday(state.weekday);
  openPhotoSession({
    poses: workout ? workout.poses : REST_DAY_POSES,
    workoutId: workout ? workout.id : null,
    onClose: (saved) => {
      if (saved) toast(`${saved} photo${saved > 1 ? 's' : ''} saved to Progress`);
      if (currentTab() === 'today') renderPhotoCard(workout);
    },
  });
}

function toggleSet(btn) {
  const workout = workoutForWeekday(state.weekday);
  const li = btn.closest('.ex');
  const exIndex = Number(li.dataset.ex);
  const setIndex = Number(btn.dataset.set);
  const before = store.progress(state.date, workout);
  const done = !btn.classList.contains('done');

  store.setDone(state.date, workout, exIndex, setIndex, done);
  vibrate(done ? 12 : 6);

  // Update in place so the weight inputs keep focus/scroll.
  btn.classList.toggle('done', done);
  btn.setAttribute('aria-pressed', done);
  const exSets = store.getSets(state.date, workout)[exIndex];
  const exDone = exSets.every(Boolean);
  li.classList.toggle('done', exDone);
  li.querySelector('.ex-num').innerHTML = exDone ? icon('check') : exIndex + 1;

  const after = store.progress(state.date, workout);
  const streakBefore = Number(views.today.querySelector('#streak-chip strong')?.textContent || 0);
  const s = renderStreak();
  if (s.current > streakBefore && MILESTONES.includes(s.current)) {
    toast(`🔥 ${s.current}-day streak! Keep it going.`);
    vibrate([30, 50, 30, 50, 60]);
  }
  updateNotifySummary();
  const card = views.today.querySelector('.progress-card');
  card.classList.toggle('complete', after.done === after.total);
  card.querySelector('.progress-count').textContent = `${after.done} / ${after.total}`;
  card.querySelector('.progress-label').textContent = after.done === after.total ? 'Workout complete 💪' : 'Sets done';
  card.querySelector('.bar span').style.width = `${(after.done / after.total) * 100}%`;
  updateStripStatus();

  const justFinished = after.done === after.total && before.done !== before.total;
  if (justFinished || (before.done === before.total) !== (after.done === after.total)) {
    renderPhotoCard(workout).then(() => {
      if (justFinished) {
        vibrate([20, 60, 20]);
        views.today.querySelector('#photo-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
}

function updateStripStatus() {
  const btn = views.today.querySelector(`.week-strip .today`);
  if (!btn) return;
  btn.classList.remove('status-done', 'status-partial');
  const status = store.dayStatus(state.date, WORKOUTS);
  if (status) btn.classList.add(`status-${status}`);
}

views.today.addEventListener('click', (e) => {
  const set = e.target.closest('.set');
  if (set) {
    toggleSet(set);
    return;
  }
  const day = e.target.closest('[data-weekday]');
  if (day) {
    state.weekday = Number(day.dataset.weekday);
    renderToday();
    return;
  }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'photos') startPhotos();
  else if (action === 'settings') settings();
  else if (action === 'edit-weight') renderWeighIn(true);
  else if (action === 'back-today') {
    state.weekday = store.parseDateKey(state.date).getDay();
    renderToday();
  } else if (action === 'dismiss-tip') {
    store.updateSettings({ hideInstallTip: true });
    views.today.querySelector('.install-tip')?.remove();
  } else if (action === 'install') {
    deferredInstall?.prompt();
  }
});

views.today.addEventListener('input', (e) => {
  e.target.classList.remove('invalid');
  const input = e.target.closest('[data-weight]');
  if (!input) return;
  const clean = input.value.replace(',', '.').replace(/[^\d.]/g, '');
  store.setWeight(input.dataset.weight, state.date, clean);
  const bwLine = input.closest('.ex').querySelector('.ex-bw');
  if (bwLine) bwLine.innerHTML = bodyweightLine(clean);
});

// When a weight is committed, celebrate new records and reached goals.
views.today.addEventListener('change', (e) => {
  const input = e.target.closest('[data-weight]');
  if (!input) return;
  const id = input.dataset.weight;
  const li = input.closest('.ex');
  const value = Number(store.getWeight(id, state.date));
  const has = store.getWeight(id, state.date) !== '';
  const best = store.exerciseBest(id, state.date);
  const isRecord = has && best && value > best.kg;
  li.classList.toggle('record', !!isRecord);
  li.querySelector('.ex-last').innerHTML = exerciseInfo(exerciseById(id), store.lastWeight(id, state.date));
  if (!has) return;
  const ex = exerciseById(id);
  const goal = store.getGoals().exercises[id];
  if (goal && value >= goal.targetKg && (!best || best.kg < goal.targetKg)) {
    toast(`🎯 Goal reached: ${ex.name} ${formatLoad(ex, value)}!`);
    vibrate([30, 50, 30, 50, 60]);
  } else if (isRecord) {
    toast(`🏆 New record: ${ex.name} ${formatLoad(ex, value)} (was ${formatLoad(ex, best.kg)})`);
    vibrate([20, 40, 20]);
  }
});

views.today.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-weight]')) e.target.blur();
});

// --- Install tip -------------------------------------------------------------

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (currentTab() === 'today') renderToday();
});

function installTip() {
  if (isStandalone() || store.getSettings().hideInstallTip) return '';
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const how = deferredInstall
    ? `<button class="btn btn-primary btn-sm" data-action="install">Install</button>`
    : isIOS
      ? '<span>Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.</span>'
      : '<span>Use your browser menu → <strong>Install app</strong>.</span>';
  return `<div class="install-tip">
    <div><strong>Install the app</strong> so it works offline and your photos are kept safe. ${how}</div>
    <button class="icon-btn" data-action="dismiss-tip" aria-label="Dismiss">${icon('close')}</button>
  </div>`;
}

// --- Lifecycle ---------------------------------------------------------------

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const today = store.dateKey();
  if (today !== state.date) {
    state.date = today;
    state.weekday = new Date().getDay();
    if (currentTab() === 'today' && !document.body.classList.contains('modal-open')) renderToday();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

showTab();
