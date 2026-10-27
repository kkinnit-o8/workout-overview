// Progress tab: photo timeline, a full-screen viewer, and pose comparisons
// (side by side, before/after swipe, and a timelapse flipbook).

import { POSES, poseFigureSVG } from './poses.js';
import { workoutById } from './plan.js';
import { listPhotos, getPhoto, deletePhoto, thumbUrl, fullUrl, releaseFullUrls, forgetUrls, toBlob } from './db.js';
import { parseDateKey, daysBetween, dateKey } from './store.js';
import { esc, icon, toast, formatDate } from './ui.js';

const view = {
  mode: 'timeline', // 'timeline' | 'compare'
  pose: null,
  style: 'side', // 'side' | 'swipe' | 'timelapse'
  a: 0,
  b: 0,
  frame: 0,
};

let el = null;
let photos = [];
let firstDate = null;
let playTimer = null;
let thumbObserver = null;
let onSettings = null;

export async function renderProgress(container, opts = {}) {
  el = container;
  onSettings = opts.onSettings;
  stopPlayback();
  releaseFullUrls();
  if (!el.dataset.bound) {
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.addEventListener('pointerdown', onPointerDown);
    el.dataset.bound = '1';
  }

  photos = await listPhotos();
  firstDate = photos[0]?.date || null;
  const sessions = new Set(photos.map((p) => p.date)).size;

  const head = `
    <header class="page-head">
      <div>
        <div class="eyebrow">${photos.length ? `Day ${dayNumber(dateKey())} of your journey` : 'Your transformation'}</div>
        <h1>Progress</h1>
      </div>
      <button class="icon-btn" data-action="settings" aria-label="Settings">${icon('settings')}</button>
    </header>`;

  if (!photos.length) {
    el.innerHTML = `${head}
      <div class="empty">
        <div class="empty-figure">${poseFigureSVG('front-double-biceps')}</div>
        <h2>No photos yet</h2>
        <p>After each workout the app picks a few poses for you to photograph. They collect here, so you can watch your transformation over time.</p>
      </div>`;
    return;
  }

  el.innerHTML = `${head}
    <div class="stats">
      <div><strong>${photos.length}</strong><span>photos</span></div>
      <div><strong>${sessions}</strong><span>sessions</span></div>
      <div><strong>${daysBetween(firstDate, photos[photos.length - 1].date)}</strong><span>days tracked</span></div>
    </div>
    <div class="segmented" role="tablist">
      <button role="tab" data-mode="timeline" class="${view.mode === 'timeline' ? 'active' : ''}">${icon('grid')} Timeline</button>
      <button role="tab" data-mode="compare" class="${view.mode === 'compare' ? 'active' : ''}">${icon('compare')} Compare</button>
    </div>
    <div class="progress-body"></div>`;

  renderBody();
}

function renderBody() {
  stopPlayback();
  const body = el.querySelector('.progress-body');
  if (view.mode === 'timeline') renderTimeline(body);
  else renderCompare(body);
}

function dayNumber(date) {
  return daysBetween(firstDate, date) + 1;
}

function poseName(id) {
  return POSES[id]?.name || id;
}

// --- Timeline ----------------------------------------------------------------

function renderTimeline(body) {
  const byDate = new Map();
  for (const p of [...photos].reverse()) {
    if (!byDate.has(p.date)) byDate.set(p.date, []);
    byDate.get(p.date).push(p);
  }

  body.innerHTML = [...byDate]
    .map(([date, list]) => {
      const titles = [...new Set(list.map((p) => (p.workout ? workoutById(p.workout)?.title : 'Check-in')).filter(Boolean))];
      return `<section class="tl-group">
        <h3 class="tl-head">
          <span>${esc(formatDate(parseDateKey(date), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</span>
          <small>${esc(titles.join(' + '))} · Day ${dayNumber(date)}</small>
        </h3>
        <div class="tl-grid">
          ${list
            .sort((a, b) => a.ts - b.ts)
            .map(
              (p) => `<button class="tl-item" data-photo="${p.id}">
                <img data-thumb="${p.id}" alt="">
                <span>${esc(poseName(p.pose))}</span>
              </button>`,
            )
            .join('')}
        </div>
      </section>`;
    })
    .join('');

  observeThumbs(body);
}

