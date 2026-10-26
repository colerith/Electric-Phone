type Entry = { src: string; bytes: number; users: number; touched: number; expires: number };
const entries = new Map<string, Entry>();
const failed = new Set<string>();
const pending = new Map<string, Promise<Entry>>();
const waiting: Array<() => void> = [];
let active = 0;
const LIMIT = 48 * 1024 * 1024;
function trim() {
  let size = [...entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  for (const [key, entry] of [...entries].sort((a, b) => a[1].touched - b[1].touched)) {
    if (entry.users || (size <= LIMIT && entries.size <= 96)) continue;
    entries.delete(key);
    size -= entry.bytes;
    URL.revokeObjectURL(entry.src);
  }
}
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>(resolve => waiting.push(resolve));
  else active++;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
// Only content-addressed bundled artwork is kept across reloads. Custom avatar URLs can change.
async function disk(key: string, blob?: Blob): Promise<Blob | undefined> {
  if (typeof indexedDB === 'undefined') return;
  return new Promise(resolve => {
    let finished = false;
    const done = (value?: Blob) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve(value);
      }
    };
    const timer = setTimeout(() => done(), 2000);
    const request = indexedDB.open('wave-phone-images', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'key' });
    request.onerror = () => done();
    request.onblocked = () => done();
    request.onsuccess = () => {
      const db = request.result;
      if (finished) {
        db.close();
        return;
      }
      const tx = db.transaction('images', blob ? 'readwrite' : 'readonly'),
        store = tx.objectStore('images');
      tx.oncomplete = () => db.close();
      tx.onabort = () => {
        db.close();
        done();
      };
      if (!blob) {
        const read = store.get(key);
        read.onsuccess = () => done(read.result?.blob);
        read.onerror = () => done();
      } else {
        store.put({ key, blob, time: Date.now() });
        const all = store.getAll();
        all.onsuccess = () => {
          const rows = all.result.sort((a, b) => a.time - b.time);
          let bytes = rows.reduce((sum, row) => sum + row.blob.size, 0),
            count = rows.length;
          for (const row of rows) {
            if (bytes <= LIMIT && count <= 96) break;
            store.delete(row.key);
            bytes -= row.blob.size;
            count--;
          }
          done();
        };
        all.onerror = () => done();
      }
    };
  });
}
export async function acquireImage(source: string): Promise<{ src: string; release: () => void }> {
  if (!source || /^(data:|blob:)/i.test(source)) return { src: source, release: () => {} };
  const key = new URL(source, location.href).href;
  if (!/^https?:/i.test(key)) return { src: source, release: () => {} };
  const immutable = /\/assets\/resources\/[a-f0-9]{64}\.(png|webp|jpg|jpeg|gif|svg)(?:$|[?#])/i.test(key);
  if (new URL(key).origin !== location.origin && !immutable) return { src: source, release: () => {} };
  let entry = entries.get(key);
  if (entry && entry.expires < Date.now() && !entry.users) {
    entries.delete(key);
    URL.revokeObjectURL(entry.src);
    entry = undefined;
  }
  if (!entry) {
    let job = pending.get(key);
    if (!job) {
      job = slot(async () => {
        let blob = immutable && !failed.has(key) ? await disk(key) : undefined;
        if (!blob) {
          const controller = new AbortController(),
            timer = setTimeout(() => controller.abort(), 15000);
          try {
            const response = await fetch(key, {
              signal: controller.signal,
              cache: failed.has(key) ? 'reload' : immutable ? 'force-cache' : 'default',
              credentials: 'same-origin',
            });
            if (!response.ok) throw Error('Image unavailable');
            blob = await response.blob();
            if (!blob.type.startsWith('image/') || blob.size > 8 * 1024 * 1024) throw Error('Image is not cacheable');
          } finally {
            clearTimeout(timer);
          }
          if (immutable) void disk(key, blob).catch(() => {});
        }
        const value: Entry = {
          src: URL.createObjectURL(blob),
          bytes: blob.size,
          users: 0,
          touched: Date.now(),
          expires: immutable ? Infinity : Date.now() + 300000,
        };
        entries.set(key, value);
        return value;
      }).finally(() => pending.delete(key));
      pending.set(key, job);
    }
    entry = await job;
  }
  entry.users++;
  entry.touched = Date.now();
  trim();
  let released = false;
  return {
    src: entry.src,
    release: () => {
      if (!released) {
        released = true;
        entry!.users--;
        trim();
      }
    },
  };
}
export async function warmImages(urls: string[]): Promise<void> {
  await Promise.allSettled(
    [...new Set(urls)].filter(Boolean).map(async url => {
      const image = await acquireImage(url);
      image.release();
    }),
  );
}

export function invalidateImage(source: string): void {
  if (!source || /^(data:|blob:)/i.test(source)) return;
  const key = new URL(source, location.href).href,
    entry = entries.get(key);
  failed.add(key);
  if (entry && !entry.users) {
    entries.delete(key);
    URL.revokeObjectURL(entry.src);
  }
}
