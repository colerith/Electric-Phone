import { diagnostics, logDiagnostic } from './diagnostics';
type CacheRecord = {
  key: string;
  card: string;
  chat: string;
  signature: string;
  value: unknown;
  size: number;
  time: number;
};
function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('wave-phone-parse-cache', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      // This is derived parse output, not saved chat data. Rebuild the old unindexed cache.
      if (db.objectStoreNames.contains('records')) db.deleteObjectStore('records');
      db.createObjectStore('records', { keyPath: 'key' });
      db.createObjectStore('metadata', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function records(): Promise<Omit<CacheRecord, 'value' | 'signature'>[]> {
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('metadata').objectStore('metadata').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
async function readRecord(key: string): Promise<CacheRecord | undefined> {
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('records').objectStore('records').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
async function mutate(remove: string[], record?: CacheRecord) {
  const db = await openCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['records', 'metadata'], 'readwrite');
      const store = tx.objectStore('records');
      const metadata = tx.objectStore('metadata');
      remove.forEach(key => {
        store.delete(key);
        metadata.delete(key);
      });
      if (record) {
        store.put(record);
        const { value: _value, signature: _signature, ...summary } = record;
        metadata.put(summary);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function cacheStats(card?: string) {
  const list = (await records()).filter(item => !card || item.card === card);
  return { count: list.length, bytes: list.reduce((sum, item) => sum + item.size, 0) };
}
export async function clearParseCache(card?: string, chat?: string) {
  const list = (await records()).filter(item => (!card || item.card === card) && (!chat || item.chat === chat));
  await mutate(list.map(item => item.key));
}
export async function cachedParse<T>(
  card: string,
  chat: string,
  signature: string,
  limitMb: number,
  parse: () => T,
  validate?: (value: unknown) => T,
): Promise<T> {
  const key = JSON.stringify([card, chat]);
  let list: Omit<CacheRecord, 'value' | 'signature'>[] = [];
  try {
    list = await records();
    const existing = await readRecord(key);
    if (existing?.signature === signature) {
      const validated = validate ? validate(existing.value) : (existing.value as T);
      const oldest = list.filter(item => item.card === card).sort((a, b) => a.time - b.time);
      let size = oldest.reduce((sum, item) => sum + item.size, 0);
      const remove: string[] = [];
      while (size > limitMb * 1024 * 1024 && oldest.length) {
        const item = oldest.shift()!;
        size -= item.size;
        remove.push(item.key);
      }
      if (remove.length) await mutate(remove);
      diagnostics.cacheError = '';
      return validated;
    }
  } catch (error) {
    diagnostics.cacheError = String(error);
    logDiagnostic('解析缓存回退', `缓存读取或校验失败，将从原聊天重建：${String(error).slice(0, 1000)}`);
  }
  const value = parse();
  try {
    const record = {
      key,
      card,
      chat,
      signature,
      value,
      size: new Blob([JSON.stringify({ signature, value })]).size,
      time: Date.now(),
    };
    const limit = limitMb * 1024 * 1024;
    const oldest = list.filter(item => item.card === card && item.key !== key).sort((a, b) => a.time - b.time);
    let size = oldest.reduce((sum, item) => sum + item.size, 0) + record.size;
    const remove = [key];
    while (size > limit && oldest.length) {
      const item = oldest.shift()!;
      size -= item.size;
      remove.push(item.key);
    }
    await mutate(remove, record.size <= limit ? record : undefined);
    diagnostics.cacheError = '';
  } catch (error) {
    diagnostics.cacheError = String(error);
  }
  return value;
}

/** Hash each floor independently: no giant JSON copy of the entire conversation in memory or IndexedDB. */
let fingerprintScope = '';
let floorFingerprints = new Map<number, { text: string; hash: string }>();
export async function chatParseSignature(
  scope: string,
  floors: Pick<ChatMessage, 'message_id' | 'message'>[],
): Promise<string> {
  // LAN HTTP pages may not expose WebCrypto; preserve the exact legacy cache key there.
  if (!globalThis.crypto?.subtle)
    return 'wave-only-delta-v3-raw:' + JSON.stringify(floors.map(f => [f.message_id, f.message]));
  if (fingerprintScope !== scope) {
    fingerprintScope = scope;
    floorFingerprints.clear();
  }
  const previous = floorFingerprints;
  const next = new Map<number, { text: string; hash: string }>();
  const tokens: string[] = [];
  for (const floor of floors) {
    let entry = previous.get(floor.message_id);
    if (!entry || entry.text !== floor.message) {
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(floor.message)));
      entry = { text: floor.message, hash: Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('') };
    }
    next.set(floor.message_id, entry);
    tokens.push(`${floor.message_id}:${entry.hash}`);
  }
  if (fingerprintScope === scope) floorFingerprints = next;
  return 'wave-only-delta-v3:' + tokens.join('|');
}