function observeThumbs(root) {
  thumbObserver?.disconnect();
  const load = (img) => thumbUrl(img.dataset.thumb).then((url) => (img.src = url));
  if (!('IntersectionObserver' in window)) {
    root.querySelectorAll('img[data-thumb]').forEach(load);
    return;
  }
  thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        thumbObserver.unobserve(entry.target);
        load(entry.target);
      }
    },
    { rootMargin: '400px' },
  );
  root.querySelectorAll('img[data-thumb]').forEach((img) => thumbObserver.observe(img));
}

// --- Compare -----------------------------------------------------------------

function posePhotos(pose) {
  return photos.filter((p) => p.pose === pose);
}

function renderCompare(body) {
  const counts = {};
  for (const p of photos) counts[p.pose] = (counts[p.pose] || 0) + 1;
  const poses = Object.keys(POSES).filter((id) => counts[id]);
  if (!view.pose || !counts[view.pose]) {
    view.pose = poses.reduce((best, id) => (counts[id] > (counts[best] || 0) ? id : best), poses[0]);
    resetSelection();
  }
  const list = posePhotos(view.pose);

  body.innerHTML = `
    <div class="chips" role="tablist">
      ${poses
        .map(
          (id) => `<button class="chip ${id === view.pose ? 'active' : ''}" data-pose="${id}">
            ${esc(poseName(id))} <small>${counts[id]}</small>
          </button>`,
        )
        .join('')}
    </div>
    ${
      list.length < 2
        ? `<div class="cmp-single">
            <div class="cmp-img"><img data-full="${list[0].id}" alt=""></div>
            <p class="muted">Only one <strong>${esc(poseName(view.pose))}</strong> photo so far. Keep training — comparisons appear once there are two.</p>
          </div>`
        : `<div class="segmented small">
            <button data-style="side" class="${view.style === 'side' ? 'active' : ''}">Side by side</button>
            <button data-style="swipe" class="${view.style === 'swipe' ? 'active' : ''}">Swipe</button>
            <button data-style="timelapse" class="${view.style === 'timelapse' ? 'active' : ''}">Timelapse</button>
          </div>
          <div class="cmp-area"></div>`
    }`;

  if (list.length < 2) {
    loadFull(body);
    return;
  }
  renderCompareArea();
}

function resetSelection() {
  const n = posePhotos(view.pose).length;
  view.a = 0;
  view.b = Math.max(0, n - 1);
  view.frame = 0;
}

function caption(p) {
  return `<strong>${esc(formatDate(parseDateKey(p.date), { day: 'numeric', month: 'short', year: 'numeric' }))}</strong><small>Day ${dayNumber(p.date)}</small>`;
}

function renderCompareArea() {
  stopPlayback();
  const area = el.querySelector('.cmp-area');
  if (!area) return;
  const list = posePhotos(view.pose);
  const A = list[view.a];
  const B = list[view.b];

  if (view.style === 'side') {
    const panel = (key, p, idx) => `
      <figure class="cmp-panel">
        <div class="cmp-img"><img data-full="${p.id}" alt=""><span class="cmp-tag">${key === 'a' ? 'Before' : 'After'}</span></div>
        <figcaption>
          <button class="icon-btn sm" data-step="${key}:-1" ${idx === 0 ? 'disabled' : ''} aria-label="Earlier">${icon('left')}</button>
          <span>${caption(p)}</span>
          <button class="icon-btn sm" data-step="${key}:1" ${idx === list.length - 1 ? 'disabled' : ''} aria-label="Later">${icon('right')}</button>
        </figcaption>
      </figure>`;
    area.innerHTML = `
      <div class="cmp-side">${panel('a', A, view.a)}${panel('b', B, view.b)}</div>
      ${deltaHTML(A, B)}`;
  } else if (view.style === 'swipe') {
    area.innerHTML = `
      <div class="cmp-swipe cmp-img">
        <img data-full="${A.id}" alt="">
        <img class="swipe-top" data-full="${B.id}" alt="" style="clip-path: inset(0 0 0 50%)">
        <div class="swipe-line" style="left:50%"><span>${icon('left')}${icon('right')}</span></div>
        <span class="cmp-tag">Before</span><span class="cmp-tag right">After</span>
      </div>
      <div class="swipe-captions">
        <div><button class="icon-btn sm" data-step="a:-1" ${view.a === 0 ? 'disabled' : ''} aria-label="Earlier">${icon('left')}</button>
          <span>${caption(A)}</span>
          <button class="icon-btn sm" data-step="a:1" ${view.a === list.length - 1 ? 'disabled' : ''} aria-label="Later">${icon('right')}</button></div>
        <div><button class="icon-btn sm" data-step="b:-1" ${view.b === 0 ? 'disabled' : ''} aria-label="Earlier">${icon('left')}</button>
          <span>${caption(B)}</span>
          <button class="icon-btn sm" data-step="b:1" ${view.b === list.length - 1 ? 'disabled' : ''} aria-label="Later">${icon('right')}</button></div>
      </div>
      ${deltaHTML(A, B)}`;
  } else {
    view.frame = Math.min(view.frame, list.length - 1);
    const p = list[view.frame];
    area.innerHTML = `
      <div class="tlapse">
        <div class="cmp-img"><img class="tlapse-img" data-full="${p.id}" alt=""><span class="tlapse-date">${caption(p)}</span></div>
        <div class="tlapse-controls">
          <button class="play-btn" data-action="play" aria-label="Play">${icon('play')}</button>
          <input class="tlapse-range" type="range" min="0" max="${list.length - 1}" value="${view.frame}" aria-label="Timeline">
          <span class="tlapse-count">${view.frame + 1}/${list.length}</span>
        </div>
      </div>`;
  }
  loadFull(area);
}

