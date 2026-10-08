import { isBuiltinMusicBase } from './music-backend';
import type { Track } from './music';

export const accountProviders = [
  { id: 'netease', name: '网易云音乐', backend: 'NeteaseCloudMusicApi Enhanced' },
  { id: 'qq', name: 'QQ 音乐', backend: '@yakult-green-tea/qq-music-api 3.1+' },
  { id: 'kugou', name: '酷狗音乐', backend: 'KuGouMusicApi 1.6+' },
] as const;
export type MusicAccountProvider = (typeof accountProviders)[number]['id'];
export type MusicAccount = { id: string; name: string; avatar: string; membership: string };
export type AccountPlaylist = {
  id: string;
  name: string;
  cover: string;
  count: number;
  dirId?: number;
  owned?: boolean;
};
type Session = { cookie: string; userid?: string; profile?: MusicAccount };
const versions = new Map<string, number>();
const memory = new Map<string, Session>();
export function accountBase(value: string): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('请填写不含账号、查询参数的 HTTP(S) 服务地址');
  return url.href.replace(/\/$/, '');
}
const keyOf = (provider: MusicAccountProvider, base: string) =>
  `wave-phone-music-account-v1:${provider}:${accountBase(base)}`;
function read(provider: MusicAccountProvider, base: string): Session {
  const key = keyOf(provider, base);
  if (memory.has(key)) return memory.get(key)!;
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (value && typeof value.cookie === 'string') {
      memory.set(key, value);
      return value;
    }
  } catch {
    /* Storage may be unavailable; current session still works. */
  }
  return { cookie: '' };
}
function write(provider: MusicAccountProvider, base: string, session: Session) {
  const key = keyOf(provider, base);
  memory.set(key, session);
  try {
    localStorage.setItem(key, JSON.stringify(session));
  } catch {
    /* memory-only session */
  }
}
export function cachedMusicAccount(provider: MusicAccountProvider, base: string) {
  return base.trim() ? read(provider, base).profile : undefined;
}
export function clearMusicAccount(provider: MusicAccountProvider, base: string) {
  const key = keyOf(provider, base);
  versions.set(key, (versions.get(key) || 0) + 1);
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* already cleared in memory */
  }
  memory.set(key, { cookie: '' });
}
const safeUrl = (value: unknown) => {
  try {
    const url = new URL(String(value || '').replace('{size}', '240'));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};
const payload = (value: any) => value?.data ?? value?.body?.data ?? value?.body ?? value;
export class MusicAccountError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
async function request(
  provider: MusicAccountProvider,
  base: string,
  path: string,
  params: Record<string, string | number | boolean> = {},
  signal?: AbortSignal,
  deviceRetried = false,
): Promise<any> {
  const key = keyOf(provider, base),
    version = versions.get(key) || 0;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 20000);
  try {
    const url = new URL(accountBase(base) + path);
    url.searchParams.set('timestamp', String(Date.now()));
    const body = new URLSearchParams({ timestamp: String(Date.now()) });
    Object.entries(params).forEach(([name, value]) => body.set(name, String(value)));
    const cookie = read(provider, base).cookie;
    const headers: Record<string, string> = {};
    let method = 'POST';
    if (provider === 'qq') {
      method = 'GET';
      url.search = body.toString();
      const token = cookie.match(/(?:^|;)\s*qqmusic_session=([^;]+)/)?.[1];
      if (token) headers['X-QQ-Session'] = token;
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      if (cookie) body.set('cookie', cookie);
    }
    const builtin = isBuiltinMusicBase(base);
    if (builtin) {
      method = 'POST';
      if (cookie) body.set('cookie', cookie);
      Object.assign(headers, SillyTavern.getRequestHeaders());
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      delete headers['X-QQ-Session'];
      url.search = '';
    }
    const response = await fetch(url.href, {
      method,
      headers,
      body: method === 'POST' ? body : undefined,
      credentials: builtin ? 'same-origin' : 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok)
      throw new MusicAccountError(
        response.status === 401 ? '登录已失效，请重新扫码' : `音乐服务请求失败（${response.status}）`,
        response.status,
      );
    const raw = await response.json();
    if (controller.signal.aborted || (versions.get(key) || 0) !== version)
      throw new DOMException('已取消', 'AbortError');
    const result = raw?.body ?? raw;
    if (
      provider === 'kugou' &&
      Number(result?.error_code ?? result?.errcode) === 20028 &&
      !deviceRetried &&
      path !== '/register/dev'
    ) {
      const previous = read(provider, base);
      write(provider, base, {
        ...previous,
        cookie: previous.cookie
          .split(';')
          .filter(part => !/^\s*dfid=/i.test(part))
          .join(';'),
      });
      const device = await request(provider, base, '/register/dev', {}, controller.signal, true);
      captureSession(provider, base, device);
      return await request(provider, base, path, params, controller.signal, true);
    }
    if (provider === 'kugou' && Number(result?.error_code ?? result?.errcode) === 152)
      throw new MusicAccountError('登录已失效，请重新扫码', 401);
    if (!path.startsWith('/login/qr/')) {
      const code = Number(result?.code);
      if (code === 301 || code === 401) throw new MusicAccountError('登录已失效，请重新扫码', 401);
      if ((Number.isFinite(code) && ![0, 200].includes(code)) || (provider === 'kugou' && result?.status === 0))
        throw new MusicAccountError('音乐服务未能完成请求，请检查登录状态及接口版本');
    }
    return result;
  } catch (error) {
    if (error instanceof MusicAccountError || (error instanceof DOMException && error.name === 'AbortError'))
      throw error;
    throw new MusicAccountError('无法连接音乐服务，请检查地址、跨域设置和网络');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
function captureSession(provider: MusicAccountProvider, base: string, raw: any) {
  const data = payload(raw),
    previous = read(provider, base);
  const cookies = raw?.cookie || data?.cookie;
  const parts = new Map<string, string>();
  const strings = [previous.cookie, ...(Array.isArray(cookies) ? cookies : [cookies || ''])];
  for (const text of strings)
    for (const entry of String(text || '').split(';')) {
      const i = entry.indexOf('=');
      if (i > 0 && !/^(path|expires|max-age|samesite|domain)$/i.test(entry.slice(0, i).trim()))
        parts.set(entry.slice(0, i).trim(), entry.slice(i + 1).trim());
    }
  if (provider === 'kugou')
    for (const field of ['token', 'userid', 'dfid']) {
      const value = data?.[field] ?? (field === 'userid' ? data?.user_id : undefined);
      if (value) parts.set(field, String(value));
    }
  const cookie = [...parts].map(([k, v]) => `${k}=${v}`).join('; ');
  write(provider, base, { cookie, userid: parts.get('userid') || previous.userid });
}
export async function createMusicQr(
  provider: MusicAccountProvider,
  base: string,
  channel: string,
  signal?: AbortSignal,
) {
  const raw = await request(provider, base, '/login/qr/key', provider === 'qq' ? { channel } : {}, signal);
  if (provider === 'kugou') captureSession(provider, base, raw);
  const data = payload(raw);
  const key = String(data?.unikey || data?.qrcode || data?.qrkey || data?.key || data?.ticket || '');
  if (!key) throw new MusicAccountError('服务未返回登录二维码，请检查是否为支持扫码的接口');
  const imageData = payload(await request(provider, base, '/login/qr/create', { key, qrimg: true }, signal));
  const value = String(imageData?.qrimg || imageData?.base64 || imageData?.qrcode || imageData?.url || '');
  const image = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value) ? value : safeUrl(value);
  if (!image) throw new MusicAccountError('服务未返回有效的二维码图片');
  return { key, image };
}
export async function checkMusicQr(provider: MusicAccountProvider, base: string, key: string, signal?: AbortSignal) {
  const raw = await request(
    provider,
    base,
    '/login/qr/check',
    { key, ...(provider === 'kugou' ? { qrcode: key } : {}) },
    signal,
  );
  const data = payload(raw);
  const code = Number(provider === 'kugou' ? (data?.status ?? data?.code ?? raw?.status) : raw?.code);
  const confirmed = provider === 'kugou' ? code === 4 || Boolean(data?.token) : code === 803;
  if (confirmed) {
    const returnedCookie = Array.isArray(raw?.cookie || data?.cookie)
      ? (raw.cookie || data.cookie).join(';')
      : String(raw?.cookie || data?.cookie || '');
    const hasCredential =
      provider === 'kugou'
        ? Boolean(data?.token) || /(?:^|;)\s*token=[^;]+/.test(returnedCookie)
        : provider === 'qq'
          ? /(?:^|;)\s*qqmusic_session=[^;]+/.test(returnedCookie)
          : /(?:^|;)\s*MUSIC_U=[^;]+/.test(returnedCookie);
    if (!hasCredential) throw new MusicAccountError('服务未返回可保存的登录态，请检查接口版本');
    captureSession(provider, base, raw);
    if (!read(provider, base).cookie) throw new MusicAccountError('服务未返回可保存的登录态，请检查接口版本');
    return 'confirmed';
  }
  if (provider === 'kugou') {
    if (code === 0) return 'expired';
    if (code === 1) return 'waiting';
    if (code === 2 || code === 3) return 'scanned';
  } else {
    if (code === 800) return 'expired';
    if (code === 801) return 'waiting';
    if (code === 802) return 'scanned';
  }
  throw new MusicAccountError('扫码未完成，请重新获取二维码');
}
export async function logoutMusicAccount(provider: MusicAccountProvider, base: string) {
  const pending = request(provider, base, '/logout').catch(() => undefined);
  clearMusicAccount(provider, base);
  await pending;
}
function vipLabel(data: any): string {
  const flag = data?.vipType ?? data?.vip_type ?? data?.is_vip ?? data?.isVip;
  if (flag !== undefined) return Number(flag) > 0 ? '会员有效' : '普通账号';
  return '会员状态暂无法确认';
}
export async function refreshMusicAccount(
  provider: MusicAccountProvider,
  base: string,
  signal?: AbortSignal,
): Promise<MusicAccount> {
  if (!read(provider, base).cookie) throw new MusicAccountError('请先扫码登录', 401);
  const raw = await request(
    provider,
    base,
    provider === 'kugou' ? '/user/detail' : '/login/status',
    provider === 'kugou' ? { userid: read(provider, base).userid || '' } : {},
    signal,
  );
  const data = payload(raw),
    p = data?.profile || data?.user_info || data?.userinfo || (provider === 'kugou' ? data : null);
  if (!p) throw new MusicAccountError('登录已失效，请重新扫码', 401);
  const info = p.info || p;
  const id = String(
    p.userId ??
      p.id ??
      p.userid ??
      p.user_id ??
      p.str_musicid ??
      p.musicid ??
      p.uin ??
      info.str_musicid ??
      info.musicid ??
      info.uin ??
      read(provider, base).userid ??
      '',
  );
  const account: MusicAccount = {
    id,
    name: String(p.nickname || p.nick_name || p.username || info.nickname || info.nick || '已登录账号'),
    avatar: safeUrl(p.avatarUrl || p.avatar || p.pic || info.logo),
    membership: vipLabel({ ...info, ...p }),
  };
  if (provider !== 'qq') {
    try {
      const vip = payload(
        await request(
          provider,
          base,
          provider === 'netease' ? '/vip/info' : '/user/vip/detail',
          provider === 'netease' ? { uid: id } : { userid: id },
          signal,
        ),
      );
      if (provider === 'netease') {
        const entries = [vip?.musicPackage, vip?.associator, vip?.redplus, vip?.redVipLevel];
        if (entries.some(v => Number(v?.expireTime) > Date.now())) account.membership = '会员有效';
        else if (entries.some(v => v && typeof v === 'object' && 'expireTime' in v)) account.membership = '普通账号';
      } else {
        account.membership = vipLabel(vip);
        if (Array.isArray(vip?.busi_vip) && vip.busi_vip.some((v: any) => Number(v.is_vip ?? v.vip_type) > 0))
          account.membership = '会员有效';
      }
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof MusicAccountError && error.status === 401)
      )
        throw error;
    }
  }
  write(provider, base, { ...read(provider, base), profile: account });
  return account;
}
function rowsOf(raw: any): any[] {
  const data = payload(raw);
  if (Array.isArray(data)) return data;
  for (const key of ['playlist', 'playlists', 'songs', 'lists', 'list', 'info', 'data']) {
    if (Array.isArray(data?.[key])) return data[key];
    if (Array.isArray(data?.[key]?.info)) return data[key].info;
  }
  throw new MusicAccountError('服务没有返回有效列表，请检查接口版本');
}
export async function fetchAccountPlaylists(
  provider: MusicAccountProvider,
  base: string,
  userId: string,
  offset = 0,
  signal?: AbortSignal,
) {
  const raw = await request(
    provider,
    base,
    '/user/playlist',
    provider === 'netease'
      ? { uid: userId, limit: 50, offset }
      : provider === 'kugou'
        ? { userid: userId, pagesize: 50, page: Math.floor(offset / 50) + 1 }
        : {},
    signal,
  );
  const rows = rowsOf(raw);
  const lists: AccountPlaylist[] = rows
    .map(row => ({
      id: String(
        provider === 'netease'
          ? (row.id ?? '')
          : provider === 'qq'
            ? (row.tid ?? row.dissid ?? row.id ?? '')
            : (row.global_collection_id ?? row.globalCollectionId ?? row.specialid ?? row.id ?? ''),
      ),
      name: String(row.name || row.dirName || row.dissname || row.listname || row.specialname || '未命名歌单'),
      cover: safeUrl(row.coverImgUrl || row.bigpicUrl || row.picUrl || row.pic || row.img || row.image),
      count: Number(row.trackCount ?? row.songNum ?? row.songnum ?? row.count ?? row.song_count ?? 0),
      ...(row.dirId !== undefined ? { dirId: Number(row.dirId), owned: row.dirName !== undefined } : {}),
    }))
    .filter(row => row.id);
  return { lists, next: offset + rows.length, more: provider !== 'qq' && (raw.more === true || rows.length === 50) };
}
export function mapAccountTrack(row: any, provider: MusicAccountProvider, base: string): Track | null {
  row = row.songInfo || row;
  const id = String(
    provider === 'netease'
      ? row.id || ''
      : provider === 'qq'
        ? row.mid || row.songmid || ''
        : row.hash ||
          row.FileHash ||
          row.fileHash ||
          row.filehash ||
          row.audio_info?.hash ||
          row.audio_info?.hash_128 ||
          row.base?.hash ||
          '',
  );
  const title =
    row.name ||
    row.title ||
    row.songname ||
    row.song_name ||
    row.songname_original ||
    row.SongName ||
    row.ori_audio_name ||
    row.audio_name ||
    row.base?.songname ||
    row.filename ||
    row.FileName;
  if (!id || !title) return null;
  const artists = row.ar || row.artists || row.singer || row.authors || row.singerinfo || row.Singers;
  const artist = Array.isArray(artists)
    ? artists
        .map((a: any) => a.name || a.author_name)
        .filter(Boolean)
        .join(' / ')
    : row.author_name || row.singername || row.SingerName || '';
  const album = row.al || row.album || row.album_info || {};
  return {
    url: '',
    lyric: '',
    picId: '',
    id,
    title: String(title),
    artist: String(artist),
    album: String(album.name || row.album_name || ''),
    cover: safeUrl(
      album.picUrl ||
        row.cover ||
        row.img ||
        (album.mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${album.mid}.jpg` : ''),
    ),
    lyricId: id,
    source: `account-${provider}`,
    apiBase: accountBase(base),
  };
}
export async function fetchAccountTracks(
  provider: MusicAccountProvider,
  base: string,
  list: AccountPlaylist,
  offset = 0,
  signal?: AbortSignal,
) {
  let rows: any[],
    more = false;
  if (provider === 'qq' && !list.owned) {
    const raw = await request(provider, base, '/getSongListDetail', { disstid: list.id }, signal);
    const detail = raw.response?.cdlist?.[0];
    if (!Array.isArray(detail?.songlist)) throw new MusicAccountError('无法读取该歌单，可能为非公开歌单');
    rows = detail.songlist;
  } else {
    const path = provider === 'qq' ? '/user/playlist-detail' : '/playlist/track/all';
    const params: Record<string, string | number | boolean> =
      provider === 'qq'
        ? { tid: list.id, dirid: list.dirId || 0, offset, limit: 100 }
        : provider === 'netease'
          ? { id: list.id, limit: 100, offset }
          : { id: list.id, pagesize: 100, page: Math.floor(offset / 100) + 1 };
    const raw = await request(provider, base, path, params, signal);
    rows = rowsOf(raw);
    more = raw.more === true || rows.length === 100;
  }
  return {
    tracks: rows.map(row => mapAccountTrack(row, provider, base)).filter((t): t is Track => t !== null),
    next: offset + rows.length,
    more,
  };
}
export async function resolveAccountTrack(track: Track, signal?: AbortSignal): Promise<Track> {
  const provider = track.source.replace('account-', '') as MusicAccountProvider,
    base = track.apiBase || '';
  if (!accountProviders.some(p => p.id === provider) || !base) throw new MusicAccountError('音乐账号来源无效');
  if (!read(provider, base).cookie) throw new MusicAccountError('请先在音乐设置中登录对应平台', 401);
  const raw = await request(
    provider,
    base,
    provider === 'netease' ? '/song/url/v1' : provider === 'qq' ? '/getMusicPlay' : '/song/url',
    provider === 'netease'
      ? { id: track.id, level: 'exhigh' }
      : provider === 'qq'
        ? { songmid: track.id, quality: '320' }
        : { hash: track.id, quality: '320' },
    signal,
  );
  const data = payload(raw);
  const entry =
    provider === 'netease'
      ? data?.[0]
      : provider === 'qq'
        ? data?.playUrl?.[track.id] || Object.values(data?.playUrl || {})[0]
        : Array.isArray(data)
          ? data[0]
          : data;
  const candidate = entry?.url || entry?.play_url || entry?.playUrl;
  const url = safeUrl(Array.isArray(candidate) ? candidate[0] : candidate);
  if (!url) throw new MusicAccountError('该账号暂无此歌曲的播放权限或音源不可用');
  return { ...track, url };
}
