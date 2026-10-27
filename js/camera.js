// Full-screen photo session: walks through the chosen poses one by one.
// Live camera with a ghost of your last photo (or a guide figure) to line up
// against, a self-timer, and a review step before saving.
// Photos are cropped to 3:4 and saved as seen in the preview.

import { POSES, poseFigureSVG } from './poses.js';
import { savePhoto, listPhotos, fullUrl } from './db.js';
import { dateKey, getSettings, updateSettings } from './store.js';
import { esc, icon } from './ui.js';

const MAX_W = 1200;
const THUMB_W = 360;
const TIMERS = [0, 3, 5, 10];

export async function openPhotoSession({ poses, workoutId = null, onClose }) {
  const settings = getSettings();
  const allPhotos = await listPhotos();
  const lastByPose = {};
  for (const p of allPhotos) lastByPose[p.pose] = p; // sorted oldest → newest

  const state = {
    index: 0,
    facing: settings.facing,
    timer: settings.timer,
    overlay: settings.overlay, // preferred: 'ghost' | 'guide' | 'off'
    stream: null,
    mirrored: false,
    pending: null, // { canvas, url, mirrored }
    countdownToken: 0,
    saved: [], // { pose, thumbUrl }
    wakeLock: null,
    closed: false,
  };

  const el = document.createElement('div');
  el.className = 'cam';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Progress photos');
  el.innerHTML = `
    <header class="cam-top">
      <button class="icon-btn" data-act="close" aria-label="Close">${icon('close')}</button>
      <div class="cam-steps"></div>
      <button class="text-btn" data-act="skip">Skip</button>
    </header>
    <div class="cam-info">
      <div class="cam-step-label"></div>
      <h2 class="cam-pose-name"></h2>
      <p class="cam-cue"></p>
    </div>
    <div class="cam-stage">
      <div class="cam-frame">
        <video playsinline muted autoplay></video>
        <img class="cam-ghost" alt="" hidden>
        <div class="cam-guide"></div>
        <img class="cam-review" alt="Captured photo" hidden>
        <div class="cam-msg" hidden></div>
        <div class="cam-count" hidden></div>
        <div class="cam-flash"></div>
      </div>
    </div>
    <footer class="cam-controls">
      <div class="cam-row cam-capture-row">
        <button class="cam-ctl" data-act="overlay"><span class="cam-ctl-icon">${icon('layers')}</span><span class="cam-ctl-label"></span></button>
        <button class="cam-ctl" data-act="timer"><span class="cam-ctl-icon">${icon('timer')}</span><span class="cam-ctl-label"></span></button>
        <button class="shutter" data-act="shoot" aria-label="Take photo"><span></span></button>
        <button class="cam-ctl" data-act="upload"><span class="cam-ctl-icon">${icon('image')}</span><span class="cam-ctl-label">Upload</span></button>
        <button class="cam-ctl" data-act="flip"><span class="cam-ctl-icon">${icon('flip')}</span><span class="cam-ctl-label">Flip</span></button>
      </div>
      <div class="cam-row cam-review-row" hidden>
        <button class="btn btn-ghost" data-act="retake">${icon('undo')} Retake</button>
        <button class="btn btn-primary" data-act="save">${icon('check')} Save photo</button>
      </div>
    </footer>
    <input class="cam-file" type="file" accept="image/*" hidden>
  `;
  document.body.appendChild(el);
  document.body.classList.add('modal-open');

  const $ = (sel) => el.querySelector(sel);
  const video = $('video');
  const ghost = $('.cam-ghost');
  const guide = $('.cam-guide');
  const review = $('.cam-review');
  const msg = $('.cam-msg');
  const count = $('.cam-count');
  const flash = $('.cam-flash');
  const fileInput = $('.cam-file');

  // --- Camera ------------------------------------------------------------

  async function startCamera() {
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      showMessage('Live camera isn’t available here. You can still take or pick a photo.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: state.facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      if (state.closed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      state.stream = stream;
      video.srcObject = stream;
      const facing = stream.getVideoTracks()[0]?.getSettings().facingMode || state.facing;
      state.mirrored = facing === 'user';
      video.classList.toggle('mirrored', state.mirrored);
      msg.hidden = true;
      await video.play().catch(() => {});
      renderOverlay();
    } catch (err) {
      console.warn('Camera error', err);
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      showMessage(
        denied
          ? 'Camera access was blocked. Allow camera access for this app, or take/pick a photo instead.'
          : 'Couldn’t start the camera. You can still take or pick a photo.',
      );
    }
  }

  function stopCamera() {
    state.stream?.getTracks().forEach((t) => t.stop());
    state.stream = null;
    video.srcObject = null;
  }

  function showMessage(text) {
    msg.innerHTML = `<p>${esc(text)}</p><button class="btn btn-primary" data-act="upload">${icon('image')} Take or choose photo</button>`;
    msg.hidden = false;
  }

  // --- Overlay (ghost of last photo / guide figure) -----------------------

  function effectiveOverlay() {
    const pose = currentPose();
    if (state.overlay === 'ghost' && !lastByPose[pose]) return 'guide';
    return state.overlay;
  }

  async function renderOverlay() {
    if (state.closed || state.pending) return; // nothing over the review image
    const pose = currentPose();
    const mode = effectiveOverlay();
    const last = lastByPose[pose];

    const labels = { ghost: 'Last photo', guide: 'Guide', off: 'Overlay off' };
    const label = $('[data-act="overlay"] .cam-ctl-label');
    if (label) label.textContent = labels[mode];

    guide.innerHTML = poseFigureSVG(pose);
    guide.classList.toggle('mirrored', state.mirrored);
    guide.hidden = mode !== 'guide';

    ghost.hidden = true;
    if (mode === 'ghost' && last) {
      const url = await fullUrl(last.id);
      if (currentPose() !== pose || state.pending || effectiveOverlay() !== 'ghost') return;
      ghost.src = url;
      ghost.classList.toggle('mirrored', !!last.mirrored !== state.mirrored);
      ghost.hidden = false;
    }
  }

  function cycleOverlay() {
    const hasGhost = !!lastByPose[currentPose()];
    const order = hasGhost ? ['ghost', 'guide', 'off'] : ['guide', 'off'];
    const cur = order.indexOf(effectiveOverlay());
    state.overlay = order[(cur + 1) % order.length];
    updateSettings({ overlay: state.overlay });
    renderOverlay();
  }

  // --- Steps -------------------------------------------------------------

  function currentPose() {
    return poses[state.index];
  }

  function renderStep() {
    const pose = POSES[currentPose()];
    $('.cam-steps').innerHTML = poses
      .map((_, i) => `<span class="${i < state.index ? 'done' : i === state.index ? 'active' : ''}"></span>`)
      .join('');
    $('.cam-step-label').textContent = `Pose ${state.index + 1} of ${poses.length}`;
    $('.cam-pose-name').textContent = pose.name;
    $('.cam-cue').textContent = pose.cue;
    $('[data-act="timer"] .cam-ctl-label').textContent = state.timer ? `${state.timer}s` : 'No timer';
    setReviewMode(false);
    renderOverlay();
  }

  function setReviewMode(on) {
    $('.cam-capture-row').hidden = on;
    $('.cam-review-row').hidden = !on;
    $('[data-act="skip"]').hidden = on;
    review.hidden = !on;
    video.hidden = on;
    if (on) {
      ghost.hidden = true;
      guide.hidden = true;
    }
  }

  function next() {
    clearPending();
    if (state.index < poses.length - 1) {
      state.index += 1;
      renderStep();
    } else {
      finish();
    }
  }

  // --- Capture -----------------------------------------------------------

  function cropTo34(w, h) {
    const target = 3 / 4;
    if (w / h > target) {
      const sw = Math.round(h * target);
      return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h };
    }
    const sh = Math.round(w / target);
    return { sx: 0, sy: Math.round((h - sh) / 2), sw: w, sh };
  }

  function drawCropped(source, w, h, mirror) {
    const { sx, sy, sw, sh } = cropTo34(w, h);
    const scale = Math.min(1, MAX_W / sw);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d');
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  async function showReview(canvas, mirrored) {
    clearPending();
    const blob = await canvasToBlob(canvas, 0.88);
    state.pending = { canvas, blob, mirrored, url: URL.createObjectURL(blob) };
    review.src = state.pending.url;
    setReviewMode(true);
  }

  function clearPending() {
    if (state.pending) URL.revokeObjectURL(state.pending.url);
    state.pending = null;
  }

  async function shoot() {
    if (state.countdownToken) {
      // Second tap cancels the running timer.
      cancelCountdown();
      return;
    }
    if (!state.stream || !video.videoWidth) {
      fileInput.click();
      return;
    }
    unlockAudio();
    if (state.timer) {
      const token = Date.now();
      state.countdownToken = token;
      el.classList.add('counting');
      for (let s = state.timer; s > 0; s--) {
        if (state.countdownToken !== token) return;
        count.textContent = s;
        count.hidden = false;
        count.classList.remove('pop');
        void count.offsetWidth;
        count.classList.add('pop');
        beep(s <= 3 ? 880 : 660, 0.09);
        await sleep(1000);
      }
      if (state.countdownToken !== token) return;
      cancelCountdown();
    }
    beep(1320, 0.15);
    flash.classList.remove('go');
    void flash.offsetWidth;
    flash.classList.add('go');
    const canvas = drawCropped(video, video.videoWidth, video.videoHeight, state.mirrored);
    await showReview(canvas, state.mirrored);
  }

  function cancelCountdown() {
    state.countdownToken = 0;
    count.hidden = true;
    el.classList.remove('counting');
  }

  async function handleFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const canvas = drawCropped(img, img.naturalWidth, img.naturalHeight, false);
      await showReview(canvas, false);
    } catch {
      alert('Couldn’t read that image.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function save() {
    const p = state.pending;
    if (!p) return;
    const saveBtn = $('[data-act="save"]');
    saveBtn.disabled = true;
    try {
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = THUMB_W;
      thumbCanvas.height = Math.round((THUMB_W * p.canvas.height) / p.canvas.width);
      thumbCanvas.getContext('2d').drawImage(p.canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const thumbBlob = await canvasToBlob(thumbCanvas, 0.75);
      const now = new Date();
      const photo = {
        id: newId(),
        date: dateKey(now),
        ts: now.getTime(),
        pose: currentPose(),
        workout: workoutId,
        w: p.canvas.width,
        h: p.canvas.height,
        mirrored: p.mirrored,
        type: 'image/jpeg',
        data: await p.blob.arrayBuffer(),
        thumb: await thumbBlob.arrayBuffer(),
      };
      await savePhoto(photo);
      lastByPose[photo.pose] = photo;
      state.saved.push({ pose: photo.pose, thumbUrl: URL.createObjectURL(thumbBlob) });
      navigator.storage?.persist?.().catch(() => {});
      next();
    } catch (err) {
      console.error(err);
      alert('Couldn’t save the photo. Your device may be out of storage.');
    } finally {
      saveBtn.disabled = false;
    }
  }

  // --- Finish / close ----------------------------------------------------

  function finish() {
    stopCamera();
    if (!state.saved.length) {
      close();
      return;
    }
    el.classList.add('cam-done');
    el.innerHTML = `
      <div class="cam-summary">
        <div class="summary-badge">${icon('check')}</div>
        <h2>Nice work!</h2>
        <p>${state.saved.length} progress photo${state.saved.length > 1 ? 's' : ''} saved.</p>
        <div class="summary-grid">
          ${state.saved
            .map(
              (s) => `<figure><img src="${s.thumbUrl}" alt=""><figcaption>${esc(POSES[s.pose].name)}</figcaption></figure>`,
            )
            .join('')}
        </div>
        <button class="btn btn-primary btn-block" data-act="close">Done</button>
      </div>`;
  }

  function close() {
    if (state.closed) return;
    state.closed = true;
    cancelCountdown();
    stopCamera();
    clearPending();
    state.saved.forEach((s) => URL.revokeObjectURL(s.thumbUrl));
    state.wakeLock?.release().catch(() => {});
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onKey);
    el.remove();
    document.body.classList.remove('modal-open');
    onClose?.(state.saved.length);
  }

  // --- Events ------------------------------------------------------------

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    switch (btn.dataset.act) {
      case 'close':
        close();
        break;
      case 'skip':
        cancelCountdown();
        next();
        break;
      case 'shoot':
        shoot();
        break;
      case 'overlay':
        cycleOverlay();
        break;
      case 'timer': {
        state.timer = TIMERS[(TIMERS.indexOf(state.timer) + 1) % TIMERS.length];
        updateSettings({ timer: state.timer });
        btn.querySelector('.cam-ctl-label').textContent = state.timer ? `${state.timer}s` : 'No timer';
        break;
      }
      case 'flip':
        state.facing = state.facing === 'user' ? 'environment' : 'user';
        updateSettings({ facing: state.facing });
        startCamera();
        break;
      case 'upload':
        cancelCountdown();
        fileInput.click();
        break;
      case 'retake':
        clearPending();
        setReviewMode(false);
        renderOverlay();
        if (!state.stream) startCamera();
        break;
      case 'save':
        save();
        break;
    }
  });

  fileInput.addEventListener('change', () => {
    handleFile(fileInput.files[0]);
    fileInput.value = '';
  });

  function onVisibility() {
    if (document.visibilityState === 'visible' && !state.closed && !el.classList.contains('cam-done')) {
      requestWakeLock();
      if (!state.stream?.active) startCamera();
    }
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('keydown', onKey);

  async function requestWakeLock() {
    try {
      state.wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      /* not supported / not allowed */
    }
  }

  renderStep();
  requestWakeLock();
  startCamera();
}

// --- Helpers ---------------------------------------------------------------

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

let audioCtx = null;
function unlockAudio() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function beep(freq, duration) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}