function deltaHTML(A, B) {
  const days = Math.abs(daysBetween(A.date, B.date));
  return `<p class="cmp-delta">${days === 0 ? 'Same day' : `${days} day${days > 1 ? 's' : ''} apart`}</p>`;
}

function loadFull(root) {
  root.querySelectorAll('img[data-full]').forEach((img) => {
    fullUrl(img.dataset.full).then((url) => {
      if (img.isConnected) img.src = url;
    });
  });
}

async function showFrame(i) {
  const list = posePhotos(view.pose);
  view.frame = (i + list.length) % list.length;
  const p = list[view.frame];
  const img = el.querySelector('.tlapse-img');
  if (!img) return;
  img.src = await fullUrl(p.id);
  el.querySelector('.tlapse-date').innerHTML = caption(p);
  el.querySelector('.tlapse-range').value = view.frame;
  el.querySelector('.tlapse-count').textContent = `${view.frame + 1}/${list.length}`;
}

async function togglePlayback() {
  if (playTimer) {
    stopPlayback();
    return;
  }
  const list = posePhotos(view.pose);
  // Decode everything first so playback is smooth.
  await Promise.all(
    list.map(async (p) => {
      const img = new Image();
      img.src = await fullUrl(p.id);
      await img.decode().catch(() => {});
    }),
  );
  if (view.frame >= list.length - 1) await showFrame(0);
  playTimer = setInterval(() => {
    if (!el.querySelector('.tlapse-img')) return stopPlayback();
    showFrame(view.frame + 1);
  }, 650);
  const btn = el.querySelector('[data-action="play"]');
  if (btn) btn.innerHTML = icon('pause');
}

function stopPlayback() {
  clearInterval(playTimer);
  playTimer = null;
  const btn = el?.querySelector('[data-action="play"]');
  if (btn) btn.innerHTML = icon('play');
}

// --- Events ------------------------------------------------------------------

function onClick(e) {
  const t = e.target;
  const photoBtn = t.closest('[data-photo]');
  if (photoBtn) {
    const list = [...photos].reverse();
    openViewer(list, list.findIndex((p) => p.id === photoBtn.dataset.photo));
    return;
  }
  const mode = t.closest('[data-mode]')?.dataset.mode;
  if (mode) {
    view.mode = mode;
    el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    renderBody();
    return;
  }
  const pose = t.closest('[data-pose]')?.dataset.pose;
  if (pose) {
    view.pose = pose;
    resetSelection();
    renderBody();
    return;
  }
  const style = t.closest('[data-style]')?.dataset.style;
  if (style) {
    view.style = style;
    el.querySelectorAll('[data-style]').forEach((b) => b.classList.toggle('active', b.dataset.style === style));
    renderCompareArea();
    return;
  }
  const step = t.closest('[data-step]')?.dataset.step;
  if (step) {
    const [key, dir] = step.split(':');
    const n = posePhotos(view.pose).length;
    view[key] = Math.max(0, Math.min(n - 1, view[key] + Number(dir)));
    renderCompareArea();
    return;
  }
  const action = t.closest('[data-action]')?.dataset.action;
  if (action === 'play') togglePlayback();
  else if (action === 'settings') onSettings?.();
  else if (t.closest('.cmp-panel .cmp-img, .tlapse .cmp-img, .cmp-single .cmp-img')) {
    const img = t.closest('.cmp-img').querySelector('img[data-full]');
    const list = posePhotos(view.pose);
    openViewer(list, list.findIndex((p) => p.id === img.dataset.full));
  }
}

