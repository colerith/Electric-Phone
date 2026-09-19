import { z } from 'zod';
import { fetchJson, fetchText } from '../core/network';
import { safeBrowserUrl } from '../apps/browser';
export const MusicTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  cover: z.string(),
  url: z.string().prefault(''),
  lyric: z.string().prefault(''),
  picId: z.string().prefault(''),
  lyricId: z.string(),
  source: z.string(),
  apiBase: z.string().optional(),
  mediaUrl: z.string().optional(),
  lyricUrl: z.string().optional(),
  songMid: z.string().optional(),
});
export type Track = z.infer<typeof MusicTrackSchema>;
export const defaultMusicApi = 'https://api.vkeys.cn/v2/music';
export const musicProviders = [
  { id: 'gd-netease', label: 'GDStudio · 网易云', base: 'https://music-api.gdstudio.xyz/api.php', platform: 'netease' },
  { id: 'vkeys-tencent', label: 'VKeys · QQ 音乐', base: 'https://api.vkeys.cn/v2/music', platform: 'tencent' },
  { id: 'vkeys-netease', label: 'VKeys · 网易云', base: 'https://api.vkeys.cn/v2/music', platform: 'netease' },
  { id: 'meting-kugou', label: 'Meting · 酷狗', base: 'https://api.i-meto.com/meting/api', platform: 'kugou' },
];
export const musicPlatform = (source: string) => musicProviders.find(p => p.id === source)?.platform || source;
export const musicSourceLabel = (source: string) =>
  musicProviders.find(p => p.id === source)?.label ||
  ({ netease: '网易云', tencent: 'QQ 音乐', daily: '精选' } as Record<string, string>)[source] ||
  source;
