import { musicBackend, checkMusicBackend } from './music-backend';
export function ttmlToLrc(xml: string, track: 'original' | 'translation' | 'romanization' = 'original'): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return '';
  const time = (value: string) => {
    if (/^\d+(?:\.\d+)?ms$/.test(value)) return parseFloat(value) / 1000;
    if (/^\d+(?:\.\d+)?s$/.test(value)) return parseFloat(value);
    if (!/^\d+(?::\d+){1,2}(?:\.\d+)?$/.test(value)) return NaN;
    return value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
  };
  const rows: { at: number; text: string }[] = [];
  for (const paragraph of [...doc.getElementsByTagNameNS('*', 'p')]) {
    const begin = paragraph.getAttribute('begin') || paragraph.querySelector('[begin]')?.getAttribute('begin') || '';
    const at = time(begin);
    const alternate: string[] = [];
    for (const child of [...paragraph.getElementsByTagNameNS('*', 'span')]) {
      const role = child.getAttribute('ttm:role') || child.getAttribute('role') || '';
      if (track !== 'original' && role.includes(track)) alternate.push(child.textContent || '');
      if (/translation|roman|x-bg/.test(role)) child.remove();
    }
    const text = (track === 'original' ? paragraph.textContent || '' : alternate.join(' ')).replace(/\s+/g, ' ').trim();
    if (Number.isFinite(at) && at >= 0 && text) rows.push({ at, text });
  }
  return rows
    .sort((a, b) => a.at - b.at)
    .map(
      row =>
        `[${String(Math.floor(row.at / 60)).padStart(2, '0')}:${(row.at % 60).toFixed(2).padStart(5, '0')}]${row.text}`,
    )
    .join('\n');
}
export async function fetchBuiltinLyricTracks(
  track: { id: string; source: string; title: string; artist: string },
  signal?: AbortSignal,
  alternates = false,
): Promise<{ lyric: string; translation: string; romanization: string }> {
  const empty = { lyric: '', translation: '', romanization: '' };
  if (musicBackend.value === 'idle') await checkMusicBackend();
  if (musicBackend.value !== 'ready' || signal?.aborted) return empty;
  let source = track.source.replace(/^(account-|builtin-|gd-|vkeys-|meting-)/, '');
  if (source === 'tencent') source = 'qq';
  if (!['netease', 'qq', 'kugou'].includes(source)) source = 'other';
  const response = await fetch('/api/plugins/electric-phone-music/lyrics', {
    method: 'POST',
    credentials: 'same-origin',
    headers: SillyTavern.getRequestHeaders(),
    body: JSON.stringify({
      source,
      alternates,
      id: track.id.slice(0, 200),
      title: track.title.slice(0, 200),
      artist: track.artist.slice(0, 200),
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  });
  if (!response.ok) return empty;
  const result = await response.json();
  if (signal?.aborted || typeof result.lyric !== 'string') return empty;
  return result.format === 'ttml'
    ? {
        lyric: ttmlToLrc(result.lyric),
        translation: ttmlToLrc(result.lyric, 'translation'),
        romanization: ttmlToLrc(result.lyric, 'romanization'),
      }
    : {
        lyric: result.lyric,
        translation: typeof result.translation === 'string' ? result.translation : '',
        romanization: typeof result.romanization === 'string' ? result.romanization : '',
      };
}

export async function fetchBuiltinLyrics(
  track: { id: string; source: string; title: string; artist: string },
  signal?: AbortSignal,
): Promise<string> {
  return (await fetchBuiltinLyricTracks(track, signal)).lyric;
}
