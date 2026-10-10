import {
  accountBase,
  fetchAccountPlaylists,
  fetchAccountTracks,
  type MusicAccountProvider,
  type AccountPlaylist,
} from './music-accounts';
import type { Track } from './music';
export type SyncedPlaylist = {
  id: string;
  name: string;
  cover: string;
  tracks: Track[];
  origin: string;
  remote: true;
  syncedAt?: number;
  remoteCount?: number;
};
export const libraryKey = (provider: MusicAccountProvider, base: string, accountId: string) =>
  JSON.stringify([provider, accountBase(base), accountId]);
const memory = new Map<string, SyncedPlaylist[]>();
const cacheTimes = new Map<string, number>();
export const libraryCacheTime = (key: string) => cacheTimes.get(key) || 0;
export const LIBRARY_FRESH_MS = 5 * 60 * 1000;
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('wave-phone-music-library-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('libraries');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readLibrary(key: string): Promise<SyncedPlaylist[]> {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const db = await database();
    const result = await new Promise<any>((resolve, reject) => {
      const request = db.transaction('libraries').objectStore('libraries').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).finally(() => db.close());
    const stored = Array.isArray(result) ? result : result?.rows;
    cacheTimes.set(key, result?.version === 2 ? Number(result.syncedAt) || 0 : 0);
    const rows = Array.isArray(stored)
      ? stored.filter(row => row?.origin === key && row.remote === true && Array.isArray(row.tracks))
      : [];
    memory.set(key, rows);
    return rows;
  } catch {
    return [];
  }
}
export async function writeLibrary(key: string, rows: SyncedPlaylist[]): Promise<void> {
  memory.set(key, rows);
  const syncedAt = Date.now();
  cacheTimes.set(key, syncedAt);
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('libraries', 'readwrite');
      tx.objectStore('libraries').put({ version: 2, rows, syncedAt }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }).finally(() => db.close());
  } catch {
    /* The in-memory library remains available if browser storage is unavailable. */
  }
}
export async function synchronizeLibrary(
  provider: MusicAccountProvider,
  base: string,
  userId: string,
  previous: SyncedPlaylist[],
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
  api = { lists: fetchAccountPlaylists, tracks: fetchAccountTracks },
  force = false,
): Promise<{ rows: SyncedPlaylist[]; failed: number }> {
  const origin = libraryKey(provider, base, userId);
  const lists = new Map<string, AccountPlaylist>();
  let offset = 0;
  for (let page = 0; ; page++) {
    signal.throwIfAborted();
    if (page >= 200) throw Error('平台歌单分页异常，已保留已有歌单');
    const result = await api.lists(provider, base, userId, offset, signal);
    for (const list of result.lists) lists.set(list.id, list);
    if (!result.more) break;
    if (result.next <= offset) throw Error('平台歌单分页没有推进，已保留已有歌单');
    offset = result.next;
  }
  const source = [...lists.values()];
  const rows = new Array<SyncedPlaylist>(source.length);
  const previousById = new Map(previous.filter(row => row.origin === origin).map(row => [row.id, row]));
  let next = 0,
    done = 0,
    failed = 0;
  progress(0, source.length);
  async function worker() {
    while (next < source.length) {
      signal.throwIfAborted();
      const index = next++,
        list = source[index];
      const id = `account:${origin}:${list.id}`;
      const old = previousById.get(id);
      // A short freshness window avoids re-fetching unchanged lists during repeated opens.
      // Track counts alone are not a revision: expired and explicitly refreshed lists always read all pages.
      if (!force && old?.syncedAt && Date.now() - old.syncedAt < LIBRARY_FRESH_MS && old.remoteCount === list.count) {
        rows[index] = { ...old, name: list.name, cover: list.cover };
        progress(++done, source.length);
        continue;
      }
      try {
        const tracks = new Map<string, Track>();
        let offset = 0;
        for (let page = 0; ; page++) {
          signal.throwIfAborted();
          if (page >= 300) throw Error('歌曲分页异常');
          const result = await api.tracks(provider, base, list, offset, signal);
          for (const track of result.tracks)
            tracks.set(`${track.source}:${track.id}`, { ...track, url: '', lyric: '' });
          if (!result.more) break;
          if (result.next <= offset) throw Error('歌曲分页没有推进');
          offset = result.next;
        }
        rows[index] = {
          id,
          origin,
          remote: true,
          name: list.name,
          cover: list.cover,
          tracks: [...tracks.values()],
          syncedAt: Date.now(),
          remoteCount: list.count,
        };
      } catch (e) {
        signal.throwIfAborted();
        failed++;
        rows[index] = old || { id, origin, remote: true, name: list.name, cover: list.cover, tracks: [] };
      }
      progress(++done, source.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  await Promise.all([worker(), worker()]);
  signal.throwIfAborted();
  return { rows, failed };
}
export type PlaylistOverride = {
  name?: string;
  cover?: string;
  deleted?: boolean;
  removed?: string[];
  added?: Track[];
};
export function applyPlaylistOverride(row: SyncedPlaylist, edit: PlaylistOverride = {}): SyncedPlaylist | null {
  if (edit.deleted) return null;
  const removed = new Set(edit.removed || []);
  const tracks = new Map(
    row.tracks.filter(t => !removed.has(`${t.source}:${t.id}`)).map(t => [`${t.source}:${t.id}`, t]),
  );
  for (const track of edit.added || []) tracks.set(`${track.source}:${track.id}`, track);
  return { ...row, name: edit.name ?? row.name, cover: edit.cover ?? row.cover, tracks: [...tracks.values()] };
}
export async function readLibraryOverrides(key: string): Promise<Record<string, PlaylistOverride>> {
  try {
    const db = await database();
    return await new Promise<Record<string, PlaylistOverride>>((resolve, reject) => {
      const request = db.transaction('libraries').objectStore('libraries').get(`edits:${key}`);
      request.onsuccess = () => resolve(request.result || {});
      request.onerror = () => reject(request.error);
    }).finally(() => db.close());
  } catch {
    return {};
  }
}
let overrideWrite = Promise.resolve();
export function writeLibraryOverrides(key: string, edits: Record<string, PlaylistOverride>): Promise<void> {
  const snapshot = JSON.parse(JSON.stringify(edits));
  overrideWrite = overrideWrite
    .catch(() => {})
    .then(async () => {
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('libraries', 'readwrite');
        tx.objectStore('libraries').put(snapshot, `edits:${key}`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }).finally(() => db.close());
    });
  return overrideWrite;
}