export type SearchProgress = (tracks: Track[], status: string) => void;
function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
}
export async function searchMusic(
  query: string,
  base: string,
  source: string,
  signal?: AbortSignal,
  progress?: SearchProgress,
): Promise<Track[]> {
  const providers = source === 'aggregate' ? musicProviders : musicProviders.filter(p => p.id === source);
  if (!providers.length) return searchSingle(query, base, source, signal);
  const result: Track[] = [],
    states: string[] = [];
  let succeeded = 0;
  for (const provider of providers) {
    abortIfNeeded(signal);
    progress?.([...result], `正在查询 ${provider.label}（${states.length + 1}/${providers.length}）`);
    try {
      const rows =
        provider.id === 'meting-kugou'
          ? await searchMeting(query, signal)
          : await searchSingle(query, provider.base, provider.platform, signal);
      abortIfNeeded(signal);
      const mapped = rows.slice(0, 5).map(track => ({ ...track, source: provider.id, apiBase: provider.base }));
      result.push(...mapped);
      succeeded++;
      states.push(`${provider.label} ${mapped.length} 首`);
    } catch (error) {
      abortIfNeeded(signal);
      states.push(`${provider.label} 暂不可用`);
    }
    progress?.([...result], states.join(' · '));
  }
  if (!succeeded) throw new Error('所有选定音源暂不可用，请稍后重试或切换音源');
  return result;
}
function metingRows(data: any): any[] {
  return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : data?.url ? [data] : [];
}
function metingTrack(row: any): Track | null {
  const media = safeBrowserUrl(String(row.url || ''));
  let id = String(row.id || row.hash || '');
  if (!id && media) id = new URL(media).searchParams.get('id') || '';
  const title = row.name || row.title;
  if (!title || (!id && !media)) return null;
  return MusicTrackSchema.parse({
    id: id || media,
    title: String(title),
    artist: Array.isArray(row.artist) ? row.artist.join(' / ') : String(row.artist || row.author || ''),
    album: String(row.album || ''),
    cover: safeBrowserUrl(String(row.cover || row.pic || '')),
    lyricId: id,
    source: 'meting-kugou',
    mediaUrl: media,
    lyricUrl: safeBrowserUrl(String(row.lrc || row.lyric || '')),
    lyric: typeof row.lrc === 'string' && row.lrc.startsWith('[') ? row.lrc : '',
  });
}
async function searchMeting(query: string, signal?: AbortSignal): Promise<Track[]> {
  const data = await fetchJson(apiUrl(musicProviders[3].base, { server: 'kugou', type: 'search', id: query }), signal);
  if (!Array.isArray(data) && !Array.isArray(data?.data)) throw new Error('酷狗音源未返回歌曲列表');
  return metingRows(data)
    .map(metingTrack)
    .filter((track): track is Track => track !== null);
}
async function resolveMeting(track: Track, signal?: AbortSignal): Promise<Track> {
  let found: Track | null = null;
  if (!safeBrowserUrl(track.id)) {
    const data = await fetchJson(
      apiUrl(musicProviders[3].base, { server: 'kugou', type: 'song', id: track.id }),
      signal,
    );
    found =
      metingRows(data)
        .map(metingTrack)
        .find(row => row !== null) || null;
  }
  const url = safeBrowserUrl(found?.mediaUrl || track.mediaUrl || '');
  if (!url) throw new Error('这首歌暂无可播放音源');
  let lyric = found?.lyric || track.lyric;
  const lyricUrl = found?.lyricUrl || track.lyricUrl;
  if (!lyric && lyricUrl) {
    try {
      lyric = await fetchText(lyricUrl, signal);
    } catch {
      /* optional lyrics */
    }
  }
  abortIfNeeded(signal);
  return { ...track, url, lyric, cover: found?.cover || track.cover, mediaUrl: url, lyricUrl };
}
export function musicIntent(raw: string): { title: string; artist: string; note: string } {
  try {
    const data = JSON.parse(raw);
    if (data.title)
      return { title: String(data.title), artist: String(data.artist || ''), note: String(data.note || '') };
  } catch {
    /* legacy text */
  }
  const field = (name: string) => raw.match(new RegExp(`(?:^|\\n)\\s*${name}[：:]\\s*([^\\n]+)`))?.[1]?.trim() || '';
  return { title: field('歌曲名称'), artist: field('歌手名称'), note: field('听歌感想') || field('推荐理由') };
}
export function parseLrc(raw: string): Array<{ time: number; text: string }> {
  const offset = Number(raw.match(/\[offset:([+-]?\d+)\]/)?.[1] || 0) / 1000;
  return raw
    .split(/\r?\n/)
    .flatMap(line =>
      [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)].map(match => ({
        time: Math.max(0, Number(match[1]) * 60 + Number(match[2]) + offset),
        text: line.replace(/\[[^\]]*\]/g, '').trim(),
      })),
    )
    .filter(row => row.text)
    .sort((a, b) => a.time - b.time);
}
function apiUrl(base: string, params: Record<string, string>): string {
  const url = new URL(safeBrowserUrl(base));
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.href;
}
async function searchSingle(query: string, base: string, source: string, signal?: AbortSignal): Promise<Track[]> {
  if (base.includes('/v2/music')) {
    const endpoint = `${base.replace(/\/$/, '')}/${source}`;
    const data = await fetchJson(apiUrl(endpoint, { word: query }), signal);
    if (!Array.isArray(data.data)) throw new Error('音源未返回有效歌曲列表');
    return data.data
      .filter((row: any) => row.id && row.song)
      .map((row: any) => ({
        id: String(row.id),
        title: String(row.song),
        artist: String(row.singer || ''),
        album: String(row.album || ''),
        cover: safeBrowserUrl(String(row.cover || '')),
        url: '',
        lyric: '',
        picId: '',
        lyricId: String(row.id),
        songMid: String(row.mid || ''),
        apiBase: base,
        source,
      }));
  }
  const data = await fetchJson(apiUrl(base, { types: 'search', source, name: query, count: '5', pages: '1' }), signal);
  if (!Array.isArray(data)) throw new Error('音源未返回有效歌曲列表');
  return data
    .filter(row => row.id && row.name)
    .map(row => ({
      id: String(row.id),
      title: String(row.name),
      artist: Array.isArray(row.artist) ? row.artist.join(' / ') : String(row.artist || ''),
      album: String(row.album || ''),
      cover: safeBrowserUrl(String(row.pic || '')),
      url: '',
      lyric: '',
      picId: String(row.pic_id || ''),
      lyricId: String(row.lyric_id || row.id),
      source: String(row.source || source),
      apiBase: base,
    }));
}
export async function resolveTrack(track: Track, base: string, signal?: AbortSignal): Promise<Track> {
  if (track.source === 'meting-kugou') return resolveMeting(track, signal);
  const provider = musicProviders.find(p => p.id === track.source);
  const result = await resolveSingle(
    { ...track, source: provider?.platform || track.source },
    track.apiBase || provider?.base || base,
    signal,
  );
  return { ...result, source: track.source, apiBase: track.apiBase || provider?.base || base };
}
async function resolveSingle(track: Track, base: string, signal?: AbortSignal): Promise<Track> {
  if (base.includes('/v2/music')) {
    const data = await fetchJson(apiUrl(`${base.replace(/\/$/, '')}/${track.source}`, { id: track.id }), signal);
    const item = data.data;
    const url = safeBrowserUrl(String(item?.url || ''));
    if (!url) throw new Error('这首歌暂无可播放音源，请选择其他版本');
    const lyricValue = typeof (item.lyric || item.lrc) === 'string' ? item.lyric || item.lrc : '';
    let lyric = !safeBrowserUrl(lyricValue) ? lyricValue : '';
    if (safeBrowserUrl(lyricValue)) {
      try {
        lyric = await fetchText(lyricValue, signal);
      } catch {
        /* optional lyrics */
      }
    }
    if (!lyric) {
      try {
        const rows = await fetchJson(
          apiUrl('https://lrclib.net/api/search', { track_name: track.title, artist_name: track.artist }),
          signal,
        );
        const match = Array.isArray(rows)
          ? rows.find(
              row =>
                row.trackName?.toLowerCase() === track.title.toLowerCase() &&
                row.artistName?.toLowerCase() === track.artist.toLowerCase(),
            )
          : null;
        lyric = match?.syncedLyrics || '';
      } catch {
        /* optional lyrics */
      }
    }
    return { ...track, url, cover: safeBrowserUrl(String(item.cover || track.cover)), lyric };
  }
  const get = (types: string, id: string) =>
    fetchJson(apiUrl(base, { types, source: track.source, id, size: '500', br: '320' }), signal);
  const [audio, lyric, pic] = await Promise.allSettled([
    get('url', track.id),
    get('lyric', track.lyricId),
    track.cover ? Promise.resolve({ url: track.cover }) : get('pic', track.picId),
  ]);
  const url = audio.status === 'fulfilled' ? safeBrowserUrl(String(audio.value.url || '')) : '';
  if (!url) throw new Error('这首歌暂时没有可播放音源，请选择其他版本或切换音源');
  return {
    ...track,
    url,
    lyric: lyric.status === 'fulfilled' ? String(lyric.value.lyric || '') : '',
    cover: pic.status === 'fulfilled' ? safeBrowserUrl(String(pic.value.url || '')) : track.cover,
  };
}
