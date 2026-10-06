import { resolveClock, type SystemClockSettings } from './system-clock';

let liveClock: (() => Date | null) | undefined;
export function registerMessageClock(reader: () => Date | null): () => void {
  liveClock = reader;
  return () => {
    if (liveClock === reader) liveClock = undefined;
  };
}
export function messageClockTime(settings: SystemClockSettings): number {
  const live = liveClock?.();
  if (live) return live.getTime();
  const civil = resolveClock(settings, Date.now(), '');
  if (civil === null) return Date.now();
  const date = new Date(civil);
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ).getTime();
}

/** Match the phone's local civil display; do not expose ISO/UTC storage syntax. */
export function formatMessageDateTime(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll('-', '/');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
