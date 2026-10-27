// Settings sheet: storage info + backup export/import.

import { getAllPhotos, listPhotos, savePhoto } from './db.js';
import { exportState, importState, dateKey } from './store.js';
import { icon, toast, openSheet } from './ui.js';

export const APP_VERSION = '1.0.0';

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function formatBytes(n) {
  if (!n) return '0 MB';
  return n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`;
}

export function openSettings({ onChange } = {}) {
  openSheet(async (sheet, close) => {
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h2>Settings</h2>
        <button class="icon-btn" data-s="close" aria-label="Close">${icon('close')}</button>
      </div>
      <section class="set-group">
        <h3>Storage</h3>
        <div class="set-row"><span>Progress photos</span><strong data-s-val="count">…</strong></div>
        <div class="set-row"><span>Space used</span><strong data-s-val="usage">…</strong></div>
        <div class="set-row"><span>Protected from browser clean-up</span><strong data-s-val="persisted">…</strong></div>
        <p class="hint">Everything is stored privately on this device only — nothing is uploaded. Export a backup now and then, especially before switching phones.</p>
      </section>
      <section class="set-group">
        <h3>Backup</h3>
        <button class="btn btn-ghost btn-block" data-s="export">${icon('download')} Export backup</button>
        <button class="btn btn-ghost btn-block" data-s="import">${icon('upload')} Import backup</button>
        <input type="file" accept="application/json,.json" hidden data-s-file>
      </section>
      <section class="set-group">
        <h3>About</h3>
        <p class="hint">Workout Overview v${APP_VERSION}${isStandalone() ? ' · installed' : ''}. Your plan lives in <code>js/plan.js</code> — edit it on GitHub and the app updates itself.</p>
      </section>`;

    const val = (k, v) => (sheet.querySelector(`[data-s-val="${k}"]`).textContent = v);
    listPhotos().then((p) => val('count', p.length));
    navigator.storage?.estimate?.().then((e) => val('usage', formatBytes(e.usage))).catch(() => val('usage', '–'));
    refreshPersisted();

    async function refreshPersisted() {
      const persisted = await navigator.storage?.persisted?.().catch(() => false);
      const el = sheet.querySelector('[data-s-val="persisted"]');
      if (persisted) el.textContent = 'Yes';
      else el.innerHTML = `<button class="link-btn" data-s="persist">No — protect</button>`;
    }

    const fileInput = sheet.querySelector('[data-s-file]');
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const n = await importBackup(file);
        toast(`Backup restored · ${n} photo${n === 1 ? '' : 's'}`);
        close();
        onChange?.();
      } catch (err) {
        console.error(err);
        alert(`Couldn’t import that file: ${err.message}`);
      }
    });

    sheet.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-s]')?.dataset.s;
      if (act === 'close') close();
      else if (act === 'import') fileInput.click();
      else if (act === 'persist') {
        const ok = await navigator.storage?.persist?.().catch(() => false);
        if (!ok) toast(isStandalone() ? 'The browser declined — keep exporting backups' : 'Install the app to protect your photos');
        refreshPersisted();
      } else if (act === 'export') {
        const btn = e.target.closest('button');
        btn.disabled = true;
        btn.innerHTML = `${icon('download')} Preparing…`;
        try {
          await exportBackup();
        } catch (err) {
          console.error(err);
          alert(`Export failed: ${err.message}`);
        } finally {
          btn.disabled = false;
          btn.innerHTML = `${icon('download')} Export backup`;
        }
      }
    });
  });
}

// --- Backup format -------------------------------------------------------
// One JSON file: { app, version, exported, state, photos: [{ ...meta, data, thumb }] }
// with image bytes as data: URLs.

function toDataURL(buffer, type) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([buffer], { type }));
  });
}

async function exportBackup() {
  const photos = await getAllPhotos();
  const parts = [
    `{"app":"workout-overview","version":1,"exported":${JSON.stringify(new Date().toISOString())},`,
    `"state":${JSON.stringify(exportState())},"photos":[`,
  ];
  for (let i = 0; i < photos.length; i++) {
    const { data, thumb, ...meta } = photos[i];
    const entry = { ...meta, data: await toDataURL(data, meta.type), thumb: await toDataURL(thumb, meta.type) };
    parts.push((i ? ',' : '') + JSON.stringify(entry));
  }
  parts.push(']}');

  const name = `workout-backup-${dateKey()}.json`;
  const file = new File(parts, name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Workout backup' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function importBackup(file) {
  const json = JSON.parse(await file.text());
  if (json?.app !== 'workout-overview' || !Array.isArray(json.photos)) {
    throw new Error('this isn’t a Workout Overview backup.');
  }
  const bytes = async (dataUrl) => (await fetch(dataUrl)).arrayBuffer();
  for (const p of json.photos) {
    if (!p.id || !p.data) continue;
    await savePhoto({ ...p, data: await bytes(p.data), thumb: await bytes(p.thumb || p.data) });
  }
  if (json.state) importState(json.state);
  return json.photos.length;
}
