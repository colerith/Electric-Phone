import { diagnostics } from './diagnostics';
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
    const request = indexedDB.open('wave-phone-parse-cache', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function records(): Promise<CacheRecord[]> {
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('records').objectStore('records').getAll();
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
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      remove.forEach(key => store.delete(key));
      if (record) store.put(record);
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
): Promise<T> {
  const key = JSON.stringify([card, chat]);
  let list: CacheRecord[] = [];
  try {
    list = await records();
    const existing = list.find(item => item.key === key && item.signature === signature);
    if (existing) {
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
      return existing.value as T;
    }
  } catch (error) {
    diagnostics.cacheError = String(error);
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