function onInput(e) {
  if (e.target.matches('.tlapse-range')) {
    stopPlayback();
    showFrame(Number(e.target.value));
  }
}

// Drag across the before/after image to move the divider.
function onPointerDown(e) {
  const box = e.target.closest('.cmp-swipe');
  if (!box) return;
  e.preventDefault(); // stop the browser's native image drag from cancelling the gesture
  const move = (ev) => {
    const r = box.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100));
    box.querySelector('.swipe-top').style.clipPath = `inset(0 0 0 ${pct}%)`;
    box.querySelector('.swipe-line').style.left = `${pct}%`;
  };
  const end = () => {
    box.removeEventListener('pointermove', move);
    box.removeEventListener('pointerup', end);
    box.removeEventListener('pointercancel', end);
  };
  box.setPointerCapture?.(e.pointerId);
  box.addEventListener('pointermove', move);
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  move(e);
}

// --- Viewer ------------------------------------------------------------------

function openViewer(list, index) {
  if (index < 0) return;
  stopPlayback();
  let i = index;
  const v = document.createElement('div');
  v.className = 'viewer';
  v.setAttribute('role', 'dialog');
  v.setAttribute('aria-modal', 'true');
  v.innerHTML = `
    <header class="viewer-top">
      <button class="icon-btn" data-v="close" aria-label="Close">${icon('close')}</button>
      <div class="viewer-title"></div>
      <span class="viewer-count"></span>
    </header>
    <div class="viewer-stage">
      <button class="viewer-nav prev" data-v="prev" aria-label="Previous">${icon('left')}</button>
      <img alt="">
      <button class="viewer-nav next" data-v="next" aria-label="Next">${icon('right')}</button>
    </div>
    <footer class="viewer-bottom">
      <button class="btn btn-ghost" data-v="share">${icon('share')} Save / share</button>
      <button class="btn btn-danger" data-v="delete">${icon('trash')} Delete</button>
    </footer>`;
  document.body.appendChild(v);
  document.body.classList.add('modal-open');
  const img = v.querySelector('img');

  async function show() {
    const p = list[i];
    v.querySelector('.viewer-title').innerHTML = `<strong>${esc(poseName(p.pose))}</strong><small>${esc(
      formatDate(parseDateKey(p.date), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    )} · Day ${dayNumber(p.date)}</small>`;
    v.querySelector('.viewer-count').textContent = `${i + 1}/${list.length}`;
    v.querySelector('.prev').disabled = i === 0;
    v.querySelector('.next').disabled = i === list.length - 1;
    img.src = await fullUrl(p.id);
  }

  function go(d) {
    const n = i + d;
    if (n < 0 || n >= list.length) return;
    i = n;
    show();
  }

  function close() {
    document.removeEventListener('keydown', onKey);
    v.remove();
    if (!document.querySelector('.sheet-backdrop, .cam, .viewer')) document.body.classList.remove('modal-open');
  }

  async function remove() {
    const p = list[i];
    if (!confirm(`Delete this ${poseName(p.pose)} photo? This can’t be undone.`)) return;
    await deletePhoto(p.id);
    forgetUrls(p.id);
    list.splice(i, 1);
    toast('Photo deleted');
    await renderProgress(el, { onSettings });
    if (!list.length) {
      close();
    } else {
      i = Math.min(i, list.length - 1);
      show();
    }
  }

  v.addEventListener('click', (e) => {
    const act = e.target.closest('[data-v]')?.dataset.v;
    if (act === 'close') close();
    else if (act === 'prev') go(-1);
    else if (act === 'next') go(1);
    else if (act === 'share') sharePhoto(list[i]);
    else if (act === 'delete') remove();
  });

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  };
  document.addEventListener('keydown', onKey);

  // Swipe left/right to move between photos.
  let startX = null;
  const stage = v.querySelector('.viewer-stage');
  stage.addEventListener('touchstart', (e) => (startX = e.touches[0].clientX), { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  });

  show();
}

async function sharePhoto(meta) {
  const p = await getPhoto(meta.id);
  if (!p) return;
  const name = `progress-${p.date}-${p.pose}.jpg`;
  const file = new File([p.data], name, { type: p.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: poseName(p.pose) });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(toBlob(p.data, p.type));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
