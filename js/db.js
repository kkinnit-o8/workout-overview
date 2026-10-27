// Photo storage in IndexedDB. Image bytes are stored as ArrayBuffers
// (more reliable than Blobs across Safari versions).

const DB_NAME = 'workout-overview';
const DB_VERSION = 1;
const STORE = 'photos';

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('pose', 'pose');
          store.createIndex('date', 'date');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const result = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export function savePhoto(photo) {
  return tx('readwrite', (s) => s.put(photo));
}

export function deletePhoto(id) {
  return tx('readwrite', (s) => s.delete(id));
}

export function getPhoto(id) {
  return tx('readonly', (s) => s.get(id));
}

// Metadata for every photo (no image bytes), oldest first.
export function listPhotos() {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const out = [];
        const req = db.transaction(STORE).objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            resolve(out.sort((a, b) => a.ts - b.ts));
            return;
          }
          const { data, thumb, ...meta } = cursor.value;
          out.push(meta);
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

export function getAllPhotos() {
  return tx('readonly', (s) => s.getAll());
}

// --- Object URL cache ----------------------------------------------------
// Thumbnails stay cached for the session; full images are released on demand.

const thumbUrls = new Map();
const fullUrls = new Map();

export function toBlob(buffer, type = 'image/jpeg') {
  return new Blob([buffer], { type });
}

export async function thumbUrl(id) {
  if (!thumbUrls.has(id)) {
    const p = await getPhoto(id);
    if (!p) return '';
    thumbUrls.set(id, URL.createObjectURL(toBlob(p.thumb, p.type)));
  }
  return thumbUrls.get(id);
}

export async function fullUrl(id) {
  if (!fullUrls.has(id)) {
    const p = await getPhoto(id);
    if (!p) return '';
    fullUrls.set(id, URL.createObjectURL(toBlob(p.data, p.type)));
  }
  return fullUrls.get(id);
}

export function releaseFullUrls() {
  for (const url of fullUrls.values()) URL.revokeObjectURL(url);
  fullUrls.clear();
}

export function forgetUrls(id) {
  for (const cache of [thumbUrls, fullUrls]) {
    if (cache.has(id)) {
      URL.revokeObjectURL(cache.get(id));
      cache.delete(id);
    }
  }
}
