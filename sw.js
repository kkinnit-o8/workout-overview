// Offline support. Serves the app from cache instantly and refreshes the
// cache in the background, so edits pushed to GitHub show up on the next launch.
// Also shows the reminder notifications sent by .github/workflows/reminders.yml.

const CACHE = 'workout-v3';
const DATA_CACHE = 'workout-data'; // small summary written by the app (js/notify.js)
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/camera.js',
  './js/chart.js',
  './js/db.js',
  './js/exercises.js',
  './js/goals.js',
  './js/library.js',
  './js/notify.js',
  './js/plan.js',
  './js/poses.js',
  './js/settings.js',
  './js/stats.js',
  './js/store.js',
  './js/ui.js',
  './js/weight.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the HTTP cache so a new version never precaches stale files.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = request.mode === 'navigate' ? './index.html' : request;
      const cached = await cache.match(key, { ignoreSearch: true });
      const network = fetch(request)
        .then((res) => {
          if (res.ok && !res.redirected) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network;
    }),
  );
});

// --- Reminders -----------------------------------------------------------------
// Payload: { type, title, body, alt?: { title, body } }. `alt` is used when the app
// says today's weigh-in / workout is already done. "[...]" parts are kept only
// when the current streak is known, with {streak} filled in.

function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function readSummary() {
  try {
    const res = await (await caches.open(DATA_CACHE)).match('./__summary.json');
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

function fill(text = '', streak) {
  return text.replace(/\[([^\]]*)\]/g, (_, inner) => (streak ? inner.replace('{streak}', streak) : '')).trim();
}

self.addEventListener('push', (event) => {
  let msg;
  try {
    msg = event.data.json();
  } catch {
    msg = { title: 'Workout', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      const summary = await readSummary();
      // Nothing gets logged without opening the app, so an old summary means "not done yet".
      const today = summary && summary.date === localDateKey() ? summary : { weighedIn: false, workoutDone: false, streak: null };
      let { title, body } = msg;
      const done = (msg.type === 'weighIn' && today.weighedIn) || ((msg.type === 'workout' || msg.type === 'streak') && today.workoutDone);
      if (done && msg.alt) ({ title, body } = msg.alt);
      await self.registration.showNotification(fill(title, today.streak), {
        body: fill(body, today.streak),
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: msg.type || 'reminder',
        data: { url: msg.url || './' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
