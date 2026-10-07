import { z } from 'zod';

export const SystemClockSettingsSchema = z
  .object({
    source: z.enum(['timezone', 'custom', 'baibai', 'phone']).prefault('timezone'),
    timeZone: z.string().prefault('Asia/Shanghai'),
    customZone: z.string().prefault('Asia/Shanghai'),
    offsetMinutes: z.coerce.number().int().min(-720).max(840).prefault(480),
    storyInitialTime: z.string().prefault(''),
    customTime: z.string().prefault(''),
    customAnchor: z.number().prefault(0),
    customRunning: z.boolean().prefault(false),
  })
  .prefault({});
export type SystemClockSettings = z.infer<typeof SystemClockSettingsSchema>;

// A UTC-backed civil time avoids applying the computer's timezone to story dates.
export function parseCivilTime(text: string): number | null {
  const match = text
    .trim()
    .match(
      /^(\d{4})[/年-](\d{1,2})[/月-](\d{1,2})日?[ T\s]+(\d{1,2})[:：](\d{2})(?:[:：](\d{2}))?(?:\s*[（(]周[一二三四五六日天][)）])?$/,
    );
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(value => Number(value || 0));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
    ? date.getTime()
    : null;
}
export function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}
export function resolveClock(settings: SystemClockSettings, now: number, storyTime: string): number | null {
  if (settings.source === 'phone') return parseCivilTime(storyTime || settings.storyInitialTime);
  if (settings.source === 'baibai') return parseCivilTime(storyTime);
  if (settings.source === 'custom') {
    const time = parseCivilTime(settings.customTime);
    return time === null
      ? null
      : time + (settings.customRunning && settings.customAnchor ? now - settings.customAnchor : 0);
  }
  if (settings.timeZone === 'offset') return now + settings.offsetMinutes * 60000;
  const zone = settings.timeZone === 'iana' ? settings.customZone : settings.timeZone;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: validTimeZone(zone) ? zone : 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const field = (key: string) => parts.find(part => part.type === key)?.value;
  return parseCivilTime(
    `${field('year')}-${field('month')}-${field('day')} ${field('hour')}:${field('minute')}:${field('second')}`,
  );
}
export function clockLabels(time: number | null) {
  if (time === null) return { time: '--:--', date: '', full: '等待有效时间' };
  const date = new Date(time),
    pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const clock = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  return { time: clock, date: day, full: `${day} ${clock}（周${'日一二三四五六'[date.getUTCDay()]}）` };
}
export function readBaiBaiTime(document: Document): { text: string; element: Element } | null {
  const candidates = [...document.querySelectorAll('.bbs-state-val')].reverse();
  for (const element of candidates) {
    const label = element.closest('.bbs-state-item')?.querySelector('.bbs-state-key')?.textContent?.trim();
    if (label && label !== '时间') continue;
    const text = element.textContent?.trim() || '';
    if (parseCivilTime(text) !== null) return { text, element };
  }
  return null;
}
export function observeBaiBaiTime(host: Window, changed: () => void): () => void {
  const observer = new MutationObserver(records => {
    // Ignore the phone's own clock updates and unrelated chat mutations.
    if (
      records.some(record => {
        const target = record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement;
        return (
          target?.closest('.bbs-state') ||
          [...record.addedNodes, ...record.removedNodes].some(
            node =>
              node.nodeType === 1 &&
              ((node as Element).matches('.bbs-state, .bbs-state-val') ||
                (node as Element).querySelector('.bbs-state-val')),
          )
        );
      })
    )
      changed();
  });
  observer.observe(host.document.body, { childList: true, subtree: true, characterData: true });
  host.addEventListener('st-baibai-book:ready', changed);
  host.addEventListener('st-baibai-book:changed', changed);
  return () => {
    observer.disconnect();
    host.removeEventListener('st-baibai-book:ready', changed);
    host.removeEventListener('st-baibai-book:changed', changed);
  };
}
