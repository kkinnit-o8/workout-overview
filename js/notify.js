// Reminder notifications.
//
// A web app can't schedule its own notifications, so a GitHub Actions workflow
// (.github/workflows/reminders.yml) sends them as Web Push at your chosen hours.
// This module creates the push keys + subscription on this phone and builds the
// one-line "setup code" you paste into the repo as the PUSH_CONFIG secret.
// It also leaves a small summary for the service worker, so a reminder can say
// "already done" instead of nagging.

import { ALL_WORKOUTS } from './plan.js';
import * as store from './store.js';
import { esc, icon, toast } from './ui.js';

const SUMMARY_CACHE = 'workout-data';
const REMINDERS = [
  { key: 'weighIn', label: 'Morning weigh-in', hint: 'every morning', hours: [5, 6, 7, 8, 9, 10, 11] },
  { key: 'workout', label: "Today's workout", hint: 'workout days', hours: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] },
  { key: 'streak', label: 'Streak check', hint: "evening, says if today's still open", hours: [17, 18, 19, 20, 21, 22] },
  { key: 'weekly', label: 'Week ahead', hint: 'Sundays', hours: [8, 10, 12, 16, 18, 19, 20, 21] },
];

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function pushSupport() {
  const apis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !standalone()) return { ok: false, why: 'On iPhone, notifications only work in the installed app: Share → Add to Home Screen, then open it from there (iOS 16.4 or newer).' };
  if (!apis) return { ok: false, why: 'This browser doesn’t support web notifications.' };
  if (Notification.permission === 'denied') return { ok: false, why: 'Notifications are blocked for this app. Allow them in your phone’s settings, then come back.' };
  return { ok: true };
}

// VAPID keys, made once on this phone and kept with the subscription.
async function vapidKeys() {
  const saved = store.getPush()?.vapid;
  if (saved) return saved;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = b64url(await crypto.subtle.exportKey('raw', pair.publicKey));
  const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
  return { publicKey, privateKey };
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications weren’t allowed.');
  const reg = await navigator.serviceWorker.ready;
  const vapid = await vapidKeys();
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey && b64url(sub.options.applicationServerKey) !== vapid.publicKey) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(vapid.publicKey) });
  store.setPush({ ...store.getPush(), vapid, subscription: sub.toJSON() });
  await updateNotifySummary();
  return sub;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  await (await reg.pushManager.getSubscription())?.unsubscribe();
  store.setPush(null);
}

// The JSON you paste into GitHub as the PUSH_CONFIG secret.
export function setupCode() {
  const push = store.getPush();
  if (!push?.subscription) return null;
  return JSON.stringify({
    v: 1,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    subject: new URL('./', location.href).href,
    reminders: store.getSettings().reminders,
    vapid: push.vapid,
    subscription: push.subscription,
  });
}

// Links into this repo, worked out from the GitHub Pages address.
function repoUrl() {
  const owner = location.hostname.match(/^([^.]+)\.github\.io$/)?.[1];
  const repo = location.pathname.split('/')[1];
  return owner && repo ? `https://github.com/${owner}/${repo}` : null;
}

export async function updateNotifySummary() {
  if (!store.getPush() || !('caches' in window)) return;
  try {
    const today = store.dateKey();
    const days = store.trainingDays(ALL_WORKOUTS);
    const s = days.streak();
    const summary = {
      date: today,
      streak: s.current,
      workoutDone: days.isWorkoutDay(today) && !s.pendingToday,
      weighedIn: store.getBodyWeights().some((e) => e.date === today),
    };
    const cache = await caches.open(SUMMARY_CACHE);
    await cache.put('./__summary.json', new Response(JSON.stringify(summary), { headers: { 'content-type': 'application/json' } }));
  } catch (err) {
    console.warn('Could not save notification summary', err);
  }
}

// --- Settings section --------------------------------------------------------------

function hourLabel(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

export function renderNotifySection(section) {
  const reminders = store.getSettings().reminders;
  const push = store.getPush();
  const support = pushSupport();
  const code = setupCode();
  const repo = repoUrl();
  const stale = push?.copiedCode && code && push.copiedCode !== code;

  const rows = REMINDERS.map(
    (r) => `<label class="set-row reminder-row">
      <span>${esc(r.label)}<small>${esc(r.hint)}</small></span>
      <select data-reminder="${r.key}" aria-label="${esc(r.label)} time">
        <option value="">Off</option>
        ${r.hours.map((h) => `<option value="${h}" ${reminders[r.key] === h ? 'selected' : ''}>${hourLabel(h)}</option>`).join('')}
      </select>
    </label>`,
  ).join('');

  let steps;
  if (!push) {
    steps = support.ok
      ? `<button class="btn btn-primary btn-block" data-n="enable">${icon('bell')} Turn on notifications</button>`
      : `<p class="hint warn">${icon('alert')} ${esc(support.why)}</p>`;
  } else {
    steps = `
      <ol class="setup-steps">
        <li class="done"><strong>Allowed on this phone</strong> <button class="link-btn" data-n="test">Show a test</button></li>
        <li class="${push.copiedCode && !stale ? 'done' : ''}">
          <strong>Copy your setup code</strong>
          <button class="btn btn-ghost btn-sm" data-n="copy">${icon('copy')} Copy setup code</button>
          ${stale ? `<span class="hint warn">${icon('alert')} You changed the times — copy the new code and update the secret.</span>` : ''}
        </li>
        <li>
          <strong>Paste it into GitHub</strong> as a secret named <code>PUSH_CONFIG</code>.
          ${repo ? `<a class="link-btn" href="${repo}/settings/secrets/actions/new" target="_blank" rel="noopener">Open GitHub secrets ↗</a>` : '<span class="hint">Repo → Settings → Secrets and variables → Actions → New repository secret.</span>'}
        </li>
        <li>
          <strong>Send a test from GitHub</strong>: Actions → Reminders → Run workflow.
          ${repo ? `<a class="link-btn" href="${repo}/actions/workflows/reminders.yml" target="_blank" rel="noopener">Open Actions ↗</a>` : ''}
        </li>
      </ol>
      <p class="hint">Reminders come from GitHub on the hour you pick (sometimes up to ~15 min late). The setup code holds this phone’s private notification key — only paste it into your repo’s secrets.</p>
      <button class="link-btn danger" data-n="disable">Turn off notifications</button>`;
  }

  section.innerHTML = `
    <h3>Notifications</h3>
    ${rows}
    ${steps}`;

  if (section.dataset.bound) return;
  section.dataset.bound = '1';

  section.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-reminder]');
    if (!sel) return;
    const next = { ...store.getSettings().reminders, [sel.dataset.reminder]: sel.value === '' ? null : Number(sel.value) };
    store.updateSettings({ reminders: next });
    renderNotifySection(section);
  });

  section.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-n]')?.dataset.n;
    if (!act) return;
    try {
      if (act === 'enable') {
        e.target.closest('button').disabled = true;
        await enablePush();
        toast('Notifications allowed — now copy the setup code');
      } else if (act === 'test') {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification('Notifications work ✅', {
          body: 'This is how your reminders will look.',
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          tag: 'test',
        });
      } else if (act === 'copy') {
        const value = setupCode();
        await copyText(value);
        store.setPush({ ...store.getPush(), copiedCode: value });
        toast('Setup code copied');
      } else if (act === 'disable') {
        if (!confirm('Turn off notifications on this phone?')) return;
        await disablePush();
        toast('Notifications turned off');
      }
    } catch (err) {
      console.error(err);
      alert(err.message || 'Something went wrong.');
    }
    renderNotifySection(section);
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for browsers without clipboard access.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
