import { WORKOUTS, REST_DAY_POSES, DAY_NAMES, workoutForWeekday } from './plan.js';
import { POSES } from './poses.js';
import * as store from './store.js';
import { listPhotos, thumbUrl } from './db.js';
import { openPhotoSession } from './camera.js';
import { renderProgress } from './library.js';
import { openSettings, isStandalone } from './settings.js';
import { esc, icon, toast, formatDate, vibrate } from './ui.js';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const views = {
  today: document.getElementById('view-today'),
  progress: document.getElementById('view-progress'),
};

const state = {
  date: store.dateKey(),
  weekday: new Date().getDay(), // which plan day is shown on the Today tab
};

// --- Tabs ------------------------------------------------------------------

function currentTab() {
  return location.hash === '#progress' ? 'progress' : 'today';
}

function showTab() {
  const tab = currentTab();
  for (const [name, el] of Object.entries(views)) el.hidden = name !== tab;
  document.querySelectorAll('.tabbar [data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  });
  if (tab === 'today') renderToday();
  else renderProgress(views.progress, { onSettings: settings });
  window.scrollTo(0, 0);
}

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  const hash = btn.dataset.tab === 'today' ? '#today' : '#progress';
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
      <button class="icon-btn" data-action="settings" aria-label="Settings">${icon('settings')}</button>
    </header>
    <nav class="week-strip" aria-label="Week">${strip}</nav>
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
      return `<li class="ex ${allDone ? 'done' : ''}" data-ex="${i}">
        <div class="ex-head">
          <div class="ex-num">${allDone ? icon('check') : i + 1}</div>
          <div class="ex-title">
            <h3>${esc(ex.name)}</h3>
            <div class="ex-meta">${ex.sets} sets × ${esc(ex.reps)} reps</div>
          </div>
          <label class="ex-weight">
            <input type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off"
              data-weight="${esc(ex.id)}" value="${esc(weight)}"
              placeholder="${last ? esc(last.value) : ex.bodyweight ? 'BW' : '–'}"
              aria-label="Weight for ${esc(ex.name)} (${unit})">
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
        ${last ? `<div class="ex-last">Last time: ${esc(last.value)} ${unit} · ${esc(formatDate(store.parseDateKey(last.date), { day: 'numeric', month: 'short' }))}</div>` : ''}
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
    </div>
    <ol class="exercises">${items}</ol>
    <section class="photo-card" id="photo-card"></section>
  `;
}

function restHTML(weekday) {
  const next = nextWorkout(weekday);
  return `
    <div class="rest-card">
      <div class="rest-icon">${icon('moon')}</div>
      <h2>Recovery day</h2>
      <p>Muscles grow while you rest. Eat well, sleep well.</p>
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
  const input = e.target.closest('[data-weight]');
  if (!input) return;
  const clean = input.value.replace(',', '.').replace(/[^\d.]/g, '');
  store.setWeight(input.dataset.weight, state.date, clean);
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
