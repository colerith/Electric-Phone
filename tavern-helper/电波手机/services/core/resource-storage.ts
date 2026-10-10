/** Binary resources live in ST files. Base64 is only a transient upload/API wire format. */
const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};
export const isStoredResource = (value: string) => /^\/user\/files\/wave-resource-[a-f0-9]{64}\.[a-z0-9]+$/.test(value);
const uploads = new Map<string, Promise<string>>();
const verified = new Set<string>();
export function binaryBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join(''));
}
export async function storeResource(source: Blob | string, signal?: AbortSignal): Promise<string> {
  if (typeof source === 'string' && !source.startsWith('data:') && !source.startsWith('blob:')) return source;
  signal?.throwIfAborted();
  const blob = typeof source === 'string' ? await (await fetch(source, { signal })).blob() : source;
  if (!blob.size) throw Error('资源文件为空，未保存');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
  const name = `wave-resource-${hash}.${extensions[blob.type.split(';')[0]] || 'bin'}`;
  const path = `/user/files/${name}`;
  if (verified.has(path)) return path;
  let pending = uploads.get(path);
  if (!pending) {
    pending = (async () => {
      const timeout = AbortSignal.timeout(120000);
      const existing = await fetch(path, { method: 'HEAD', signal: timeout, cache: 'no-cache' });
      if (!existing.ok) {
        if (existing.status !== 404) throw Error(`无法检查资源文件 (${existing.status})`);
        const response = await fetch('/api/files/upload', {
          method: 'POST',
          headers: SillyTavern.getRequestHeaders?.() || { 'Content-Type': 'application/json' },
          signal: timeout,
          body: JSON.stringify({ name, data: binaryBase64(bytes) }),
        });
        if (!response.ok) throw Error(`资源落盘失败 (${response.status})，原数据已保留`);
        const result = await response.json();
        if (`/${String(result.path || '').replace(/^\/+/, '')}` !== path) throw Error('服务器返回的资源路径不匹配');
      }
      if (verified.size >= 256) verified.delete(verified.values().next().value!);
      verified.add(path);
      return path;
    })().finally(() => uploads.delete(path));
    uploads.set(path, pending);
  }
  const result = await pending;
  signal?.throwIfAborted();
  return result;
}
/** Copy only changed branches, yielding between resource uploads. Never mutate a live store mid-migration. */
export async function mapResourceStrings<T>(
  value: T,
  transform: (value: string, key: string) => Promise<string>,
  key = '',
): Promise<T> {
  if (typeof value === 'string') {
    const changed = await transform(value, key);
    if (changed !== value) return changed as T;
    if (/^\s*[[{]/.test(value) && /data:|wave-resource-|wave-backup-asset:|"encoding"/.test(value)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        return value;
      }
      const next = await mapResourceStrings(parsed, transform);
      if (next !== parsed) return JSON.stringify(next) as T;
    }
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  let copy: any;
  for (const [field, item] of Object.entries(value)) {
    const next = await mapResourceStrings(item, transform, field);
    if (next !== item) {
      copy ||= Array.isArray(value) ? [...value] : { ...value };
      Object.defineProperty(copy, field, { value: next, enumerable: true, writable: true, configurable: true });
    }
  }
  return copy || value;
}
export function externalizeResources<T>(value: T): Promise<T> {
  return mapResourceStrings(value, async (text, key) => {
    const source =
      key === 'encoding' && text && !isStoredResource(text) && /^[A-Za-z0-9+/]+={0,2}$/.test(text)
        ? `data:application/octet-stream;base64,${text}`
        : text;
    if (!source.startsWith('data:') && !source.startsWith('blob:')) return text;
    const path = await storeResource(source);
    await new Promise(resolve => setTimeout(resolve, 0));
    return path;
  });
}
export async function resourceEncoding(value: string, signal?: AbortSignal): Promise<string> {
  if (!isStoredResource(value)) return value; // legacy read compatibility only
  const response = await fetch(value, { signal });
  if (!response.ok) throw Error(`参考图编码读取失败 (${response.status})`);
  return binaryBase64(new Uint8Array(await response.arrayBuffer()));
}

/** Last persistence boundary: callers must upload binary resources before committing state. */
export function assertExternalResources(value: unknown, key = ''): void {
  if (typeof value === 'string') {
    if (/^data:[^,]*;base64,/i.test(value) || (key === 'encoding' && value && /^[A-Za-z0-9+/]+={0,2}$/.test(value)))
      throw Error('资源尚未落盘，已阻止将 Base64 写入存档');
    if (/^\s*[[{]/.test(value) && /data:|"encoding"/.test(value)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        return;
      }
      assertExternalResources(parsed);
    }
  } else if (value && typeof value === 'object') {
    for (const [field, item] of Object.entries(value)) assertExternalResources(item, field);
  }
}
