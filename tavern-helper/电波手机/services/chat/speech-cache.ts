import { logDiagnostic } from '../core/diagnostics';

// Independent of script release versions: upgrades must retain generated audio.
function openAudioCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('wave-phone-speech-cache', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('audio');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('音频缓存被其他页面占用'));
  });
}
async function readAudio(key: string): Promise<Blob | undefined> {
  const db = await openAudioCache();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('audio').objectStore('audio').get(key);
      request.onsuccess = () =>
        resolve(request.result instanceof Blob && request.result.size ? request.result : undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
async function writeAudio(key: string, blob: Blob): Promise<void> {
  const db = await openAudioCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('audio', 'readwrite');
      tx.objectStore('audio').put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function cachedSpeech(key: string, generate: () => Promise<Blob>, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  let cached: Blob | undefined;
  try {
    cached = await readAudio(key);
  } catch {
    logDiagnostic('语音缓存', '无法读取本地音频缓存，本次将请求合成。');
  }
  signal?.throwIfAborted();
  if (cached) return cached;
  const blob = await generate();
  signal?.throwIfAborted();
  if (!blob.size) throw new Error('语音服务未返回音频');
  try {
    await writeAudio(key, blob);
  } catch {
    logDiagnostic('语音缓存', '音频可播放，但未能保存本地缓存；请检查浏览器存储权限或剩余空间。');
  }
  signal?.throwIfAborted();
  return blob;
}
