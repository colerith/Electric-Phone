import * as OpenCC from 'opencc-js/t2cn';
import { fetchJson } from '../core/network';
import { MusicTrackSchema, musicPlatform, type Track } from './music';
const convert = OpenCC.Converter({ from: 't', to: 'cn' });
export const simplifyLyrics = (text: string) => convert(text);
const endpoint = (base: string, path: string, params: Record<string, string> = {}) => {
  const url = new URL(base.replace(/\/$/, '') + path);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('请输入 HTTP(S) 接口地址');
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
};
const coverUrl = (value: string) => (/^https?:\/\//.test(value) ? value.replace(/^http:/, 'https:') : '');
export function mapDiscovery(rows: any[], source: string): Track[] {
  return rows.slice(0, 30).flatMap(raw => {
    const row = raw.song || raw;
    const title = row.name || row.title || row.songname;
    const id = source === 'netease' ? row.id : row.mid || row.songmid;
    if (!id || !title) return [];
    const album = row.al || row.album || {};
    return [
      MusicTrackSchema.parse({
        id: String(id),
        title,
        artist: (row.ar || row.artists || row.singer || []).map((a: any) => a.name).join(' / '),
        album: album.name || row.albumname || '',
        cover: coverUrl(
          raw.picUrl ||
            album.picUrl ||
            (source === 'tencent' && (album.mid || row.albummid)
              ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${album.mid || row.albummid}.jpg`
              : ''),
        ),
        lyricId: String(id),
        source,
      }),
    ];
  });
}
export async function fetchRecommendations(
  source: string,
  netease: string,
  qq: string,
  signal?: AbortSignal,
  personalized = false,
) {
  source = musicPlatform(source) === 'tencent' ? 'tencent' : 'netease';
  const base = source === 'tencent' ? qq : netease;
  if (!base.trim()) throw new Error('未配置推荐服务');
  if (personalized)
    try {
      const data = await fetchJson(
        endpoint(base, source === 'tencent' ? '/recommend/daily' : '/recommend/songs'),
        signal,
        'include',
      );
      const rows = source === 'tencent' ? data.data?.songlist : data.data?.dailySongs || data.recommend;
      if (Array.isArray(rows) && rows.length) return { tracks: mapDiscovery(rows, source), label: '今日推荐' };
    } catch {
      if (signal?.aborted) throw new Error('已取消');
    }
  const data = await fetchJson(endpoint(base, source === 'tencent' ? '/new/songs' : '/personalized/newsong'), signal);
  const rows = source === 'tencent' ? data.data?.list : data.result;
  const tracks = mapDiscovery(Array.isArray(rows) ? rows : [], source);
  if (!tracks.length) throw new Error('推荐列表为空');
  return { tracks, label: source === 'tencent' ? 'QQ 音乐 · 新歌精选' : '网易云 · 新歌精选' };
}
export async function extraLyrics(track: Track, netease: string, qq: string, signal?: AbortSignal): Promise<string> {
  track = { ...track, source: musicPlatform(track.source) };
  const base = track.source === 'tencent' ? qq : netease;
  if (!base || !['netease', 'tencent'].includes(track.source)) return '';
  try {
    const data = await fetchJson(
      endpoint(base, '/lyric', track.source === 'tencent' ? { songmid: track.songMid || track.id } : { id: track.id }),
      signal,
    );
    const value = track.source === 'tencent' ? data.data?.lyric : data.lrc?.lyric;
    return typeof value === 'string' && /\[\d+:\d+/.test(value) ? value : '';
  } catch {
    return '';
  }
}
